import Gio from 'gi://Gio';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = path => new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]);
const source = path => read(path).replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/export (class|const)/g, '$1').replaceAll('import.meta.url', '"file:///test"');
let nextId = 1;
const timers = new Map();
const GLib = {
    PRIORITY_DEFAULT: 0, SOURCE_REMOVE: false, SOURCE_CONTINUE: true,
    timeout_add(_priority, delay, callback) {
        const id = nextId++;
        timers.set(id, {delay, callback});
        return id;
    },
    source_remove(id) { timers.delete(id); },
};
class Emitter {
    constructor() { this.handlers = new Map(); }
    connect(signal, callback) {
        const id = nextId++;
        this.handlers.set(id, {signal, callback});
        return id;
    }
    disconnect(id) {
        assert(this.handlers.has(id), 'Only owned live signals may be disconnected');
        this.handlers.delete(id);
    }
    emit(signal, ...args) {
        for (const [id, handler] of [...this.handlers]) {
            if (handler.signal === signal && this.handlers.has(id))
                handler.callback(this, ...args);
        }
    }
}
class GlobalSignalsHandler {
    constructor() { this.handlers = []; }
    add(...signals) {
        for (const [emitter, name, callback] of signals)
            this.handlers.push([emitter, emitter.connect(name, callback)]);
    }
    destroy() {
        for (const [emitter, id] of this.handlers) emitter.disconnect(id);
        this.handlers = [];
    }
}
const display = new Emitter();
const monitorManager = new Emitter();
const messageTray = new Emitter();
const tracker = new Emitter();
tracker.get_window_app = () => 'test-app';
tracker.focus_app = null;
let windows = [];
globalThis.global = {
    display,
    get_window_actors: () => windows,
    workspace_manager: {get_active_workspace_index: () => 0},
};
const Intellihide = new Function('GLib', 'Meta', 'Shell', 'Main', 'Signals', 'Convenience',
    source('intellihide.js') + '\nreturn Intellihide;')(
    GLib,
    {WindowType: {NORMAL: 0, DOCK: 1, DIALOG: 2, MODAL_DIALOG: 3, TOOLBAR: 4,
        MENU: 5, UTILITY: 6, SPLASHSCREEN: 7}},
    {WindowTracker: {get_default: () => tracker}},
    {messageTray}, {EventEmitter: Emitter},
    {GlobalSignalsHandler, getMonitorManager: () => monitorManager});
function actor(monitor = 0) {
    const wa = new Emitter();
    wa.get_meta_window = () => ({
        get_monitor: () => monitor,
        get_window_type: () => 0,
        get_gtk_application_id: () => 'test-app',
        get_wm_class: () => 'Test',
        get_workspace: () => ({index: () => 0}),
        showing_on_its_workspace: () => true,
        get_frame_rect: () => ({x: monitor * 1920, y: 0, width: 1920, height: 1200}),
    });
    return wa;
}
const settings = {get_boolean: () => false};
let m = new Intellihide(settings, 0);
let wa = actor();
m._windowCreated(display, {get_compositor_private: () => wa});
assert(wa.handlers.size === 0 && m._trackedWindows.size === 0,
    'Window creation while disabled must not attach signals');
windows = [wa];
m.updateTargetBox({x1: 0, x2: 1920, y1: 0, y2: 32});
m.enable();
m.enable();
m.enable();
m._windowCreated(display, {get_compositor_private: () => wa});
assert(wa.handlers.size === 2 && m._trackedWindows.size === 1,
    'Repeated enable and window-created must own exactly one allocation/destroy pair');
m._windowCreated(display, null);
m._windowCreated(display, {get_compositor_private: () => null});
assert(!m._handledWindow(null), 'A missing compositor actor must be ignored');
wa.emit('notify::allocation');
wa.emit('notify::allocation');
assert(timers.size === 1 && m._checkOverlapTimeoutContinue,
    'Allocation bursts share one overlap timer');
