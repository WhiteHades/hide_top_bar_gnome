#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
bash scripts/build.sh
root=$(mktemp -d /tmp/whitehades-shell-check.XXXXXX)
mkdir -p "$root/data/gnome-shell/extensions" "$root/config" "$root/runtime"
chmod 700 "$root/runtime"
mkdir -p "$root/data/gnome-shell/extensions/hide-top-bar@whitehades.github.io"
python3 - "$root/data/gnome-shell/extensions/hide-top-bar@whitehades.github.io" <<'PYTHON'
import sys, zipfile
with zipfile.ZipFile('dist/hide-top-bar@whitehades.github.io.shell-extension.zip') as z:
    z.extractall(sys.argv[1])
PYTHON
export XDG_CONFIG_HOME="$root/config" XDG_DATA_HOME="$root/data" XDG_RUNTIME_DIR="$root/runtime"
export CHECK_ROOT="$root"
dbus-run-session -- bash -c '
set -e
trap '\''kill "$shell_pid" 2>/dev/null || true'\'' EXIT
gsettings set org.gnome.shell enabled-extensions "['\''hide-top-bar@whitehades.github.io'\'']"
gnome-shell --headless --wayland --no-x11 --virtual-monitor 1920x1200 > "$CHECK_ROOT/shell.log" 2>&1 &
shell_pid=$!
sleep 8
for iteration in 1 2 3; do
 gnome-extensions disable hide-top-bar@whitehades.github.io
 gnome-extensions enable hide-top-bar@whitehades.github.io
done
info=$(gnome-extensions info hide-top-bar@whitehades.github.io)
printf "%s\n" "$info"
printf "%s\n" "$info" | grep -q "State: ACTIVE"
gdbus call --session --dest org.gnome.Shell.Extensions --object-path /org/gnome/Shell/Extensions --method org.gnome.Shell.Extensions.GetExtensionErrors hide-top-bar@whitehades.github.io
'
cat "$root/shell.log" | tail -25
