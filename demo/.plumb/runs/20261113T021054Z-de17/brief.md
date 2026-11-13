# Plumb: 1 rule needs work on http://127.0.0.1:4173/

Plumb opened the site in a real browser (Kane CLI) and ran your design rules. Change the **site source** so these rules pass.

Do not edit `rules/**`, `tests/**`, `policy/**`, `plumb.config.json`. A run where those files changed is rejected. Plumb reruns the rules after you stop, so you do not need to run Kane yourself.

Source files most recently touched: `lantern/site.js`, `lantern/catalogue.js`, `lantern/browse.html`, `lantern/lend.html`, `lantern/404.html`, `lantern/how-it-works.html`, `lantern/styles.css`, `lantern/theme.js`, `lantern/index.html`

## PL-NAV: The top menu groups pages into categories with submenus  (blocking)

**Rule.** The top navigation shows three to six category items. A category that holds several pages opens a submenu on hover and on keyboard focus, and Escape closes it.

**What failed.** Failed at step 3 of 3: "Press the Escape key. Verify the submenu closes".
**What the browser saw.** The open Browse tools submenu remained visible after the Escape key was pressed.
**Kane suggests.** Update the navigation menu so Escape dismisses an open submenu, then add a keyboard test that verifies the menu is no longer visible after Escape.
**Severity.** major, confidence 0.93.

**Usual fix.**

Group links into three to six categories. Give a category with children a button with aria-haspopup and aria-expanded. Open its menu on hover, on focus and on tap. Close it on Escape and on outside click. Do not trap focus.

Screenshot of the failing moment: `.plumb/runs/20261113T021054Z-de17/shots/pl-nav-failure.jpg`

---
Run `20261113T021054Z-de17`. 11 of 12 rules pass.
