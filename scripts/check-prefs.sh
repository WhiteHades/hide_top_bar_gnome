#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
prefs_repo=$(pwd)
prefs_test_root=$(mktemp -d /tmp/whitehades-prefs-check.XXXXXX)
mkdir -p "$prefs_test_root/runtime" "$prefs_test_root/config" "$prefs_test_root/data" "$prefs_test_root/schemas" "$prefs_test_root/screenshots"
chmod 700 "$prefs_test_root/runtime"
cp schemas/*.gschema.xml "$prefs_test_root/schemas/"
glib-compile-schemas --strict "$prefs_test_root/schemas"
export XDG_RUNTIME_DIR="$prefs_test_root/runtime" XDG_CONFIG_HOME="$prefs_test_root/config" XDG_DATA_HOME="$prefs_test_root/data"
export GSETTINGS_BACKEND=memory GTK_A11Y=none
export PREFS_TEST_ROOT="$prefs_test_root" PREFS_REPO="$prefs_repo"
unset DISPLAY WAYLAND_DISPLAY GNOME_SETUP_DISPLAY
# Xvfb is enough for GTK tests in CI. On a GNOME development machine, use a
# separate headless compositor; neither path connects to the live desktop.
if command -v xvfb-run >/dev/null; then
    export GDK_BACKEND=x11
    dbus-run-session -- xvfb-run -a gjs -m tests/preferences.js "$prefs_repo" \
        "$prefs_test_root/schemas" "$prefs_test_root/screenshots"
else
    export GDK_BACKEND=wayland
    dbus-run-session -- bash -c '
        set -euo pipefail
        trap '\''kill "$prefs_shell_pid" 2>/dev/null || true'\'' EXIT
        gnome-shell --headless --wayland --no-x11 --wayland-display prefs-check \
            --virtual-monitor 1200x900 > "$PREFS_TEST_ROOT/shell.log" 2>&1 &
        prefs_shell_pid=$!
        for iteration in $(seq 1 100); do
            test -S "$XDG_RUNTIME_DIR/prefs-check" && break
            if ! kill -0 "$prefs_shell_pid" 2>/dev/null; then
                cat "$PREFS_TEST_ROOT/shell.log"
                exit 1
            fi
            sleep 0.1
        done
        export WAYLAND_DISPLAY=prefs-check
        gjs -m "$PREFS_REPO/tests/preferences.js" "$PREFS_REPO" \
            "$PREFS_TEST_ROOT/schemas" "$PREFS_TEST_ROOT/screenshots"
    '
fi
printf 'Preferences test artifacts: %s\n' "$prefs_test_root"
