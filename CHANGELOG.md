# Changes

## Version 2

- Keep the revealed panel steady during brief pointer exits and rapid re-entry.
- Hide after the pointer has stayed outside for 150 ms. Check the pointer and
  open menus again before hiding.
- Reverse an interrupted slide from its current position. Ignore callbacks from
  replaced animations and remove pointer tracking once the panel is hidden.
- Keep hover and menus in control when Intellihide detects an overlapping window.
- Refresh panel bounds and edge barriers after size or monitor changes.
- Remove duplicate window listeners and work that could outlive the extension.
- Replace the cropped settings layout with native Adwaita pages that wrap and scroll.
- Correct saved keyboard shortcut display and editing on GTK 4.
- Rename the extension to Hide Top Bar (WhiteHades).
- Back up the installed fork before replacing it and support restoring that backup.
- Add regression, native preferences, compositor, and package-content tests.

## Version 1

- Create the WhiteHades fork with its own extension UUID and settings schema.
- Allow top-edge reveal over fullscreen windows.
- Correct panel positioning on monitors with a nonzero vertical origin.
- Coalesce duplicate animation requests and reduce revealed-panel pointer polling.
- Add local installation, packaging, GitHub checks, and publication instructions.
