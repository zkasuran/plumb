---
id: PL-COPY
title: Headings and labels describe a product, not a finding
severity: blocking
applies: [landing, app]
---
## Rule
Headings, section titles and status chips describe what the product gives the visitor. None of them reads like a security audit, a test report or a postmortem, and alarm labels are not used for demo or failed items.

## Why
Copy that sounds like a pentest finding makes a product page feel like an incident. Verification and security are the reason to trust the product, never its headline.

## Check
- Read the main heading, every section heading and every badge or chip on the page. Verify none of them reads like an audit finding, a test report, an incident or a postmortem, and none uses capitalised alarm wording such as "DANGER", "BROKEN" or "CHEATS ON PURPOSE", unless the product itself is a security tool.

## Fix
Rewrite each heading as what the visitor gets, for example "Buy some credits" instead of "3 sellers flagged". Move failures and checks into a later section or a collapsed group. Label demo data neutrally in a muted style, for example "demo seller".
