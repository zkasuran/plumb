---
id: PL-CONSOLE
title: Pages load and work without console errors or blocked resources
severity: blocking
applies: [landing, app]
evidence: [console]
---
## Rule
Browsing the main pages produces no console errors, no failed requests and no Content Security Policy violations.

## Why
A console error is a bug a visitor never reports. A CSP violation means the page is either broken or running something it should not.

## Check
- Open the home page and scroll to the bottom. Verify the page finished loading with its main content visible.
- Open one more page from the navigation. Verify that page also finished loading with its main content visible.

## Fix
Open the browser console, fix each error, and add any missing file such as the favicon. Remove inline scripts or hash them in the Content Security Policy.
