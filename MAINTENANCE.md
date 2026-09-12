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

`origin` is WhiteHades's repository. `upstream` is the original GitHub mirror.
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
Intellihide, and callback cleanup. The preferences test checks every page at
360 and 720 pixels with three text sizes, plus settings and shortcut editing.
The native runtime test uses virtual pointer input over normal, maximized, and
fullscreen GTK windows. It checks reveal, steady hover, exit, menu behavior,
and teardown across four activation rounds.

A private compositor does not reproduce every display driver or interaction with
other installed extensions. Keep the desktop checks below before publication.

GitHub Actions runs the regression, preferences, and package checks. Run the native
runtime check on each GNOME major version you intend to support. Its test driver
is copied into the temporary test installation only and never ships in the ZIP.

## Install and test on the desktop

Increment `version` in `metadata.json` for an update. Run the checks, then install:

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

After review, commit and push the change. GitHub pushes alone do not update the
copy installed on another computer.

## Restore the previous version

The installer saves the existing fork under
`~/.local/state/hide-top-bar/backups/`. It prints the exact directory. To restore
one of those ZIP files:

```bash
bash scripts/rollback.sh /path/to/backup/hide-top-bar@whitehades.github.io.shell-extension.zip
```

Log out and in afterward. Your current preferences stay unchanged. Backups remain
until you remove them. If you set `XDG_STATE_HOME`, backups use that directory.

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

Follow [PUBLISHING.md](PUBLISHING.md). Desktop testing and WhiteHades's approval
come before a GNOME Extensions submission. Keep the same UUID for future releases.
