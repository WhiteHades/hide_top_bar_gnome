"""Validate the distributable, including keeping test instrumentation out of it."""
import json
from pathlib import PurePosixPath
import xml.etree.ElementTree as ET
from zipfile import ZipFile

UUID = 'hide-top-bar@whitehades.github.io'
required = {
    'metadata.json', 'extension.js', 'panelVisibilityManager.js', 'intellihide.js',
    'convenience.js', 'desktopIconsIntegration.js', 'prefs.js', 'Settings.ui',
    'COPYING.txt', 'ATTRIBUTION.md', 'schemas/gschemas.compiled',
    'schemas/org.gnome.shell.extensions.hidetopbar.gschema.xml',
}
with ZipFile(f'dist/{UUID}.shell-extension.zip') as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'Duplicate archive entries'
    assert required <= set(names), f'Missing runtime files: {required - set(names)}'
    for name in names:
        path = PurePosixPath(name)
        assert not path.is_absolute() and '..' not in path.parts, name
        assert name in required or (name.startswith('locale/') and name.endswith('.mo')), name
    metadata = json.loads(archive.read('metadata.json'))
    assert metadata['uuid'] == UUID
    assert metadata['name'] == 'Hide Top Bar (WhiteHades)'
    assert metadata['url'] == 'https://github.com/WhiteHades/hide_top_bar_gnome'
    assert isinstance(metadata['version'], int) and metadata['version'] > 0
    assert metadata['shell-version'], 'Declare tested Shell versions'
    schema = ET.fromstring(archive.read('schemas/org.gnome.shell.extensions.hidetopbar.gschema.xml'))
    assert schema.find('schema').get('id') == metadata['settings-schema']
    assert b'runRuntimeTests' not in archive.read('extension.js'), 'Test driver leaked into package'
print('PASS: package metadata, settings schema, attribution, and runtime-only contents')
