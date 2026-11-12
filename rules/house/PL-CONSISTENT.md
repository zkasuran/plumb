---
id: PL-CONSISTENT
title: Every page uses the same navigation and footer
severity: blocking
applies: [landing, app]
---
## Rule
All pages share one design system. The navigation labels and the footer on the home page appear unchanged on the other pages.

## Why
A page with its own old header looks like a different tool and breaks trust.

## Check
- Open the home page. Store the navigation labels as 'home_nav'. Use the navigation to open two other pages of the site.
- Verify on each of those pages that the navigation shows the same labels as the stored home_nav and that the page has the same footer as the home page.

## Fix
Render the navigation and footer from one shared component or template. Remove page-specific headers and old stylesheets.
