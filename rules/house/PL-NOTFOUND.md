---
id: PL-NOTFOUND
title: A missing page shows a designed not-found page with a way home
severity: advisory
applies: [landing, app]
---
## Rule
Opening an address that does not exist shows a page in the site's own design, with the navigation and a link back home, not a blank screen or a raw server error.

## Why
Visitors mistype and follow stale links. A dead end with no way back loses them.

## Check
- Open the site's address followed by the path /plumb-missing-page-404. Verify a page in the site's own design appears with a heading that says the page was not found and a link back to the home page.

## Fix
Add a 404 page that reuses the shared header and footer, says plainly that the page was not found, and links home. Configure the host to serve it for unknown paths.
