# Changes

## 0.2.1

- Keep native Activities corner detection active while the bar slides.
- Animate the visual offset without rebuilding GNOME corner barriers each frame.
- Respect the system hot-corner switch and restore the right corner after monitor changes.
- Ignore queued edge hits once the pointer has left the panel area.
- Test Wayland and XWayland windows, including maximized and fullscreen apps,
  with zero and nonzero edge pressure.
- Match GNOME's schema naming rules and let the installer compile settings locally.
- Pass the extension identity directly to desktop-icons integration.

## 0.2

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
- Use release label 0.2 and install updates without creating automatic backups.
- Add regression, native preferences, compositor, and package-content tests.

## 0.1

- Create the WhiteHades fork with its own extension UUID and settings schema.
- Allow top-edge reveal over fullscreen windows.
- Correct panel positioning on monitors with a nonzero vertical origin.
- Coalesce duplicate animation requests and reduce revealed-panel pointer polling.
- Add local installation, packaging, GitHub checks, and publication instructions.
