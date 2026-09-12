#!/usr/bin/bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
glib-compile-schemas --strict schemas
while IFS= read -r -d '' file; do msgfmt -c "$file" -o "${file%.po}.mo"; done < <(find locale -name '*.po' -print0)
mkdir -p dist
python3 - <<'PY'
from pathlib import Path
import zipfile
with zipfile.ZipFile('dist/hide-top-bar@whitehades.github.io.shell-extension.zip','w',zipfile.ZIP_DEFLATED) as z:
 files=list(Path('.').glob('*.js'))+[Path(p) for p in ('metadata.json','COPYING.txt','ATTRIBUTION.md','Settings.ui')]+list(Path('schemas').glob('*'))+list(Path('locale').rglob('*.mo'))
 for p in files: z.write(p,str(p))
print('Built dist/hide-top-bar@whitehades.github.io.shell-extension.zip')
PY
