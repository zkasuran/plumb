---
id: PL-THEME
title: Light and dark themes both work and the choice sticks
severity: blocking
applies: [landing, app]
---
## Rule
Every page offers a visible theme switch. Switching changes the page colours, and the choice survives a reload.

## Why
Some people read in the dark and some in daylight. A site that ships only one theme, or forgets the choice on reload, makes them fight it every visit.

## Check
- Look for a control that switches the page between a light and a dark theme. Verify such a control is visible.
- Click the theme control. Verify the page background colour changed.
- Reload the page. Verify the page still shows the theme that was chosen before the reload.

## Fix
Add a toggle button in the header with an accessible label such as "Switch between light and dark theme". Define colours as tokens swapped by a data-theme attribute on the root element. Save the choice in localStorage and read it in a small inline script in the head, before any stylesheet, so there is no flash of the wrong theme.
