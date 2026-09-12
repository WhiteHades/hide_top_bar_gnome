# GNOME Extensions submission plan

Version **0.2.1** is installed locally for testing. WhiteHades has authorized
publication. Submission is pending verification of the reported ChatGPT hover
flicker after loading this update. Automated checks and the Shexli submission
checker pass. Public availability requires GNOME review.

## Acceptance test on the actual desktop

After logging out and in, verify that Extensions lists **Hide Top Bar (WhiteHades)**
as enabled and the original Hide Top Bar as disabled.

- Desktop with no windows: panel hidden; top-edge hover reveals the entire panel.
- One maximized window: same behavior; no repeated animation or clipped buttons.
- One true fullscreen window (for example F11 in a browser): hover reveals the
  whole panel; moving away hides it without exiting fullscreen.
- Open Quick Settings/calendar: the panel remains visible while the menu is open.
- Repeated quick hover in/out: no down/up/down flicker, stuck state, or clipped panel.
- Leave the panel and keep the pointer outside: it hides once and stays hidden.
- Preferences: all controls fit, including with larger text and a narrow window.
- Activities overview: panel behaves according to Show in Overview preference.
- With both GNOME and extension hot corners enabled, approaching the native
  corner opens Activities during a panel slide without waiting for it to finish.
- Turn the system hot-corner switch off and on, then repeat.
- Test ChatGPT with a maximized window and true fullscreen, including slow pointer
  exit and fast re-entry at several positions along the top edge.
- Repeat with the slide duration at zero. Full-monitor apps must not cover the
  bar while the pointer is held over it. Restore the preferred duration afterward.
- Dash to Dock still behaves correctly.
- Disable and re-enable: native panel is restored while disabled; no duplicate callbacks.
- If available, test monitor hotplug, a different primary display, and scaling changes.

Report the app name, whether it was maximized or true fullscreen, GNOME version,
and exact steps for any failure. Do not claim every issue is fixed based only on CI.

## Submission after acceptance

1. Read https://gjs.guide/extensions/review-guidelines/review-guidelines.html again.
2. Ensure README, ATTRIBUTION.md, COPYING.txt and source headers retain upstream credit.
3. Review the runtime code and cleanup paths. Existing desktop-icons integration
   interacts with other extensions and remains subject to reviewer discretion.
4. Run all checks in [MAINTENANCE.md](MAINTENANCE.md#test-and-package).
5. Run `bash scripts/build.sh` and review the contents of the ZIP under `dist/`.
6. Capture a screenshot showing the fork and accurately describe its differences.
7. Sign in to https://extensions.gnome.org/ and upload the ZIP via its submission flow.
8. Wait for review; address reviewer feedback in this GitHub repository. Acceptance
   and publishing time are controlled by GNOME reviewers, not this project.

The UUID is `hide-top-bar@whitehades.github.io`; retain it for future submissions.
The listing URL should point to https://github.com/WhiteHades/hide_top_bar_gnome.
Only GNOME 50 is currently declared/tested. Do not claim other major versions
without testing. The package contains readable JavaScript and does not include
installation scripts, tests, credentials, firmware, or Git history.

## Updates after approval

Keep the same UUID. Update `version-name`, run the tests, install locally,
complete the acceptance checks, then upload the new ZIP to the existing GNOME
Extensions listing. The website assigns its own integer `version`; keep the public
release label, currently `0.2.1`, in `version-name`.
GitHub pushes alone do not update either the desktop installation or the GNOME listing.
