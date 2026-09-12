import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Adw.init();
assertMemoryBackend();
function assertMemoryBackend() {
    if (GLib.getenv('GSETTINGS_BACKEND') !== 'memory')
        throw new Error('Run with GSETTINGS_BACKEND=memory to protect user preferences');
}
const root = ARGV[0];
const schemaDir = ARGV[1];
const screenshotDir = ARGV[2];
const assert = (value, message) => { if (!value) throw new Error(message); };
const source = Gio.File.new_for_path(`${root}/prefs.js`).load_contents(null)[1];
// Run the production preferences method with the framework's two dependencies
// supplied locally; no GNOME Shell instance or user settings are accessed.
const js = new TextDecoder().decode(source)
    .replace(/^import .*?;\n/gms, '')
    .replace('export default class', 'class');
class Base {
    constructor(path, settings) { this.path = path; this._settings = settings; }
    getSettings() { return this._settings; }
}
const Preferences = new Function('Gtk', 'Gio', 'Adw', 'ExtensionPreferences',
    `${js}; return HideTopBarPreferences;`)(Gtk, Gio, Adw, Base);
const schemaSource = Gio.SettingsSchemaSource.new_from_directory(schemaDir,
    Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema:
    schemaSource.lookup('org.gnome.shell.extensions.hidetopbar-whitehades', false)});
const pause = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve(); return GLib.SOURCE_REMOVE;
}));
function descendants(widget) {
    const result = [widget];
    for (let child = widget.get_first_child(); child; child = child.get_next_sibling())
        result.push(...descendants(child));
    return result;
}
const pages = [];
const window = new Adw.PreferencesWindow({default_width: 720, default_height: 600,
    title: 'Hide Top Bar (WhiteHades)'});
const add = window.add.bind(window);
window.add = page => { pages.push(page); add(page); };
new Preferences(root, settings).fillPreferencesWindow(window);
assert(pages.length === 4, 'All four preference pages must be present');
const rows = pages.flatMap(descendants).filter(w => w instanceof Adw.ActionRow);
assert(rows.length === 14, `Expected 14 preference controls, found ${rows.length}`);
const rowById = id => rows.find(w => w.get_buildable_id() === id);
for (const row of rows) assert(row.title_lines === 0, `${row.title} must wrap completely`);
const toggle = rowById('toggle_mouse_sensitive');
settings.set_boolean('mouse-sensitive', false);
assert(toggle.active === false, 'Settings change did not reach switch');
toggle.active = true;
assert(settings.get_boolean('mouse-sensitive') === true, 'Switch did not update settings');
const threshold = rowById('spin_pressure_threshold');
settings.set_int('pressure-threshold', 73);
assert(threshold.value === 73, 'Integer setting did not reach spin row');
threshold.value = 41;
assert(settings.get_int('pressure-threshold') === 41, 'Spin row did not update integer setting');
const duration = rowById('spin_animation_time_autohide');
settings.set_double('animation-time-autohide', 0.3);
assert(Math.abs(duration.value - 0.3) < 0.0001, 'Decimal setting did not reach spin row');
duration.value = 0.2;
assert(Math.abs(settings.get_double('animation-time-autohide') - 0.2) < 0.0001,
    'Spin row did not update decimal setting');
const tree = pages.flatMap(descendants).find(w => w instanceof Gtk.TreeView);
const model = tree.get_model();
const [, iter] = model.get_iter_first();
settings.set_strv('shortcut-keybind', ['<Control><Super>h']);
const [valid, key, mods] = Gtk.accelerator_parse('<Control><Super>h');
assert(valid && model.get_value(iter, 0) === mods && model.get_value(iter, 1) === key,
    'Saved shortcut failed GTK4 accelerator round trip');
const cell = tree.get_column(0).get_cells()[0];
cell.emit('accel-edited', '0', key, mods, 0);
assert(settings.get_strv('shortcut-keybind')[0] === Gtk.accelerator_name(key, mods),
    'Shortcut editor did not update settings');
cell.emit('accel-cleared', '0');
assert(model.get_value(iter, 0) === 0 && model.get_value(iter, 1) === 0,
    'Cleared shortcut failed round trip');
window.present();
await pause(350);
for (const width of [720, 360]) {
    for (const font of ['Adwaita Sans 11', 'Adwaita Sans 12.32', 'Adwaita Sans 16']) {
        Gtk.Settings.get_default().gtk_font_name = font;
        window.set_default_size(width, 540);
        await pause(250);
        for (const page of pages) {
            window.set_visible_page(page);
            await pause(300);
            const [minWidth] = page.measure(Gtk.Orientation.HORIZONTAL, -1);
            assert(minWidth <= width, `${page.title}: minimum width ${minWidth} exceeds ${width}`);
            for (const row of descendants(page).filter(w => w instanceof Adw.ActionRow)) {
                const [ok, bounds] = row.compute_bounds(window);
                assert(ok && bounds.origin.x >= -1 &&
                    bounds.origin.x + bounds.size.width <= window.get_width() + 1,
                `${page.title}/${row.title}: control extends horizontally beyond window`);
                for (const label of descendants(row).filter(w => w instanceof Gtk.Label && w.has_css_class('title')))
                    assert(!label.get_layout().is_ellipsized(), `${row.title}: title is truncated`);
            }
            print(`PASS ${page.title}: requested ${width}px, actual ${window.get_width()}px, minimum ${minWidth}px, ${font}`);
            if (screenshotDir && width === 360 && font.endsWith('16')) {
                const paintable = new Gtk.WidgetPaintable({widget: window});
                const snapshot = new Gtk.Snapshot();
                paintable.snapshot(snapshot, window.get_width(), window.get_height());
                const node = snapshot.to_node();
                const texture = window.get_renderer().render_texture(node, null);
                texture.save_to_png(`${screenshotDir}/${page.title.replaceAll(' ', '-')}.png`);
            }
        }
    }
}
window.close();
// A later external update must not touch widgets from a closed window.
settings.set_strv('shortcut-keybind', ['<Control>j']);
print('PASS native preferences construction, bidirectional bindings, shortcuts, narrow/scaled allocations and cleanup');
