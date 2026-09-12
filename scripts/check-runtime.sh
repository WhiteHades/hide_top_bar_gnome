#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
bash scripts/build.sh
root=$(mktemp -d /tmp/whitehades-shell-check.XXXXXX)
mkdir -p "$root/data/gnome-shell/extensions/hide-top-bar@whitehades.github.io" \
    "$root/config" "$root/cache" "$root/runtime"
chmod 700 "$root/runtime"
python3 - "$root/data/gnome-shell/extensions/hide-top-bar@whitehades.github.io" <<'PYTHON'
from pathlib import Path
import shutil
import sys
import zipfile

destination = Path(sys.argv[1])
with zipfile.ZipFile('dist/hide-top-bar@whitehades.github.io.shell-extension.zip') as archive:
    assert '__runtimeDriver.js' not in archive.namelist(), 'Test driver must never ship'
    assert 'tests/runtime.js' not in archive.namelist(), 'Test driver must never ship'
    assert 'tests/runtime-window.js' not in archive.namelist(), 'Test client must never ship'
    archive.extractall(destination)

# Instrument only the temporary extracted extension, never the checkout or ZIP.
extension = destination / 'extension.js'
source = extension.read_text()
enabled = '            mSettings, monitorIndex,\n        );'
disabled = '        mPVManager?.destroy();'
assert source.count(enabled) == 1 and source.count(disabled) == 1, 'Update test injection anchors'
source = "import * as RuntimeTests from './__runtimeDriver.js';\n" + source
source = source.replace(enabled, enabled + '\n        void RuntimeTests.run(mPVManager);')
source = source.replace(disabled,
    '        const runtimeManager = mPVManager;\n' + disabled +
    '\n        void RuntimeTests.onDisable(runtimeManager);')
extension.write_text(source)
shutil.copyfile('tests/runtime.js', destination / '__runtimeDriver.js')
shutil.copyfile('tests/runtime-window.js', destination.parents[3] / 'runtime-window.js')
PYTHON
export XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data"
export XDG_CACHE_HOME="$root/cache" XDG_RUNTIME_DIR="$root/runtime"
export CHECK_ROOT="$root"
# Both GSettings and Shell use a private bus and directories.
unset DISPLAY WAYLAND_DISPLAY SESSION_MANAGER DBUS_STARTER_ADDRESS DBUS_STARTER_BUS_TYPE
unset GSETTINGS_BACKEND GSETTINGS_SCHEMA_DIR
export WAYLAND_DISPLAY=htb-runtime-test
export GDK_BACKEND=wayland
trap 'status=$?; if [[ -f "$root/shell.log" ]]; then tail -n 60 "$root/shell.log"; fi; printf "Runtime-check files: %s\n" "$root"; exit "$status"' EXIT

dbus-run-session -- python3 - <<'PYTHON'
import json
import os
from pathlib import Path
import subprocess
import time

from gi.repository import Gio, GLib

UUID = 'hide-top-bar@whitehades.github.io'
INTERFACE = 'org.gnome.Shell.Extensions'
OBJECT = '/org/gnome/Shell/Extensions'
ACTIVE, INACTIVE = 1, 2
FATAL_STATES = {3: 'ERROR', 4: 'OUT_OF_DATE', 99: 'UNINSTALLED'}
root = Path(os.environ['CHECK_ROOT'])
settings = Gio.Settings.new('org.gnome.shell')
settings.set_strv('enabled-extensions', [UUID])
settings.set_boolean('disable-user-extensions', False)
# A fresh profile otherwise opens the first-run welcome modal and blocks NORMAL
# pressure barriers. Mark this private profile as having seen its installed Shell.
shell_version = subprocess.check_output(['gnome-shell', '--version'], text=True).strip().split()[-1]
settings.set_string('welcome-dialog-last-shown-version', shell_version)
Gio.Settings.new('org.gnome.desktop.interface').set_boolean('enable-animations', True)
Gio.Settings.sync()
bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)


def call(method, signature):
    result = bus.call_sync(
        INTERFACE, OBJECT, INTERFACE, method,
        GLib.Variant('(s)', (UUID,)), GLib.VariantType.new(signature),
        Gio.DBusCallFlags.NONE, 1000, None,
    )
    return result.unpack()[0]


with (root / 'shell.log').open('w') as log:
    shell = subprocess.Popen([
        'gnome-shell', '--headless', '--wayland', '--no-x11',
        '--virtual-monitor', '1920x1200', '--wayland-display', 'htb-runtime-test',
    ], stdout=log, stderr=subprocess.STDOUT)
    try:
        def assert_shell_running(phase):
            if shell.poll() is not None:
                raise RuntimeError(f'{phase}: GNOME Shell exited with {shell.returncode}')

        def wait_state(expected, phase, timeout):
            deadline = time.monotonic() + timeout
            last = 'Shell extension service not ready'
            while time.monotonic() < deadline:
                assert_shell_running(phase)
                try:
                    info = call('GetExtensionInfo', '(a{sv})')
                    errors = call('GetExtensionErrors', '(as)')
                except GLib.Error as error:
                    last = str(error)
                else:
                    state = info.get('state')
                    last = {'state': state, 'errors': errors, 'error': info.get('error', '')}
                    if errors or info.get('error'):
                        raise RuntimeError(f'{phase}: extension errors: {json.dumps(last)}')
                    if state in FATAL_STATES:
                        raise RuntimeError(f'{phase}: extension is {FATAL_STATES[state]}')
                    if state == expected:
                        print(json.dumps({'phase': phase, 'state': state, 'errors': errors}), flush=True)
                        return
                time.sleep(0.1)
            raise RuntimeError(f'{phase}: timed out after {timeout}s: {last}')

        def wait_result(kind, run, timeout=60):
            path = root / f'runtime-{kind}-{run}.json'
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                assert_shell_running(f'{kind} {run}')
                if path.is_file():
                    result = json.loads(path.read_text())
                    print(json.dumps(result), flush=True)
                    if not result.get('ok'):
                        raise RuntimeError(f'Runtime {kind} {run} failed: {result}')
                    return
                time.sleep(0.05)
            raise RuntimeError(f'Timed out waiting for {path.name}')

        wait_state(ACTIVE, 'startup', 30)
        wait_result('result', 1)
        for iteration in range(1, 4):
            if not call('DisableExtension', '(b)'):
                raise RuntimeError(f'Cycle {iteration}: disable rejected')
            wait_state(INACTIVE, f'cycle {iteration}: disabled', 10)
            wait_result('disabled', iteration, 10)
            if not call('EnableExtension', '(b)'):
                raise RuntimeError(f'Cycle {iteration}: enable rejected')
            wait_state(ACTIVE, f'cycle {iteration}: enabled', 10)
            wait_result('result', iteration + 1)
        # Check final teardown as well; no pending animation is left at process exit.
        if not call('DisableExtension', '(b)'):
            raise RuntimeError('Final disable rejected')
        wait_state(INACTIVE, 'final teardown', 10)
        wait_result('disabled', 4, 10)
        print('PASS: real panel animation/hover/menu checks across startup and three lifecycle cycles.', flush=True)
    finally:
        if shell.poll() is None:
            shell.terminate()
            try:
                shell.wait(timeout=5)
            except subprocess.TimeoutExpired:
                shell.kill()
                shell.wait(timeout=5)
PYTHON
