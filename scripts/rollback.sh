#!/usr/bin/bash
set -euo pipefail
if [[ $# -gt 1 ]]; then
    echo "Usage: bash scripts/rollback.sh [previous-fork.shell-extension.zip]" >&2
    exit 2
fi
if [[ $# -eq 1 ]]; then
    # Only accept this fork's UUID, not an unrelated extension archive.
    python3 - "$1" <<'VERIFY'
import json
import sys
import zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    if json.loads(archive.read('metadata.json'))['uuid'] != 'hide-top-bar@whitehades.github.io':
        raise SystemExit('This backup is not the WhiteHades fork.')
VERIFY
    gnome-extensions install --force "$1"
    echo 'Previous fork restored. Log out and back in to load it. Your preferences are unchanged.'
    exit 0
fi
python3 - <<'PY'
from gi.repository import Gio
import os
from pathlib import Path
roots = [Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))]
roots.extend(Path(p) for p in os.environ.get('XDG_DATA_DIRS', '/usr/local/share:/usr/share').split(':'))
if not any((p / 'gnome-shell/extensions/hidetopbar@mathieu.bidon.ca').is_dir() for p in roots):
    raise SystemExit('Original extension is not installed. Pass a previous fork backup ZIP instead.')
s=Gio.Settings.new('org.gnome.shell')
old='hidetopbar@mathieu.bidon.ca'; new='hide-top-bar@whitehades.github.io'
a=[x for x in s.get_strv('enabled-extensions') if x not in (old,new)]
s.set_strv('enabled-extensions',a+[old]); Gio.Settings.sync()
PY
echo 'Original extension selected. Log out and back in.'
