/**
 * This file is part of Hide Top Bar
 *
 * Copyright 2020 Thomas Vogt
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import Gtk from 'gi://Gtk';
import Gio from 'gi://Gio';
import Adw from 'gi://Adw';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class HideTopBarPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        // Register Adwaita types before loading them through GtkBuilder.
        Adw.init();
        const builder = new Gtk.Builder();
        builder.set_translation_domain('hidetopbar@mathieu.bidon.ca');
        builder.add_from_file(this.path + '/Settings.ui');

        // Each native page owns its scrolling and adapts to narrow windows.
        // Avoid a notebook inside another scroller: its minimum width can clip
        // controls when font scaling or longer translations are in use.
        for (const name of ['sensitivity', 'animation', 'shortcuts', 'intellihide'])
            window.add(builder.get_object(`${name}_page`));

        const booleanKeys = [
            'mouse-sensitive', 'mouse-sensitive-fullscreen-window',
            'show-in-overview', 'hot-corner', 'mouse-triggers-overview',
            'keep-round-corners', 'shortcut-toggles', 'enable-intellihide',
            'enable-active-window',
        ];
        for (const key of booleanKeys) {
            settings.bind(key, builder.get_object(`toggle_${key.replaceAll('-', '_')}`),
                'active', Gio.SettingsBindFlags.DEFAULT);
        }

        const numericKeys = [
            'pressure-threshold', 'pressure-timeout',
            'animation-time-overview', 'animation-time-autohide', 'shortcut-delay',
        ];
        for (const key of numericKeys) {
            settings.bind(key, builder.get_object(`spin_${key.replaceAll('-', '_')}`),
                'value', Gio.SettingsBindFlags.DEFAULT);
        }

        const model = builder.get_object('store_shortcut_keybind');
        const [, modelRow] = model.get_iter_first();
        const updateShortcut = () => {
            const binding = settings.get_strv('shortcut-keybind')[0];
            // GTK4 returns success as well as the key and modifier values.
            const [valid, key, mods] = binding
                ? Gtk.accelerator_parse(binding) : [false, 0, 0];
            model.set(modelRow, [0, 1], valid ? [mods, key] : [0, 0]);
        };
        updateShortcut();

        const cell = builder.get_object('accel_shortcut_keybind');
        cell.connect('accel-edited', (_cell, _path, key, mods) => {
            settings.set_strv('shortcut-keybind', [Gtk.accelerator_name(key, mods)]);
        });
        cell.connect('accel-cleared', () => {
            settings.set_strv('shortcut-keybind', []);
        });
        const shortcutChanged = settings.connect('changed::shortcut-keybind', updateShortcut);
        window.connect('close-request', () => {
            settings.disconnect(shortcutChanged);
            return false;
        });
    }
}
