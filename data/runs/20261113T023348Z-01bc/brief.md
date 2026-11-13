# Plumb: 1 rule needs work on http://127.0.0.1:4310/

Plumb opened the site in a real browser (Kane CLI) and ran your design rules. Change the **site source** so these rules pass.

Do not edit `rules/**`, `tests/**`, `policy/**`, `plumb.config.json`. A run where those files changed is rejected. Plumb reruns the rules after you stop, so you do not need to run Kane yourself.

Source files most recently touched: `../studio/dist/404.html`, `../studio/dist/assets/index-Om_M-8_Y.css`, `../studio/dist/assets/index-YBWxcqkb.js`, `../studio/dist/index.html`, `../studio/dist/data/runs/20261113T022348Z-467b/brief.md`, `../studio/dist/data/runs/20261113T021054Z-de17/brief.md`, `../studio/dist/data/runs/20261113T015022Z-b4d5/brief.md`

## PL-CONSISTENT: Every page uses the same navigation and footer  (blocking)

**Rule.** All pages share one design system. The navigation labels and the footer on the home page appear unchanged on the other pages.

**What failed.** Failed at step 2 of 2: "Verify on each of those pages that the navigation shows the same labels as the stored home_nav and that the page has the same footer as the home page".
**What the browser saw.** The test setup saved navigation information but did not save the home page footer needed by this objective.
**Kane suggests.** Update the test setup to visit the home page first and store a footer snapshot or normalized footer text alongside the saved navigation labels.
**Severity.** major, confidence 0.97.

**Usual fix.**

Render the navigation and footer from one shared component or template. Remove page-specific headers and old stylesheets.

Screenshot of the failing moment: `.plumb/runs/20261113T023348Z-01bc/shots/pl-consistent-failure.jpg`

---
Run `20261113T023348Z-01bc`. 7 of 8 rules pass.