m.disable();
assert(wa.handlers.size === 0 && m._trackedWindows.size === 0 && timers.size === 0 &&
    !m._checkOverlapTimeoutContinue, 'Disable releases both window signals and complete timer state');
m.enable();
assert(wa.handlers.size === 2, 'Reenable attaches one fresh pair');
wa.emit('destroy');
assert(wa.handlers.size === 0 && m._trackedWindows.size === 0,
    'Destroyed actor releases both owned signals without stale map entries');
windows = [];
m.destroy();
m.destroy();
m.enable();
assert(!m._isEnabled && timers.size === 0 && display.handlers.size === 0 &&
    tracker.handlers.size === 0 && monitorManager.handlers.size === 0 && messageTray.handlers.size === 0,
    'Destroy is idempotent, disconnects global signals, and cannot be reenabled');

wa = actor(1);
windows = [wa];
m = new Intellihide(settings, 0);
m.updateTargetBox({x1: 1920, x2: 3840, y1: 0, y2: 32});
m.enable();
assert(!m.getOverlapStatus(), 'No top window exists on the original monitor');
let changes = 0;
m.connect('status-changed', () => changes++);
m.setMonitorIndex(1);
assert(m.getOverlapStatus() && changes === 1,
    'Changing primary monitor immediately checks windows on the new monitor');
m.setMonitorIndex(1);
assert(changes === 1, 'Unchanged monitor does not emit redundant status');
m.disable();
m.setMonitorIndex(0);
assert(!m.getOverlapStatus() && timers.size === 0,
    'Changing monitor while disabled does not start overlap work');
m.destroy();

windows = [actor()];
m = new Intellihide(settings, 0);
m.updateTargetBox({x1: 0, x2: 1920, y1: 0, y2: 32});
m.enable();
m.connect('status-changed', () => m.disable());
m._status = -1;
m._checkOverlap();
assert(!m._isEnabled && timers.size === 0,
    'A status listener disabling synchronously must not leave a new timer behind');
m.destroy();

const extensionManager = new Emitter();
const received = [];
const receiver = {state: 1, stateObj: {DesktopIconsUsableArea: {
    uuid: '130cbc66-235c-4bd6-8571-98d2d8bba5e2',
    setMarginsForExtension(uuid, margins) { received.push({uuid, margins}); },
}}};
extensionManager.getUuids = () => ['desktop-icons'];
extensionManager.lookup = () => receiver;
const Area = new Function('GLib', 'Main', 'ExtensionUtils', 'Extension',
    source('desktopIconsIntegration.js') + '\nreturn DesktopIconsUsableAreaClass;')(
    GLib, {extensionManager}, {ExtensionState: {ENABLED: 1, ACTIVE: 1}},
    {lookupByURL: () => ({uuid: 'hide-top-bar@whitehades.github.io'})});
let area = new Area();
area.setMargins(-1, 32, 0, 0, 0);
area.resetMargins();
area.setMargins(-1, 40, 0, 0, 0);
assert(timers.size === 1, 'Margin changes are coalesced');
const [timerId, pending] = [...timers][0];
timers.delete(timerId);
pending.callback();
assert(received.length === 1 && received[0].margins[-1].top === 40,
    'Pending update sends the latest margins once');
area.setMargins(-1, 48, 0, 0, 0);
area.destroy();
assert(timers.size === 0 && extensionManager.handlers.size === 0,
    'Desktop integration destroy must leave no pending timer or signal');
assert(received.length === 2 && received[1].margins === null,
    'Desktop margin contribution is cleared synchronously during destroy');
assert(area._extensionManager === null && area._UUID === null,
    'Desktop integration releases extension references');
area.destroy();
area.resetMargins();
area.setMargins(-1, 50, 0, 0, 0);
assert(received.length === 2 && timers.size === 0,
    'Repeated destroy or late updates cannot reschedule work');
print('PASS: Intellihide signal ownership, repeated enable, disabled/null windows, timers, monitor changes; synchronous desktop margin cleanup');
