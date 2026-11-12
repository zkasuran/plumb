---
id: PL-CONTRAST
title: Text stays readable in both themes
severity: advisory
applies: [landing, app]
---
## Rule
Body text and muted text are comfortably legible against their background in the light theme and in the dark theme.

## Why
Low contrast is the most common reason a dark or light variant ships half finished.

## Check
- Look at the page in its current theme. Verify the body text and the smaller muted text are clearly legible against their backgrounds.
- Switch to the other theme with the theme control. Verify the body text and the smaller muted text are still clearly legible.

## Fix
Define text and background as paired tokens per theme and keep contrast at AA or better. Tune muted text separately for each theme.
