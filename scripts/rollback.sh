#!/usr/bin/bash
set -euo pipefail
python3 - <<'PY'
from gi.repository import Gio
s=Gio.Settings.new('org.gnome.shell')
old='hidetopbar@mathieu.bidon.ca'; new='hide-top-bar@whitehades.github.io'
a=[x for x in s.get_strv('enabled-extensions') if x not in (old,new)]
s.set_strv('enabled-extensions',a+[old]); Gio.Settings.sync()
PY
echo 'Original extension selected. Log out and back in.'
