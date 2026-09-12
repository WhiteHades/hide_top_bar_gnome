# Hide Top Bar (WhiteHades)

Hide GNOME's top bar until you need it. Move the pointer to the top edge to reveal
it, then move away to hide it. The bar stays visible while you use its menus,
including over fullscreen apps.

Current version: **0.2.1**. Supports GNOME 50, tested on Fedora 44 with GNOME 50.4.

## Why this fork exists

The original version we started from flickered during hover on GNOME 50 and
cropped the settings window. This fork fixes those problems with a cancellable
hide delay, animation reversals that preserve the panel's position, fullscreen
reveal fixes, and settings that wrap and scroll. Native hot corners keep working
during panel animations. Tests cover Wayland and XWayland windows, pointer
timing, menus, monitor changes, and larger text.

## Install

On Fedora, install the build tools:

```bash
sudo dnf install git gjs gettext glib2 python3-gobject
```

Then download and install the extension:

```bash
mkdir -p ~/Codes
git clone https://github.com/WhiteHades/hide_top_bar_gnome.git ~/Codes/hide-top-bar
cd ~/Codes/hide-top-bar
bash scripts/install.sh
```

Log out and back in to load it. The installer enables this fork, disables the
original Hide Top Bar, and replaces the installed fork without creating a backup.

## Use

Open the **Extensions** app and choose the settings for **Hide Top Bar (WhiteHades)**.
You can adjust animations, fullscreen behavior, and keyboard shortcuts there.
Keep **Intellihide** off if you want the bar hidden whenever you are not using it.

For Activities from the top-left corner, enable **Hot Corner** in GNOME Settings
and **Keep hot corner sensitive, even in hidden state** in the extension. The
corner keeps GNOME's normal behavior without waiting for the bar to slide down.

The bar waits 150 ms after the pointer leaves before hiding. Returning during
that delay keeps it open. Turn the extension off in Extensions to restore the
normal GNOME top bar.

## Update or restore

Updates are manual. To install changes from this repository:

```bash
cd ~/Codes/hide-top-bar
git pull --ff-only
bash scripts/install.sh
```

Log out and back in afterward. See [maintenance and recovery](MAINTENANCE.md)
for older releases, troubleshooting, and developer tests, or [changes](CHANGELOG.md)
for the version history.

Release packages appear under [GitHub Releases](https://github.com/WhiteHades/hide_top_bar_gnome/releases).
GNOME Extensions submission is in progress. [Publication status](PUBLISHING.md).

Based on [Hide Top Bar](https://github.com/tuxor1337/hidetopbar) by Thomas Vogt, Mathieu Lutfy, Philip Witte, and contributors. [Credits and GPL license](ATTRIBUTION.md).
