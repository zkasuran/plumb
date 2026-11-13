# Plumb: 6 rules need work on http://127.0.0.1:4173/

Plumb opened the site in a real browser (Kane CLI) and ran your design rules. Change the **site source** so these rules pass.

Do not edit `rules/**`, `tests/**`, `policy/**`, `plumb.config.json`. A run where those files changed is rejected. Plumb reruns the rules after you stop, so you do not need to run Kane yourself.

Source files most recently touched: `lantern/browse.html`, `lantern/index.html`, `lantern/styles.css`, `lantern/theme.js`

## PL-CONSISTENT: Every page uses the same navigation and footer  (blocking)

**Rule.** All pages share one design system. The navigation labels and the footer on the home page appear unchanged on the other pages.

**What failed.** The run did not finish.
**Kane said.** project/folder gate failed: error: profile "default" (prod) has no project/folder configured AND no TMS credentials were available to auto-configure one.

**Usual fix.**

Render the navigation and footer from one shared component or template. Remove page-specific headers and old stylesheets.

## PL-CONSOLE: Pages load and work without console errors or blocked resources  (blocking)

**Rule.** Browsing the main pages produces no console errors, no failed requests and no Content Security Policy violations.

**What failed.** The run did not finish.
**What the browser saw.** Failed to load resource: the server responded with a status of 404 (Not Found) | Failed to load resource: the server responded with a status of 404 (Not Found)
**Kane suggests.** Fix each console error listed, then rerun. Add any missing file such as the favicon.
**Severity.** major, confidence 1.

**Usual fix.**

Open the browser console, fix each error, and add any missing file such as the favicon. Remove inline scripts or hash them in the Content Security Policy.

Console findings (2): `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 404 (Not Found)`

## PL-NAV: The top menu groups pages into categories with submenus  (blocking)

**Rule.** The top navigation shows three to six category items. A category that holds several pages opens a submenu on hover and on keyboard focus, and Escape closes it.

**What failed.** Failed at step 2 of 3: "Hover over a top-level item that groups several pages. Verify a submenu opens and lists that item's pages or sections".
**What the browser saw.** The run did not successfully hover and preserve the expanded navigation menu before checking it. It then incorrectly concluded that a submenu had opened.
**Kane suggests.** Repeat the run by moving the pointer onto “Browse tools,” wait until its menu is visibly shown, and verify the visible menu items before making the final check.
**Severity.** minor, confidence 0.96.

**Usual fix.**

Group links into three to six categories. Give a category with children a button with aria-haspopup and aria-expanded. Open its menu on hover, on focus and on tap. Close it on Escape and on outside click. Do not trap focus.

Screenshot of the failing moment: `.plumb/runs/20261113T015022Z-b4d5/shots/pl-nav-s2.jpg`

Console findings (1): `Failed to load resource: the server responded with a status of 404 (Not Found)`

## PL-THEME: Light and dark themes both work and the choice sticks  (blocking)

**Rule.** Every page offers a visible theme switch. Switching changes the page colours, and the choice survives a reload.

**What failed.** Failed at step 2 of 3: "Click the theme control. Verify the page background colour changed".
**What the browser saw.** The theme control accepted the click but did not apply the expected dark background to the page.
**Kane suggests.** Check the theme control’s click handler and the dark-theme styles. Ensure the chosen theme is applied to the page background after the control is selected.
**Severity.** major, confidence 0.96.

**Usual fix.**

Add a toggle button in the header with an accessible label such as "Switch between light and dark theme". Define colours as tokens swapped by a data-theme attribute on the root element. Save the choice in localStorage and read it in a small inline script in the head, before any stylesheet, so there is no flash of the wrong theme.

Screenshot of the failing moment: `.plumb/runs/20261113T015022Z-b4d5/shots/pl-theme-failure.jpg`

Console findings (1): `Failed to load resource: the server responded with a status of 404 (Not Found)`

## PL-CONTRAST: Text stays readable in both themes  (advisory)

**Rule.** Body text and muted text are comfortably legible against their background in the light theme and in the dark theme.

**What failed.** Failed at step 2 of 2: "Switch to the other theme with the theme control. Verify the body text and the smaller muted text are still clearly legible".
**What the browser saw.** The theme control accepts activation but does not visibly switch the page to the other theme.
**Kane suggests.** Check the theme-control click and keyboard handlers and the code that applies the selected theme to the page. Retest both themes and confirm normal and muted text remain readable after the page actually changes theme.
**Severity.** major, confidence 0.84.

**Usual fix.**

Define text and background as paired tokens per theme and keep contrast at AA or better. Tune muted text separately for each theme.

Screenshot of the failing moment: `.plumb/runs/20261113T015022Z-b4d5/shots/pl-contrast-failure.jpg`

Console findings (1): `Failed to load resource: the server responded with a status of 404 (Not Found)`

## PL-NOTFOUND: A missing page shows a designed not-found page with a way home  (advisory)

**Rule.** Opening an address that does not exist shows a page in the site's own design, with the navigation and a link back home, not a blank screen or a raw server error.

**What failed.** Failed at step 1 of 1: "Open the site's address followed by the path /plumb-missing-page-404. Verify a page in the site's own design appears with a heading that says the page was not found and a link back to the home page".
**What the browser saw.** The site does not serve its branded missing-page screen for this address. It returns a plain 404 response, so visitors cannot see the expected message or use a link back home.
**Kane suggests.** Configure this missing address to render the site's page-not-found design, including a clear not-found heading and a link to the home page.
**Severity.** major, confidence 0.98.

**Usual fix.**

Add a 404 page that reuses the shared header and footer, says plainly that the page was not found, and links home. Configure the host to serve it for unknown paths.

Screenshot of the failing moment: `.plumb/runs/20261113T015022Z-b4d5/shots/pl-notfound-failure.jpg`

Console findings (2): `Failed to load resource: the server responded with a status of 404 (Not Found)`; `Failed to load resource: the server responded with a status of 404 (Not Found)`

---
Run `20261113T015022Z-b4d5`. 6 of 12 rules pass.
