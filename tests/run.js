import Gio from 'gi://Gio';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const read = p => new TextDecoder().decode(Gio.File.new_for_path(p).load_contents(null)[1]);
let now = 0;
let nextId = 1;
let pointer;
let timers;
let watches;
let animations;
let transition;
const GLib = {
    PRIORITY_DEFAULT: 0,
    SOURCE_REMOVE: false,
    timeout_add(_priority, delay, callback) {
        const id = nextId++;
        timers.set(id, {at: now + delay, callback});
        return id;
    },
    source_remove(id) { timers.delete(id); },
};
const panel = {
    x: 0, y: 200, translation_y: 0, width: 1920, height: 32, visible: true,
    get_pivot_point: () => [0, 0],
    remove_all_transitions() {
        if (!transition) return;
        this.translation_y = currentTranslation();
        timers.delete(transition.id);
        transition = null;
    },
    ease(params) {
        animations++;
        if (!params.duration) {
            this.translation_y = params.translation_y;
            params.onComplete?.();
            return;
        }
        const pending = {start: now, end: now + params.duration,
            from: this.translation_y, to: params.translation_y, onComplete: params.onComplete};
        pending.id = GLib.timeout_add(0, params.duration, () => {
            this.translation_y = pending.to;
            transition = null;
            pending.onComplete?.();
        });
        transition = pending;
    },
    hide() { this.visible = false; },
    show() { this.visible = true; },
};
function currentTranslation() {
    if (!transition) return panel.translation_y;
    const ratio = Math.min(1, (now - transition.start) / (transition.end - transition.start));
    return transition.from + (transition.to - transition.from) * ratio;
}
function advance(milliseconds) {
    const until = now + milliseconds;
    for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= until)
            .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        panel.translation_y = currentTranslation();
        timers.delete(due[0]);
        due[1].callback();
    }
    now = until;
    panel.translation_y = currentTranslation();
}
const Main = {
    messageTray: {_bannerBin: {}},
    layoutManager: {panelBox: panel, primaryMonitor: {y: 200}, hotCorners: [], primaryIndex: 0,
        removeChrome() {}, addChrome() {}},
    overview: {visible: false, _overview: {_controls: {_searchEntryBin: null}}},
    panel: {menuManager: {activeMenu: null}},
    wm: {removeKeybinding() {}},
};
const code = read('panelVisibilityManager.js').replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export class', 'class');
const Manager = new Function('Main', 'Config', 'Shell', 'Convenience', 'Clutter', 'GLib', 'Layout', 'Meta',
    code + '\nreturn PanelVisibilityManager;')(
    Main, {PACKAGE_VERSION: '50'}, {ActionMode: {NORMAL: 1}}, {DEBUG() {}},
    {AnimationMode: {EASE_OUT_QUAD: 1}}, GLib,
    {PressureBarrier: class {
        connect(_signal, callback) { this.trigger = callback; }
        addBarrier() {}
    }}, {Barrier: class {}, BarrierDirection: {POSITIVE_Y: 1}});
globalThis.global = {get_pointer: () => pointer};
function fixture() {
    now = 0; timers = new Map(); watches = new Set(); animations = 0; transition = null;
    pointer = [50, 210];
    Object.assign(panel, {x: 0, y: 200, translation_y: 0, width: 1920, height: 32, visible: true});
    Main.layoutManager.hotCorners = [];
    Main.layoutManager.primaryIndex = 0;
    Main.overview.visible = false;
    Main.panel.menuManager.activeMenu = null;
    const m = Object.create(Manager.prototype);
    Object.assign(m, {
        _base_y: 200, _animationSerial: 0, _animationActive: false,
        _targetVisible: null, _hideTimeoutId: 0, _destroyed: false,
        _settings: {get_boolean: () => false, get_double: () => 0.2},
        _staticBox: {init_rect(x, y, width, height) {
            Object.assign(this, {x1: x, x2: x + width, y1: y, y2: y + height});
        }},
        _intellihide: {updateTargetBox() {}, destroy() {}},
        _desktopIconsUsableArea: {resetMargins() {}, setMargins() {}, destroy() {}},
        _signalsHandler: {destroy() {}},
        _updateHotCorner() {},
        _pointerWatcher: {
            addWatch(_interval, callback) {
                const watch = {callback}; watches.add(watch); return watch;
            },
            _removeWatch(watch) { watches.delete(watch); },
        },
    });
    m._updateStaticBox();
    return m;
}
function move(m, x, y) {
    pointer = [x, y];
    m._handlePointer(x, y);
}
let m = fixture();
m.hide(0, 'init');
assert(panel.y + panel.translation_y === 168 && panel.y === 200 && !panel.visible, 'Hide uses nonzero monitor origin');
const once = animations;
m.hide(0, 'init');
assert(animations === once, 'Repeated hide must not restart animation');
m.show(0.2, 'mouse-enter');
advance(50);
move(m, 50, 245);
// Clutter's panel leave-event also runs while its actor is moving.
m._handleMenus();
assert(m._targetVisible && m._hideTimeoutId, 'Brief leave must defer hide during reveal');
assert(watches.size === 1, 'Pointer tracking starts during reveal');
advance(50);
move(m, 50, 210);
advance(300);
assert(panel.visible && panel.y === 200 && panel.translation_y === 0 && animations === once + 1,
    'Leave/reentry during reveal must not produce down/up/down flicker');
