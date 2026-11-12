---
id: PL-STATUS
title: Status shows what the visitor cares about, not internals
severity: advisory
applies: [landing, app]
---
## Rule
Status text and chips say things a visitor cares about, such as "Market open" or "3 listings for sale". Internal accounts, grader names, challenge windows and contract plumbing are kept to docs or the footer.

## Why
Internal identifiers add noise and make the product look unfinished.

## Check
- Find the status text, badge or banner near the top of the page. Verify it states something a visitor cares about and shows no internal identifier, account id, job id or contract plumbing.

## Fix
Replace internal wording with a plain statement of state. Move identifiers to a details row, the docs or the footer.
