---
id: PL-FOCUS
title: Keyboard focus is visible and reaches the main actions
severity: advisory
applies: [landing, app]
---
## Rule
Pressing Tab moves a clearly visible focus ring through the links and buttons in a sensible order, and reaches the primary action.

## Why
Keyboard users cannot use a page where they cannot see where they are.

## Check
- Press the Tab key four times. Verify a visible focus ring or outline marks the element that has focus after each press.

## Fix
Do not remove outlines. Add a focus-visible style with a two pixel ring in the accent colour to links, buttons and form fields.