assert(watches.size === 1 && timers.size === 0, 'Settled reveal has one watch and no hide timer');

move(m, 50, 245);
const pendingHide = m._hideTimeoutId;
m._handleMenus();
assert(m._hideTimeoutId === pendingHide, 'Repeated leaves share one pending timer');
pointer = [50, 210];
m.show(0.2, 'mouse-enter');
assert(!m._hideTimeoutId, 'Even duplicate pressure reveal cancels pending hide');
advance(200);
assert(panel.visible && panel.y === 200 && panel.translation_y === 0, 'Cancelled hide cannot run later');

move(m, 50, 245);
advance(150);
assert(m._targetVisible === false && m._animationActive && watches.size === 1,
    'Sustained leave starts hiding but retains pointer tracking');
advance(70);
const middleY = panel.y + panel.translation_y;
const obsoleteCompletion = transition.onComplete;
move(m, 50, 210);
assert(m._targetVisible && panel.y + panel.translation_y === middleY, 'Reentry reverses from the current position');
obsoleteCompletion();
assert(panel.visible && m._animationActive, 'Obsolete completion cannot hide reversed reveal');
advance(200);
assert(panel.y === 200 && panel.translation_y === 0 && watches.size === 1, 'Reversed reveal finishes fully visible');

move(m, 50, 245);
// A menu may open after the exit timer has started.
let menuCallback;
let disconnects = 0;
const menu = {
    connect(_signal, callback) { menuCallback = callback; return 10; },
    disconnect() { disconnects++; },
};
Main.panel.menuManager.activeMenu = menu;
advance(150);
assert(m._targetVisible && !m._hideTimeoutId && menuCallback,
    'Open menu at deadline must keep panel visible and subscribe to closure');
Main.panel.menuManager.activeMenu = null;
menuCallback(menu, false);
advance(350);
assert(!panel.visible && watches.size === 0 && disconnects === 1,
    'Closing menu while outside hides once and releases pointer watch');

m = fixture();
m.show(0, 'mouse-enter');
// Cached overlap bounds deliberately stay at 32px after a font/theme resize.
panel.height = 48;
move(m, 50, 242);
assert(!m._hideTimeoutId && m._isHovering(50, 242),
    'Hover must use current panel size even before geometry notification');
move(m, 50, 270);
advance(100);
pointer = [50, 242]; // No pointer callback: deadline must query position anew.
advance(50);
assert(m._targetVisible && !m._hideTimeoutId,
    'Hide deadline must recheck pointer instead of trusting old leave event');
move(m, 50, 270);
Main.overview.visible = true;
advance(350);
assert(panel.visible, 'Entering overview during exit delay prevents hiding');
Main.overview.visible = false;
move(m, 50, 270);
m.destroy();
m.destroy();
advance(500);
assert(panel.visible && panel.y === 200 && panel.translation_y === 0 && timers.size === 0 && watches.size === 0,
    'Disable cancels pending exit work and restores panel exactly once');

m = fixture();
m.hide(0, 'init');
m.show(0.2, 'mouse-enter');
advance(40);
const pendingReveal = transition.onComplete;
m.destroy();
pendingReveal();
advance(500);
assert(panel.visible && panel.y === 200 && panel.translation_y === 0 && timers.size === 0 && watches.size === 0,
    'Disable during animation cannot leave a callback or watch behind');

m = fixture();
m._intellihide.getOverlapStatus = () => true;
m._intellihideBlock = false;
m.show(0, 'mouse-enter');
m._updatePreventHide();
advance(500);
assert(panel.visible && panel.y === 200 && panel.translation_y === 0 && watches.size === 1,
    'Overlap changes cannot conceal the panel under a stationary pointer');
