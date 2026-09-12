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

import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as PointerWatcher from 'resource:///org/gnome/shell/ui/pointerWatcher.js';
const [major] = Config.PACKAGE_VERSION.split('.');
const shellVersion = Number.parseInt(major);

import * as Convenience from './convenience.js';
import * as Intellihide from './intellihide.js';
import * as DesktopIconsIntegration from './desktopIconsIntegration.js';
const DEBUG = Convenience.DEBUG;

const MessageTray = Main.messageTray;
const PanelBox = Main.layoutManager.panelBox;
const ShellActionMode = (
    Shell.ActionMode ? Shell.ActionMode : Shell.KeyBindingMode
);
const _searchEntryBin = Main.overview._overview._controls._searchEntryBin;
const HIDE_DELAY_MS = 150;

export class PanelVisibilityManager {

    constructor(settings, monitorIndex) {
        this._monitorIndex = monitorIndex;
        this._base_y = Main.layoutManager.primaryMonitor?.y ?? 0;
        this._settings = settings;
        this._preventHide = false;
        this._showInOverview = true;
        this._destroyed = false;
        this._targetVisible = null;
        this._allocationSignal = 0;
        this._savedSearchStyle = _searchEntryBin?.style ?? null;
        this._intellihideBlock = false;
        this._staticBox = new Clutter.ActorBox();
        this._animationActive = false;
        this._animationSerial = 0;
        this._hideTimeoutId = 0;
        this._shortcutTimeout = null;

        this._desktopIconsUsableArea = (
            new DesktopIconsIntegration.DesktopIconsUsableAreaClass()
        );
        Main.layoutManager.removeChrome(PanelBox);
        Main.layoutManager.addChrome(PanelBox, {
            affectsStruts: false,
            trackFullscreen: false
        });

        // We lost the original notification's position because of
        // PanelBox->affectsStruts = false and now it appears beneath the
        // top bar, fix it
        this._oldEase = MessageTray._bannerBin.ease;
        MessageTray._bannerBin.ease = (
            function(params) {
                if (params.hasOwnProperty("y") && PanelBox.visible && PanelBox.y >= this._base_y) {
                    params.y += PanelBox.height;
                }
                this._oldEase.apply(MessageTray._bannerBin, arguments);
            }
        ).bind(this);

        this._pointerWatcher = PointerWatcher.getPointerWatcher();
        this._pointerListener = null;

        // Load settings
        this._bindSettingsChanges();
        this._updateSettingsMouseSensitive();
        this._updateSettingsShowInOverview();
        this._intellihide = new Intellihide.Intellihide(
            this._settings, this._monitorIndex,
        );

        this._updateHotCorner(false);
        this._updateStaticBox();
        this._bindTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 100, this._bindUIChanges.bind(this),
        );
    }

    hide(animationTime, trigger) {
        DEBUG("hide(" + trigger + ")");
        if(this._destroyed || this._preventHide) return;
        if (this._targetVisible === false) return;

        const delta_y = -PanelBox.height;
        let mouse = global.get_pointer();
        if(trigger == "mouse-left" && this._isHovering(...mouse)) return;
        this._cancelHideTimeout();
        this._targetVisible = false;
        const animationSerial = ++this._animationSerial;

        // Keep watching until fully hidden so re-entering can reverse the slide.
        if(this._animationActive) {
            PanelBox.remove_all_transitions();
            this._animationActive = false;
        }

        this._animationActive = true;
        PanelBox.ease({
            y: this._base_y + delta_y,
            duration: animationTime * 1000,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._destroyed || animationSerial !== this._animationSerial)
                    return;
                this._animationActive = false;
                this._removePointerWatch();
                if (!this._settings.get_boolean('keep-round-corners')) {
                    PanelBox.hide();
                }
                this._updateHotCorner(true);
            }
        });
    }

    show(animationTime, trigger) {
        DEBUG("show(" + trigger + ")");
        if (this._destroyed) return;
        this._cancelHideTimeout();
        if (trigger !== "destroy")
            this._ensurePointerWatch();
        if (trigger !== "destroy" && this._targetVisible === true) return;
        this._targetVisible = true;
        const animationSerial = ++this._animationSerial;
        if(trigger == "mouse-enter"
           && this._settings.get_boolean('mouse-triggers-overview')) {
            Main.overview.show();
        }

        if(this._animationActive) {
            PanelBox.remove_all_transitions();
            this._animationActive = false;
        }

        this._updateHotCorner(false);
        PanelBox.show();
        if(trigger == "destroy"
           || (
               trigger == "showing-overview"
               && global.get_pointer()[1] < PanelBox.height
               && this._settings.get_boolean('hot-corner')
              )
          ) {
            PanelBox.y = this._base_y;
        } else {
            this._animationActive = true;
            PanelBox.ease({
                y: this._base_y,
                duration: animationTime * 1000,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: () => {
                    if (this._destroyed || animationSerial !== this._animationSerial)
                        return;
                    this._animationActive = false;
                    this._updateStaticBox();
                    this._handleMenus();
                }
            });
        }
    }

    _isHovering(x, y) {
        // The visible target follows current geometry, not a sliding actor's y
        // or an overlap rectangle cached before a theme/scale change.
        return y >= this._base_y && y < this._base_y + PanelBox.height &&
            x >= PanelBox.x && x < PanelBox.x + PanelBox.width;
    }

    _ensurePointerWatch() {
        if (!this._pointerListener)
            this._pointerListener = this._pointerWatcher.addWatch(
                50, this._handlePointer.bind(this));
    }

    _removePointerWatch() {
        if (this._pointerListener) {
            this._pointerWatcher._removeWatch(this._pointerListener);
            this._pointerListener = null;
        }
    }

    _cancelHideTimeout() {
        if (this._hideTimeoutId) {
            GLib.source_remove(this._hideTimeoutId);
            this._hideTimeoutId = 0;
        }
    }

    _handlePointer(x, y) {
        if (this._destroyed) return;
        if (this._isHovering(x, y)) {
            this._cancelHideTimeout();
            if (this._targetVisible === false && this._animationActive)
                this.show(this._settings.get_double('animation-time-autohide'),
                    "mouse-enter");
        } else {
            this._handleMenus();
        }
    }

    _handleMenus() {
        if (this._destroyed) return;
        if (Main.overview.visible || this._preventHide ||
            this._isHovering(...global.get_pointer())) {
            this._cancelHideTimeout();
            return;
        }

        const blocker = Main.panel.menuManager.activeMenu;
        if (blocker) {
            this._cancelHideTimeout();
            if (this._blockerMenu === blocker) return;
            if (this._blockerMenu && this._menuEvent)
                this._blockerMenu.disconnect(this._menuEvent);
            this._blockerMenu = blocker;
            this._menuEvent = blocker.connect('open-state-changed', (menu, open) => {
                if (!open && this._blockerMenu === menu) {
                    menu.disconnect(this._menuEvent);
                    this._menuEvent = null;
                    this._blockerMenu = null;
                    this._handleMenus();
                }
            });
            return;
        }

        // A brief crossing while the panel moves under the pointer must not
        // immediately reverse the reveal. Repeated events share one timer.
        if (this._hideTimeoutId || this._targetVisible !== true) return;
        this._hideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HIDE_DELAY_MS, () => {
            this._hideTimeoutId = 0;
            if (this._destroyed) return GLib.SOURCE_REMOVE;
            if (Main.panel.menuManager.activeMenu) {
                this._handleMenus();
            } else if (!Main.overview.visible && !this._preventHide &&
                !this._isHovering(...global.get_pointer())) {
                this.hide(this._settings.get_double('animation-time-autohide'), "mouse-left");
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    _handleShortcut() {
        let delay_time = this._settings.get_double('shortcut-delay');
        if(this._shortcutTimeout) {
            if(this._shortcutTimeout !== true) {
                GLib.source_remove(this._shortcutTimeout);
            }
            this._shortcutTimeout = null;
            if(delay_time < 0.05
               || this._settings.get_boolean('shortcut-toggles')) {
                this._intellihideBlock = false;
                this._preventHide = false;
                this.hide(
                    this._settings.get_double('animation-time-autohide'),
                    "shortcut"
                );
                return;
            }
        }

        // If setting 'shortcut-toggles' is false, repeatedly pressing the
        // shortcut should prevent the bar from hiding
        if(!this._preventHide || this._intellihideBlock) {
            this._intellihideBlock = true;
            this._preventHide = true;

            if(delay_time > 0.05) {
                let show_time = Math.min(
                  this._settings.get_double('animation-time-autohide'),
                  Math.max(0.1, delay_time/5.0));
                this.show(show_time, "shortcut");

                this._shortcutTimeout = GLib.timeout_add(
                    GLib.PRIORITY_DEFAULT, delay_time*1200,
                    () => {
                        this._preventHide = false;
                        this._intellihideBlock = false;
                        this._handleMenus();
                        this._shortcutTimeout = null;
                        return false;
                    }
                );
            } else {
                this.show(
                    this._settings.get_double('animation-time-autohide'),
                    "shortcut"
                );
                this._shortcutTimeout = true;
            }
            // Key-focus the "Activities" button
            //  Currently, this is deactivated because we can't make sure that
            //  the panel doesn't hide as long as it has the key focus.
            // Main -> panel -> _leftBox -> (StBin) -> (panel-button)
            // Main.panel._leftBox.first_child.first_child.grab_key_focus();
        }
    }

    _disablePressureBarrier() {
        if(this._panelBarrier && this._panelPressure) {
            this._panelPressure.removeBarrier(this._panelBarrier);
            this._panelBarrier.destroy();
            this._panelBarrier = null;
        }
        if (this._panelPressure) {
            this._panelPressure.destroy();
            this._panelPressure = null;
        }
    }

    _initPressureBarrier() {
        if (!Main.layoutManager.primaryMonitor || PanelBox.width <= 0 || PanelBox.height <= 0)
            return;
        this._panelPressure = new Layout.PressureBarrier(
            this._settings.get_int('pressure-threshold'),
            this._settings.get_int('pressure-timeout'),
            ShellActionMode.NORMAL
        );
        this._panelPressure.connect(
            'trigger',
            (barrier) => {
                if (
                    Main.layoutManager.primaryMonitor?.inFullscreen
                    && !this._settings.get_boolean(
                        'mouse-sensitive-fullscreen-window'
                    )
                ) {
                    return;
                }
                this.show(
                    this._settings.get_double('animation-time-autohide'),
                    "mouse-enter"
                );
            }
        );
        this._panelBarrier = new Meta.Barrier({
            ...(shellVersion === 45  ? { display: global.display } : { backend: global.backend }),
            x1: PanelBox.x,
            x2: PanelBox.x + PanelBox.width,
            y1: this._base_y,
            y2: this._base_y,
            directions: Meta.BarrierDirection.POSITIVE_Y
        });
        this._panelPressure.addBarrier(this._panelBarrier);
    }

    _updateStaticBox() {
        DEBUG("_updateStaticBox()");
        this._staticBox.init_rect(
            PanelBox.x, this._base_y, PanelBox.width, PanelBox.height
        );
        this._intellihide.updateTargetBox(this._staticBox);
        this._desktopIconsUsableArea.resetMargins();
        this._desktopIconsUsableArea.setMargins(-1, PanelBox.height, 0, 0, 0);
    }

    _updateHotCorner(panel_hidden) {
        let HotCorner = null;
        for(let i = 0; i < Main.layoutManager.hotCorners.length; i++){
          let hc = Main.layoutManager.hotCorners[i];
          if(hc){
            HotCorner = hc;
            break;
          }
        }
        if(HotCorner){
          if(!panel_hidden || this._settings.get_boolean('hot-corner')) {
              HotCorner.setBarrierSize(PanelBox.height);
          } else {
              HotCorner.setBarrierSize(0);
          }
        }
    }

    _updateSettingsHotCorner() {
        this._updateHotCorner(this._targetVisible === false);
    }

    _updatePanelGeometry() {
        this._updateStaticBox();
        this._updateSearchEntryPadding();
        this._updateSettingsMouseSensitive();
        if (this._targetVisible === false && !this._animationActive)
            PanelBox.y = this._base_y - PanelBox.height;
    }

    _updateSettingsMouseSensitive() {
        if(this._settings.get_boolean('mouse-sensitive')) {
            this._disablePressureBarrier();
            this._initPressureBarrier();
        } else this._disablePressureBarrier();
    }

    _updateSettingsShowInOverview() {
        this._showInOverview = this._settings.get_boolean('show-in-overview');
        this._updateSearchEntryPadding();
    }

    _updateSearchEntryPadding() {
        if (!_searchEntryBin) return;
        if (!Main.layoutManager.primaryMonitor) return;
        const scale = Main.layoutManager.primaryMonitor.geometry_scale;
        const offset = PanelBox.height / scale;
        _searchEntryBin.set_style(
            this._showInOverview ? `padding-top: ${offset}px;` : null
        );
    }

    _updateIntellihideStatus() {
        if(this._settings.get_boolean('enable-intellihide')) {
            this._intellihideBlock = false;
            this._preventHide = false;
            this._intellihide.enable();
        } else {
            this._intellihide.disable();
            this._intellihideBlock = true;
            this._preventHide = false;
            this.hide(0, "init");
        }
    }

    _updatePreventHide() {
        if(this._intellihideBlock) return;

        this._preventHide = !this._intellihide.getOverlapStatus();
        let animTime = this._settings.get_double('animation-time-autohide');
        if(this._preventHide) {
            if (this._showInOverview || !Main.overview.visible)
                this.show(animTime, "intellihide");
        } else if (!Main.overview.visible) {
            if (this._targetVisible === null)
                this.hide(animTime, "intellihide");
            else
                this._handleMenus();
        }
    }

    _bindUIChanges() {
        this._signalsHandler.add(
            [
                Main.overview,
                'showing',
                () => {
                    if(this._showInOverview) {
                        this.show(
                            this._settings.get_double(
                                'animation-time-overview'
                            ),
                            "showing-overview"
                        );
                    }
                }
            ],
            [
                Main.overview,
                'hiding',
                () => {
                    this.hide(
                        this._settings.get_double('animation-time-overview'),
                        "hiding-overview"
                    );
                }
            ],
            [
                Main.panel,
                'leave-event',
                this._handleMenus.bind(this)
            ],
            [
                PanelBox,
                'notify::width',
                this._updatePanelGeometry.bind(this)
            ],
            [
                PanelBox,
                'notify::height',
                this._updatePanelGeometry.bind(this)
            ],
            [
                Main.layoutManager,
                'monitors-changed',
                () => {
                    this._base_y = Main.layoutManager.primaryMonitor?.y ?? 0;
                    this._monitorIndex = Main.layoutManager.primaryIndex;
                    this._targetVisible = null;
                    this._intellihide.disable();
                    this._updateStaticBox();
                    this._intellihide.setMonitorIndex(this._monitorIndex);
                    this._updateSettingsMouseSensitive();
                    this._updateIntellihideStatus();
                }
            ],
            [
                this._intellihide,
                'status-changed',
                this._updatePreventHide.bind(this)
            ]
        );

        Main.wm.addKeybinding("shortcut-keybind",
            this._settings, Meta.KeyBindingFlags.NONE,
            ShellActionMode.NORMAL,
            this._handleShortcut.bind(this)
        );

        if (!PanelBox.has_allocation()) {
          // after login, allocating the panel can take a second or two
          this._allocationSignal = PanelBox.connect("notify::allocation", () => {
            PanelBox.disconnect(this._allocationSignal);
            this._allocationSignal = 0;
            this._updatePanelGeometry();
            this._updateIntellihideStatus();
          });
        } else {
          this._updatePanelGeometry();
          this._updateIntellihideStatus();
        }

        this._bindTimeoutId = 0;
        return false;
    }

    _bindSettingsChanges() {
        this._signalsHandler = new Convenience.GlobalSignalsHandler();
        this._signalsHandler.addWithLabel("settings",
            [
                this._settings,
                'changed::hot-corner',
                this._updateSettingsHotCorner.bind(this)
            ],
            [
                this._settings,
                'changed::mouse-sensitive',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::pressure-timeout',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::pressure-threshold',
                this._updateSettingsMouseSensitive.bind(this)
            ],
            [
                this._settings,
                'changed::show-in-overview',
                this._updateSettingsShowInOverview.bind(this)
            ],
            [
                this._settings,
                'changed::enable-intellihide',
                this._updateIntellihideStatus.bind(this)
            ],
            [
                this._settings,
                'changed::enable-active-window',
                this._updateIntellihideStatus.bind(this)
            ]
        );
    }

    destroy() {
        if (this._destroyed) return;
        this._cancelHideTimeout();
        this._removePointerWatch();
        if (this._shortcutTimeout && this._shortcutTimeout !== true)
            GLib.source_remove(this._shortcutTimeout);
        this._shortcutTimeout = null;
        if (this._allocationSignal)
            PanelBox.disconnect(this._allocationSignal);
        this._allocationSignal = 0;
        if (this._blockerMenu && this._menuEvent)
            this._blockerMenu.disconnect(this._menuEvent);
        this._blockerMenu = null;
        this._menuEvent = null;
        if (this._bindTimeoutId) {
            GLib.source_remove(this._bindTimeoutId);
            this._bindTimeoutId = 0;
        }
        this._intellihide.destroy();
        this._signalsHandler.destroy();
        Main.wm.removeKeybinding("shortcut-keybind");
        this._disablePressureBarrier();
        if (_searchEntryBin) {
          _searchEntryBin.style = this._savedSearchStyle;
        }

        MessageTray._bannerBin.ease = this._oldEase;
        this.show(0, "destroy");
        this._destroyed = true;

        Main.layoutManager.removeChrome(PanelBox);
        Main.layoutManager.addChrome(PanelBox, {
            affectsStruts: true,
            trackFullscreen: true
        });
        this._desktopIconsUsableArea.destroy();
        this._desktopIconsUsableArea = null;
    }
};
