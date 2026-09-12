// Test driver injected only into the temporary extension used by check-runtime.sh.
// This file is not shipped in the extension ZIP and never runs in the live desktop.
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const panel = Main.layoutManager.panelBox;
let runNumber = 0;
const runs = new WeakMap();

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function delay(milliseconds) {
    return new Promise(resolve => {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
            resolve();
            return GLib.SOURCE_REMOVE;
        });
    });
}

async function until(predicate, message, timeout = 2500) {
    const deadline = GLib.get_monotonic_time() + timeout * 1000;
    while (GLib.get_monotonic_time() < deadline) {
        if (predicate())
            return;
        await delay(10);
    }
    throw new Error(`Timeout: ${message}; panel y=${panel.y}, visible=${panel.visible}`);
}

function record(kind, id, value) {
    const root = GLib.getenv('CHECK_ROOT');
    assert(root?.startsWith('/tmp/whitehades-shell-check.'), 'Missing isolated test directory');
    GLib.file_set_contents(`${root}/runtime-${kind}-${id}.json`, JSON.stringify(value));
}

export async function run(manager) {
    const id = ++runNumber;
    const checks = [];
    const state = {id, checks, restorePointer: null};
    runs.set(manager, state);
    let menu = null;
    let virtualPointer = null;
    let testClient = null;
    try {
        // Hidden actors can invalidate has_allocation() while retaining valid geometry.
        await until(() => !Main.layoutManager._startingUp && !manager._bindTimeoutId &&
            panel.width > 0 && panel.height > 0,
        'Shell startup, manager UI binding and panel geometry', 15000);
        manager._settings.set_boolean('enable-intellihide', false);
        manager._settings.set_boolean('mouse-triggers-overview', false);
        manager._settings.set_boolean('keep-round-corners', false);
        manager._settings.set_double('animation-time-autohide', 0.25);
        Main.overview.hide();
        await until(() => !Main.overview.visible && !Main.overview.animationInProgress,
            'overview hide animation completed');

        // Exercise Mutter's real input path before installing the synthetic pointer.
        // The virtual device is attached only to this private headless compositor.
        const seat = global.stage.get_context().get_backend().get_default_seat();
        if (typeof seat.create_virtual_device === 'function') {
            virtualPointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
            const x = Math.round(panel.x + panel.width / 2);
            const outsideY = Math.round(manager._base_y + panel.height + 120);
            manager._settings.set_int('pressure-threshold', 50);
            manager._settings.set_int('pressure-timeout', 1000);
            const nativeHover = async context => {
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, outsideY);
                manager.hide(0, 'runtime-native-input-reset');
                await until(() => !panel.visible && !manager._animationActive,
                    `${context}: hidden panel before native edge input`);
                await delay(150);
                for (let motion = 0; motion < 30 && manager._targetVisible !== true; motion++) {
                    virtualPointer.notify_relative_motion(GLib.get_monotonic_time(), 0, -20);
                    await delay(15);
                }
                await until(() => panel.visible && panel.get_paint_visibility() &&
                    !manager._animationActive && Math.abs(panel.y - manager._base_y) < 0.5,
                `${context}: real virtual-pointer pressure barrier reveals the panel`);
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x,
                    Math.round(manager._base_y + panel.height / 2));
                const end = GLib.get_monotonic_time() + 350000;
                while (GLib.get_monotonic_time() < end) {
                    assert(panel.visible && panel.get_paint_visibility() &&
                        Math.abs(panel.y - manager._base_y) < 0.5,
                    `${context}: native hover did not hold the complete panel visible`);
                    await delay(20);
                }
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, outsideY);
                await until(() => !panel.visible && !manager._animationActive,
                    `${context}: real virtual-pointer exit hides the panel`);
                checks.push(`native edge pressure, complete hover visibility and exit: ${context}`);
            };
            await nativeHover('desktop');
            for (const mode of ['windowed', 'maximized', 'fullscreen']) {
                const title = `HTB Runtime ${mode}`;
                const testWindow = () => global.get_window_actors()
                    .map(actor => actor.meta_window).find(window => window.get_title() === title);
                testClient = Gio.Subprocess.new(['gjs', '-m',
                    `${GLib.getenv('CHECK_ROOT')}/runtime-window.js`, mode], Gio.SubprocessFlags.NONE);
                await until(() => {
                    const window = testWindow();
                    if (!window)
                        return false;
                    if (mode === 'fullscreen')
                        return window.is_fullscreen() && Main.layoutManager.primaryMonitor.inFullscreen;
                    if (mode === 'maximized')
                        return window.is_maximized();
                    return !window.is_fullscreen() && !window.is_maximized();
                }, `real ${mode} GTK window and compositor state`, 10000);
                await nativeHover(mode);
                testClient.force_exit();
                testClient = null;
                await until(() => !testWindow(), `${mode} test window closes`);
                await until(() => !Main.layoutManager.primaryMonitor.inFullscreen,
                    'compositor leaves fullscreen after test client exits');
            }
        } else {
            checks.push('native pointer test unavailable: compositor lacks virtual-device API');
        }

        const pointerDescriptor = Object.getOwnPropertyDescriptor(global, 'get_pointer');
        let pointer = [0, 0, 0];
        global.get_pointer = () => [...pointer];
        state.restorePointer = () => {
            if (pointerDescriptor)
                Object.defineProperty(global, 'get_pointer', pointerDescriptor);
            else
                delete global.get_pointer;
            state.restorePointer = null;
        };
        const inside = () => {
            pointer = [Math.round(panel.x + panel.width / 2),
                Math.round(manager._base_y + panel.height / 2), 0];
        };
        const outside = () => {
            pointer = [Math.round(panel.x + panel.width / 2),
                Math.round(manager._base_y + panel.height + 120), 0];
        };
        const visible = () => panel.visible && Math.abs(panel.y - manager._base_y) < 0.5 &&
            manager._targetVisible === true && !manager._animationActive;
        const hidden = () => !panel.visible &&
            panel.y <= manager._base_y - panel.height + 0.5 &&
            manager._targetVisible === false && !manager._animationActive;
        const hover = () => manager._handlePointer(pointer[0], pointer[1]);
        const stableVisible = async (milliseconds, label) => {
            const end = GLib.get_monotonic_time() + milliseconds * 1000;
            while (GLib.get_monotonic_time() < end) {
                assert(visible(), `${label}: panel became hidden or clipped while hovered`);
                await delay(20);
            }
        };
        const reveal = async () => {
            inside();
            manager.show(0.25, 'mouse-enter');
            await until(visible, 'fully revealed panel');
        };

        outside();
        manager.hide(0, 'runtime-initial-hide');
        await until(hidden, 'initial hidden panel');
        await reveal();
        await stableVisible(300, 'ordinary hover');
        checks.push('real panel remains fully visible during hover');

        outside();
        hover();
        await delay(50);
        assert(visible(), 'brief leave must respect the exit delay');
        inside();
        hover();
        await stableVisible(450, 'leave/reentry before hide delay');
        checks.push('brief leave and reentry cancels pending hide without flicker');

        outside();
        hover();
        await until(() => panel.y < manager._base_y - 0.5 &&
            panel.y > manager._base_y - panel.height + 0.5,
        'actual intermediate Clutter hide-animation frame');
        inside();
        hover();
        await until(visible, 'reentry reverses the real hide animation');
        await stableVisible(300, 'animation reversal');
        checks.push('reentry reverses an observed real Clutter hide animation');

        outside();
        hover();
        await until(hidden, 'pointer outside hides the panel after delay');
        await delay(200);
        assert(hidden(), 'panel must remain hidden outside');
        checks.push('panel hides completely and remains hidden outside');

        await reveal();
        menu = Main.panel.statusArea.dateMenu.menu;
        menu.open();
        await until(() => menu.isOpen && Main.panel.menuManager.activeMenu === menu,
            'real date menu opens');
        outside();
        hover();
        await stableVisible(550, 'open menu');
        menu.close();
        await until(hidden, 'closing menu outside releases hide');
        menu = null;
        checks.push('real panel menu keeps panel visible until closed');

        for (let repeat = 0; repeat < 8; repeat++) {
            inside();
            manager.show(0.25, 'mouse-enter');
            await delay(15);
            outside();
            hover();
            await delay(15);
        }
        await reveal();
        await stableVisible(350, 'rapid pressure/leave/reentry');
        checks.push('rapid repeated show/leave requests settle fully visible');

        outside();
        manager.hide(0, 'runtime-before-disable');
        await until(hidden, 'prepare pending-animation disable');
        inside();
        manager.show(1, 'mouse-enter');
        await until(() => manager._animationActive && panel.y > manager._base_y - panel.height + 0.5 &&
            panel.y < manager._base_y - 0.5, 'real show animation active before disable');
        record('result', id, {ok: true, id, checks, pendingAnimation: true});
    } catch (error) {
        record('result', id, {ok: false, id, checks, error: `${error.message}\n${error.stack}`});
        console.error(`Hide Top Bar runtime test failed: ${error.message}`);
    } finally {
        menu?.close();
        state.restorePointer?.();
        virtualPointer?.run_dispose();
        testClient?.force_exit();
    }
}

export async function onDisable(manager) {
    const state = runs.get(manager);
    if (!state)
        return;
    try {
        state.restorePointer?.();
        assert(manager._destroyed, 'manager was not destroyed');
        assert(!manager._animationActive, 'animation state survived disable');
        assert(!manager._pointerListener, 'pointer listener survived disable');
        assert(!manager._hideTimeoutId, 'pending hide survived disable');
        assert(!panel.get_transition('y'), 'panel y transition survived disable');
        const restored = () => panel.visible && Math.abs(panel.y - manager._base_y) < 0.5;
        assert(restored(), 'native panel was not restored on disable');
        await delay(1200);
        assert(restored(), 'a delayed callback modified the native panel after disable');
        record('disabled', state.id, {ok: true, id: state.id,
            checks: ['pending real animation cancelled; native panel stable after disable']});
    } catch (error) {
        record('disabled', state.id, {ok: false, id: state.id, error: `${error.message}\n${error.stack}`});
    }
}
