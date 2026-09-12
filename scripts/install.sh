#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
bash scripts/build.sh
gjs -m tests/run.js
gjs -m tests/lifecycle.js
python3 tests/check-package.py
# Keep the previous installed fork in a durable place before replacing its files.
python3 - <<'BACKUP'
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import zipfile
from gi.repository import Gio

uuid = 'hide-top-bar@whitehades.github.io'
installed = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'gnome-shell/extensions' / uuid
if installed.is_dir():
    root = Path(os.environ.get('XDG_STATE_HOME', Path.home() / '.local/state')) / 'hide-top-bar/backups'
    backup = root / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    backup.mkdir(parents=True, mode=0o700)
    with zipfile.ZipFile(backup / f'{uuid}.shell-extension.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(installed.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(installed))
    shell = Gio.Settings.new('org.gnome.shell')
    (backup / 'enabled-extensions.json').write_text(json.dumps(list(shell.get_strv('enabled-extensions')), indent=2) + '\n')
    print(f'Previous fork backed up to: {backup}')
BACKUP
gnome-extensions install --force dist/hide-top-bar@whitehades.github.io.shell-extension.zip
python3 - <<'PY'
from gi.repository import Gio
s=Gio.Settings.new('org.gnome.shell')
old='hidetopbar@mathieu.bidon.ca'; new='hide-top-bar@whitehades.github.io'
items=[x for x in s.get_strv('enabled-extensions') if x not in (old,new)]
s.set_strv('enabled-extensions',items+[new]); Gio.Settings.sync()
PY
echo 'Installed WhiteHades fork. Log out and back in to load the new UUID/code. Upstream files remain available for rollback.'
