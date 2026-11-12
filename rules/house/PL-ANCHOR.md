---
id: PL-ANCHOR
title: A section link lands below the sticky header, not under it
severity: blocking
applies: [landing]
---
## Rule
When a link jumps to a section, the section heading ends up fully visible below the sticky header. The header never covers it.

## Why
A sticky header that hides the heading the visitor just asked for makes the link look broken.

## Check
- Scroll to the top of the page. Click a navigation link that jumps to a section on the same page.
- Verify the heading of the section that was jumped to is fully visible and is not covered by the header.

## Fix
Set scroll-padding-top on the html element and scroll-margin-top on each section to the header height plus a small gap. Give the header an opaque or blurred background so content never shows through it.
