// Test driver injected only into the temporary extension used by check-runtime.sh.
// This file is not shipped in the extension ZIP and never runs in the live desktop.
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const panel = Main.layoutManager.panelBox;
let runNumber = 0;
const runs = new WeakMap();
const panelY = () => panel.y + panel.translation_y;

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
    throw new Error(`Timeout: ${message}; panel y=${panelY()}, visible=${panel.visible}`);
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
                    !manager._animationActive && Math.abs(panelY() - manager._base_y) < 0.5,
                `${context}: real virtual-pointer pressure barrier reveals the panel`);
                assert(manager._unredirectInhibited, `${context}: visible panel must inhibit scanout`);
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x,
                    Math.round(manager._base_y + panel.height / 2));
                const end = GLib.get_monotonic_time() + 350000;
                while (GLib.get_monotonic_time() < end) {
                    assert(panel.visible && panel.get_paint_visibility() &&
                        Math.abs(panelY() - manager._base_y) < 0.5 && manager._unredirectInhibited,
                    `${context}: native hover did not hold the complete panel visible`);
                    await delay(20);
                }
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, outsideY);
                await delay(40);
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x,
                    Math.round(manager._base_y + panel.height / 2));
                await delay(200);
                assert(manager._targetVisible && panel.visible &&
                    Math.abs(panelY() - manager._base_y) < 0.5,
                `${context}: quick native exit and reentry reversed the panel`);
                virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, outsideY);
                await until(() => !panel.visible && !manager._animationActive,
                    `${context}: real virtual-pointer exit hides the panel`);
                await delay(250);
                assert(!panel.visible && !manager._targetVisible,
                    `${context}: panel appeared again after native exit`);
                assert(!manager._unredirectInhibited,
                    `${context}: hidden panel retained scanout inhibition`);
                checks.push(`native edge pressure, complete hover visibility and exit: ${context}`);
            };
            manager._settings.set_int('pressure-threshold', 0);
            await nativeHover('desktop, pressure 0');

            // Sliding the actor's allocation used to rebuild GNOME's hot-corner
            // barriers every frame, throwing away pressure until the slide ended.
            Gio.Settings.new('org.gnome.desktop.interface').set_boolean('enable-hot-corners', true);
            manager._settings.set_boolean('hot-corner', true);
            await until(() => Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex],
                'native primary hot corner exists');
            const corner = Main.layoutManager.hotCorners[Main.layoutManager.primaryIndex];
            const horizontal = corner._horizontalBarrier;
            const vertical = corner._verticalBarrier;
            assert(horizontal && vertical, 'native corner pressure barriers exist');
            manager._settings.set_double('animation-time-autohide', 1.5);
            virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, manager._base_y);
            manager.show(1.5, 'runtime-hot-corner-reveal');
            await delay(100);
            assert(manager._animationActive, 'hot-corner test needs a real panel animation');
            assert(corner._horizontalBarrier === horizontal && corner._verticalBarrier === vertical,
                'show animation rebuilt the native hot-corner barriers');
            virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(),
                Main.layoutManager.primaryMonitor.x + 20, manager._base_y + 20);
            const cornerStart = GLib.get_monotonic_time();
            for (let motion = 0; motion < 20 && !Main.overview.visible; motion++) {
                virtualPointer.notify_relative_motion(GLib.get_monotonic_time(), -20, -20);
                await delay(20);
            }
            await until(() => Main.overview.visible, 'native corner opens overview during reveal', 500);
            assert(GLib.get_monotonic_time() - cornerStart < 1000000,
                'native hot corner waited for the 1.5 second panel slide');
            virtualPointer.notify_absolute_motion(GLib.get_monotonic_time(), x, outsideY);
            Main.overview.hide();
            await until(() => !Main.overview.visible && !Main.overview.animationInProgress,
                'leave overview after native hot-corner test');
            await until(() => !manager._animationActive && !panel.visible,
                'panel hidden after native overview test');
            assert(corner._horizontalBarrier === horizontal && corner._verticalBarrier === vertical,
                'hide animation rebuilt the native hot-corner barriers');
            manager._settings.set_double('animation-time-autohide', 0.25);
            checks.push('native hot-corner barriers survive slides and open overview before reveal completes');

            for (const backend of ['wayland', 'x11']) {
                for (const mode of ['windowed', 'maximized', 'fullscreen']) {
                    const title = `HTB Runtime ${backend} ${mode}`;
                    const testWindow = () => global.get_window_actors()
                        .map(actor => actor.meta_window).find(window => window.get_title() === title);
                    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.NONE});
                    launcher.setenv('GDK_BACKEND', backend, true);
                    if (backend === 'x11') {
                        const display = GLib.getenv('DISPLAY');
                        assert(display, 'private compositor did not expose an XWayland DISPLAY');
                        launcher.setenv('DISPLAY', display, true);
                    }
                    testClient = launcher.spawnv(['gjs', '-m',
                        `${GLib.getenv('CHECK_ROOT')}/runtime-window.js`, mode, backend]);
                    await until(() => {
                        const window = testWindow();
                        if (!window)
                            return false;
                        if (mode === 'fullscreen')
                            return window.is_fullscreen() && Main.layoutManager.primaryMonitor.inFullscreen;
                        if (mode === 'maximized')
                            return window.is_maximized();
                        return !window.is_fullscreen() && !window.is_maximized();
                    }, `real ${backend} ${mode} GTK window and compositor state`, 10000);
                    assert(testWindow().get_client_type() ===
                        (backend === 'x11' ? Meta.WindowClientType.X11 : Meta.WindowClientType.WAYLAND),
                    `${backend} test client connected through the wrong display backend`);
                    for (const threshold of [0, 50]) {
                        manager._settings.set_int('pressure-threshold', threshold);
                        await nativeHover(`${backend} ${mode}, pressure ${threshold}`);
                    }
                    testClient.force_exit();
                    testClient = null;
                    await until(() => !testWindow(), `${mode} test window closes`);
                    await until(() => !Main.layoutManager.primaryMonitor.inFullscreen,
                        'compositor leaves fullscreen after test client exits');
                }
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
        const visible = () => panel.visible && Math.abs(panelY() - manager._base_y) < 0.5 &&
            manager._targetVisible === true && !manager._animationActive && manager._unredirectInhibited;
        const hidden = () => !panel.visible &&
            panelY() <= manager._base_y - panel.height + 0.5 &&
            manager._targetVisible === false && !manager._animationActive && !manager._unredirectInhibited;
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
        manager._panelPressure.emit('trigger');
        await delay(300);
        assert(hidden(), 'an edge hit delivered after the pointer left revealed the panel');
        checks.push('stale pressure hits cannot reveal the panel after pointer exit');
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
        await until(() => panelY() < manager._base_y - 0.5 &&
            panelY() > manager._base_y - panel.height + 0.5,
        'actual intermediate Clutter hide-animation frame');
        assert(manager._unredirectInhibited, 'hide animation released scanout inhibition before completion');
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
        await until(() => manager._animationActive && panelY() > manager._base_y - panel.height + 0.5 &&
            panelY() < manager._base_y - 0.5, 'real show animation active before disable');
        assert(manager._unredirectInhibited, 'show animation did not own scanout inhibition');
        checks.push('compositor inhibition owned while visible and animating, released after complete hide');
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
        assert(!manager._unredirectInhibited, 'compositor inhibition survived disable');
        assert(!panel.get_transition('y'), 'panel y transition survived disable');
        assert(!panel.get_transition('translation-y'), 'panel translation transition survived disable');
        const restored = () => panel.visible && Math.abs(panelY() - manager._base_y) < 0.5;
        assert(restored(), 'native panel was not restored on disable');
        await delay(1200);
        assert(restored(), 'a delayed callback modified the native panel after disable');
        record('disabled', state.id, {ok: true, id: state.id,
            checks: ['pending real animation cancelled; native panel stable after disable']});
    } catch (error) {
        record('disabled', state.id, {ok: false, id: state.id, error: `${error.message}\n${error.stack}`});
    }
}