pointer = [50, 270];
Main.panel.menuManager.activeMenu = menu;
m._updatePreventHide();
advance(500);
assert(panel.visible && !m._hideTimeoutId,
    'Overlap changes cannot conceal the panel while its menu is open');
Main.panel.menuManager.activeMenu = null;
menuCallback(menu, false);
advance(350);
assert(!panel.visible, 'Overlap conceal resumes after both hover and menu end');

m = fixture();
m._intellihide.getOverlapStatus = () => true;
m._intellihideBlock = false;
m._updatePreventHide();
advance(200);
assert(!panel.visible, 'Initial overlap still hides a panel that was never revealed');

m = fixture();
let destroyed = 0;
Object.assign(m, {
    _panelBarrier: {destroy() { destroyed++; }},
    _panelPressure: {removeBarrier() {}, destroy() { destroyed++; }},
});
m._disablePressureBarrier();
m._disablePressureBarrier();
assert(destroyed === 2, 'Pressure barrier disposal remains idempotent');

m = fixture();
delete m._updateHotCorner;
const primarySizes = [], secondarySizes = [];
const primaryCorner = {setBarrierSize(size) { primarySizes.push(size); }};
const secondaryCorner = {setBarrierSize(size) { secondarySizes.push(size); }};
Main.layoutManager.hotCorners = [secondaryCorner, primaryCorner];
Main.layoutManager.primaryIndex = 1;
m._settings.get_boolean = key => key === 'hot-corner';
m.hide(0, 'init');
m.show(0.2, 'mouse-enter');
advance(200);
assert(primarySizes.length === 0 && secondarySizes.length === 0,
    'An enabled corner retains its native barriers through hide and reveal');
m._settings.get_boolean = () => false;
m.hide(0, 'test');
assert(primarySizes.at(-1) === 0 && secondarySizes.length === 0,
    'Only the primary corner is disabled with the hidden panel');
m._settings.get_boolean = key => key === 'hot-corner';
m._updateSettingsHotCorner();
assert(primarySizes.at(-1) === panel.height && !m._suppressedHotCorner,
    'Enabling the setting restores the suppressed corner immediately');
const count = primarySizes.length;
m._updateSettingsHotCorner();
assert(primarySizes.length === count, 'Repeated setting synchronization preserves pressure');
m._settings.get_boolean = () => false;
m._updateSettingsHotCorner();
Main.layoutManager.primaryIndex = 0;
m._updateSettingsHotCorner();
assert(primarySizes.at(-1) === panel.height && secondarySizes.at(-1) === 0,
    'Switching primary monitors restores the old corner and suppresses the new one');
Main.layoutManager.hotCorners = [];
m._updateSettingsHotCorner();
assert(!m._suppressedHotCorner, 'System-disabled or destroyed corners are not recreated');
Main.layoutManager.hotCorners = [primaryCorner];
m._updateSettingsHotCorner();
m.destroy();
assert(primarySizes.at(-1) === panel.height && !m._suppressedHotCorner,
    'Disable restores the current native corner');

m = fixture();
m._settings.get_int = () => 0;
m._initPressureBarrier();
m.hide(0, 'init');
pointer = [50, 270];
m._panelPressure.trigger();
advance(400);
assert(!panel.visible && !m._targetVisible,
    'A queued edge hit cannot reveal the panel after the pointer has left');
pointer = [50, 210];
m._panelPressure.trigger();
advance(200);
assert(panel.visible && m._targetVisible,
    'An edge hit with the pointer still inside reveals the panel');
move(m, 50, 270);
advance(180);
const hidingSerial = m._animationSerial;
m._panelPressure.trigger();
advance(300);
assert(!panel.visible && m._animationSerial === hidingSerial,
    'A stale edge hit cannot reverse an in-progress hide');

assert(code.includes('affectsStruts: false,\n            trackFullscreen: false'),
    'Shell fullscreen chrome must not compete with reveal');
assert((code.match(/new Convenience.GlobalSignalsHandler/g) || []).length === 1,
    'Settings signal owner must not be overwritten');
for (const name of ['extension.js', 'convenience.js', 'intellihide.js', 'desktopIconsIntegration.js', 'prefs.js']) {
    const source = read(name).replace(/^import[\s\S]*?;\n/gm, '')
        .replace(/export default class/g, 'class').replace(/export (class|const|function)/g, '$1');
    new Function(source.replaceAll('import.meta.url', '"file:///test"'));
}
print('PASS: asynchronous hover/leave/reentry, duplicate pressure, animation reversal, menus, geometry, overview, teardown, fullscreen tracking, JS parsing');
