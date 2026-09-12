#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
bash scripts/build.sh
gjs -m tests/run.js
gnome-extensions install --force dist/hide-top-bar@whitehades.github.io.shell-extension.zip
python3 - <<'PY'
from gi.repository import Gio
s=Gio.Settings.new('org.gnome.shell')
old='hidetopbar@mathieu.bidon.ca'; new='hide-top-bar@whitehades.github.io'
items=[x for x in s.get_strv('enabled-extensions') if x not in (old,new)]
s.set_strv('enabled-extensions',items+[new]); Gio.Settings.sync()
PY
echo 'Installed WhiteHades fork. Log out and back in to load the new UUID/code. Upstream files remain available for rollback.'
