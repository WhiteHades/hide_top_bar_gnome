# Maintaining this fork

Updates happen on request. There is no scheduled updater or Fedora update hook.
GitHub Actions checks commits and pull requests. It does not change an installed
extension or publish a GNOME Extensions release.

## Review a change

Work in `~/Codes/hide-top-bar`. Check for local changes before updating. Keep edits
on a branch until the tests pass.

```bash
git status
git fetch origin
git fetch upstream
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main
```

`origin` is my fork. `upstream` is the original GitHub mirror.
Review relevant upstream commits before merging or cherry-picking them. Preserve
the fork UUID, settings schema, URL, and source credits. Do not overwrite local
changes or force-push over somebody else's work.

## Test and package

Run these checks from the repository directory:

```bash
gjs -m tests/run.js
gjs -m tests/lifecycle.js
bash scripts/build.sh
python3 tests/check-package.py
bash scripts/check-prefs.sh
bash scripts/check-runtime.sh
git diff --check
```

The preferences check uses an isolated display and temporary settings. The runtime
check starts a separate GNOME compositor. Neither check controls the live desktop.
Both print the directory containing diagnostic files.

The regression tests cover pointer timing, interrupted animations, open menus,
compositor hold ownership, Intellihide, and callback cleanup. The preferences test
checks every page at 360 and 720 pixels with three text sizes, plus settings and shortcut editing.
The native runtime test uses virtual pointer input over normal, maximized, and
fullscreen GTK windows on Wayland and XWayland, at two edge-pressure thresholds.
It checks reveal, steady hover, exit, stale input, menus, native hot-corner
activation during animation, and teardown across four activation rounds.

A private compositor does not exercise hardware direct scanout or reproduce every
display driver or interaction with other installed extensions. Keep the desktop
checks below before publication.

GitHub Actions runs the regression, preferences, and package checks. Run the native
runtime check on each GNOME major version you intend to support. Its test driver
is copied into the temporary test installation only and never ships in the ZIP.

## Install and test on the desktop

The current release is 0.2.1. Set `version-name` in `metadata.json` to the public
release label and use the same label in the changelog and Git tag, such as `v0.2.1`.
Use patch releases for fixes and minor releases for new features while developing
before 1.0. Do not change the release label for documentation-only commits.

Leave `version` out of the source metadata. GNOME Extensions assigns that separate
whole-number submission counter. See the [GNOME metadata format](https://gjs.guide/extensions/overview/anatomy.html#version-name).

The ZIP contains the schema XML. GNOME compiles it during installation. Do not
add `gschemas.compiled` to packages for the supported GNOME 50 release.

Run the checks, then install:

```bash
bash scripts/install.sh
```

Log out and back in to load the changed code. Disabling and enabling an extension
in the same session does not reliably reload its JavaScript modules. On Wayland,
do not run `gnome-shell --replace`.

Verify top-edge hover and exit with normal, maximized, and fullscreen windows.
Try rapid pointer movement, calendar and Quick Settings menus, Activities,
Dash to Dock, and your display scaling. The complete checklist is in
[PUBLISHING.md](PUBLISHING.md).

Also test with the slide duration set to zero, then restore your preferred
duration. A full-monitor app must not cover the bar after its animation ends.
The extension holds one compositor inhibition while the panel is visible and
releases it once hidden. This follows the approach used by
[Dash to Dock for the same rendering problem](https://github.com/micheleg/dash-to-dock/pull/2149).
Keep that hold separate from GNOME's temporary animation holds; never release
another extension's hold or leave ours active after disabling the extension.

After review, commit and push the change. GitHub pushes alone do not update the
copy installed on another computer.

## Restore the previous version

The installer replaces the installed fork without creating a backup. To restore
an older release, download its ZIP from GitHub Releases and pass its path:

```bash
bash scripts/rollback.sh /path/to/hide-top-bar@whitehades.github.io.shell-extension.zip
```

Log out and in afterward. Your current preferences stay unchanged.

To switch back to the original extension, if it is still installed:

```bash
bash scripts/rollback.sh
```

## GNOME upgrades and bug reports

Only GNOME 50 is currently declared as supported. GNOME can change the private
Shell interfaces this extension uses. Test a new major version before adding it
to `shell-version`; keep GNOME's version validation enabled.

For a bug report, include your GNOME version, the app involved, whether its window
was normal, maximized or fullscreen, and the steps that caused the problem.
These commands show the installed extension and recent Shell errors:

```bash
gnome-shell --version
gnome-extensions info hide-top-bar@whitehades.github.io
journalctl --user -b --no-pager _COMM=gnome-shell | tail -n 100
```

Review logs before sharing them. The GNOME update service may report "Not Found"
for this UUID until the fork has a GNOME Extensions listing. That lookup does not
mean the locally installed extension failed to load.

## Publication

Follow [PUBLISHING.md](PUBLISHING.md) and test on the desktop before submitting
a release. Keep the same UUID for future releases.
