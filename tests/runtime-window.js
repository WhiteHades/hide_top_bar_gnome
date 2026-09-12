// Tiny real Wayland or XWayland client used only by the isolated runtime test.
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';

const mode = ARGV[0];
const backend = ARGV[1];
if (!['windowed', 'maximized', 'fullscreen'].includes(mode))
    throw new Error('Expected windowed, maximized or fullscreen');
if (!['wayland', 'x11'].includes(backend))
    throw new Error('Expected wayland or x11 backend');

const app = new Gtk.Application({
    application_id: `io.github.whitehades.TopBarRuntime.${mode}`,
    flags: Gio.ApplicationFlags.NON_UNIQUE,
});
app.connect('activate', () => {
    const window = new Gtk.ApplicationWindow({
        application: app,
        title: `HTB Runtime ${backend} ${mode}`,
        default_width: 900,
        default_height: 600,
    });
    window.set_child(new Gtk.Label({label: `Hide Top Bar isolated ${mode} test`}));
    if (mode === 'maximized')
        window.maximize();
    if (mode === 'fullscreen')
        window.fullscreen();
    window.present();
});
app.run([]);
