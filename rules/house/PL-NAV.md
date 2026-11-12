---
id: PL-NAV
title: The top menu groups pages into categories with submenus
severity: blocking
applies: [landing, app]
---
## Rule
The top navigation shows three to six category items. A category that holds several pages opens a submenu on hover and on keyboard focus, and Escape closes it.

## Why
A flat pile of links makes visitors read everything to find one thing. Categories with submenus let them scan the structure of the whole site from the first screen.

## Check
- Look at the main navigation bar. Verify it shows between 3 and 6 top-level items.
- Hover over a top-level item that groups several pages. Verify a submenu opens and lists that item's pages or sections.
- Press the Escape key. Verify the submenu closes.

## Fix
Group links into three to six categories. Give a category with children a button with aria-haspopup and aria-expanded. Open its menu on hover, on focus and on tap. Close it on Escape and on outside click. Do not trap focus.
