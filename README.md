# Hide Top Bar (WhiteHades)

A personal fork of Hide Top Bar for GNOME Shell 50, with a normally hidden panel
that appears at the top edge, including over fullscreen applications.

Derived from [tuxor1337/Hide Top Bar](https://github.com/tuxor1337/hidetopbar).
Credit belongs to Thomas Vogt, Mathieu Lutfy, Philip Witte, and upstream contributors.
See [ATTRIBUTION.md](ATTRIBUTION.md) and the unchanged [GPL license](COPYING.txt).
Git history is preserved. Fork repository: https://github.com/WhiteHades/hide_top_bar_gnome

## Changes

- Do not let Shell's fullscreen chrome tracking hide a panel that hover is revealing.
- Keep panel geometry relative to the primary monitor rather than the animated position.
- Coalesce repeated requests instead of restarting the same show/hide transition.
- Poll the pointer every 50 ms only while the revealed panel needs tracking
  (upstream used 10 ms). Edge reveal still uses the native pressure barrier.
- Retain one signal owner; dispose pressure barriers, pending callbacks and menu listeners.
- Restore the existing overview search style when disabling the extension.
- Separate extension UUID and settings namespace from upstream; no automatic upstream overwrite.

These are targeted fixes, not a claim that every GNOME/extension interaction is fixed.
The reduced polling rate is not a measured system-wide speedup.

## Install or update locally

Dependencies: GNOME Shell 50, GJS, Python 3 with PyGObject, GLib tools, gettext.
From this checkout:

```bash
bash scripts/install.sh
```

Log out and back in when prompted. On Wayland, do not run `gnome-shell --replace`.
The installer enables `hide-top-bar@whitehades.github.io` and disables the original
extension. It keeps the original files for rollback and leaves other extensions alone.

Settings:

```bash
gnome-extensions prefs hide-top-bar@whitehades.github.io
```

Defaults: mouse-edge reveal on, Intellihide off, reveal in fullscreen on.
Disable mouse-triggers-overview if you want only the panel to appear.

## Rollback

```bash
bash scripts/rollback.sh
```

Then log out and in. This selects the original extension, provided it is still installed.
For a plain native top bar instead, disable both extensions in Extensions.

## Maintain the fork

Maintenance is manual and on request. This fork does not install a background
updater, schedule compatibility checks, or automatically change after Fedora/GNOME
updates. GitHub checks run when commits are pushed or pull requests are opened;
they do not update your desktop. Ask for a compatibility fix when you need one.

`origin` is your GitHub repository; `upstream` is the original GitHub mirror.

```bash
git status
git fetch upstream
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main
```

Review upstream changes on a new branch. Cherry-pick relevant commits or merge and
resolve conflicts; preserve the fork UUID, schema, URL, credits and fixes. Do not
blindly overwrite your fork with upstream files.

Before installing any change:

```bash
gjs -m tests/run.js
bash scripts/build.sh
git diff --check
# Optional isolated GNOME runtime check on a GNOME 50 machine:
bash scripts/check-runtime.sh
```

After installation, verify normal/maximized/fullscreen windows, rapid hover in/out,
open panel menus, overview, monitor changes, and disable/re-enable. Test with your
other extensions (including Dash to Dock). Check errors:

```bash
gnome-extensions info hide-top-bar@whitehades.github.io
journalctl --user -b --no-pager | rg 'hide-top-bar|hidetopbar|JS ERROR'
```

Commit and push only after reviewing the result. Increment metadata.json version
for releases. GitHub Actions runs the automated checks and uploads the ZIP artifact.
GNOME major upgrades may change private Shell APIs: test before adding a new version
to `shell-version`. Do not disable GNOME's compatibility validation.

## Test limits

The regression suite uses mocked Shell objects to test animation/hover decisions,
monitor geometry, and resource disposal. Real compositor interaction must also be
checked on the desktop; it cannot establish absence of all bugs or performance regressions.

## GNOME Extensions publication

Publication is pending your desktop testing and approval. See [PUBLISHING.md](PUBLISHING.md)
for the acceptance checklist and submission steps. The listing is not live yet;
GNOME may log an update lookup as "Not Found" for this private UUID in the meantime.
That lookup is separate from whether the installed extension is active.
