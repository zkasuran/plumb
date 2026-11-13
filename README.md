# Plumb

**Design rules held by a real browser, inside your agent's loop.**

Write your design rules in plain English. Plumb turns each one into a [Kane CLI](https://www.testmuai.com/kane-cli/) flow, runs it against your site in real Chrome, and hands the step that failed back to your coding agent to fix. Then it checks again.

Built for the Kane CLI Online Hackathon (12 to 19 November 2026).

```text
rules/*.md  ->  tests/plumb/*_test.md  ->  kane-cli testrun  ->  report + fix brief  ->  agent  ->  check again
 (you write)     (Plumb generates)          (real browser)        (.plumb/brief.md)
```

## Why

AI coding agents ship pages fast, and they keep breaking the same unwritten rules: no theme switch, a sticky header that covers the section you linked to, a hero that reads like an incident report. Plumb makes those rules executable. The rule is the spec, a real browser is the judge, and the agent gets the failed step instead of a vague "make it better".

## What is in the box

| Piece | What it does |
|---|---|
| **Rule packs** | 12 house rules in markdown (`rules/house`). Add your own in `rules/`. A rule with a house id replaces it. |
| **Compiler** | Rule to Kane `_test.md`, one H2 per step, tagged and hashed so only changed rules are rewritten. |
| **Runner** | `kane-cli testrun` with `--agent`, `--override-start-url` and a Kane **policy** as the gate. Parses the NDJSON streams and the sealed evidence packs. |
| **Credit-aware** | Reuses a result when neither the page nor the rule changed, keeps a credit floor, runs blocking rules first. |
| **Fix brief** | `.plumb/brief.md`: the rule, the failed step, what the browser saw, Kane's suggested change, the usual fix, a screenshot path. |
| **Loop** | `plumb loop` runs an agent (Claude Code, Codex, Kiro CLI, opencode or any command) and checks again. Snapshots the rules, tests and policy first and **restores them** if the agent touched them. |
| **Hooks and MCP** | `plumb gate` for Stop hooks (exit 2 plus the brief), an MCP server (`plumb_check`, `plumb_status`, `plumb_brief`, `plumb_rules`), Kiro and Claude installers. |
| **Studio** | Web app: runs with steps and screenshots, a loop replay player, a rules library, docs, measured costs. Works from recorded runs with no Kane. |

## Quick start

You need Node 20 or newer, Chrome and a Kane CLI account (`npm install -g @testmuai/kane-cli`, then `kane-cli login --oauth`).

```bash
git clone https://github.com/zkasuran/plumb && cd plumb && npm install && npm link

cd your-project
plumb init --url http://localhost:3000 --site-dir . --hooks kiro,claude
plumb doctor
plumb check                 # writes .plumb/brief.md when a blocking rule needs work
plumb loop --agent claude   # let an agent fix it, then check again
plumb studio                # open the Studio on http://127.0.0.1:4310
```

CI can pass `LT_USERNAME` and `LT_ACCESS_KEY`; Plumb forwards them to Kane on each command and never writes them to disk.

## Writing a rule

```markdown
---
id: ACME-CTA
title: Every page offers one clear next step
severity: blocking
---
## Rule
Each page shows one primary button above the fold.

## Check
- Look at the top of the page. Verify one primary button is visible and its label names an action.

## Fix
Put one verb-labelled button under the heading.
```

`plumb rules lint` refuses a rule that can never fail (no `Verify` step), and Kane's gate policy refuses it again at run time (`metrics.tests_without_checks == 0`).

## What a check costs

Measured with Kane CLI 0.10.4 on small pages, single runs, read from the credit balance:

| Run | Credits |
|---|---|
| Write and run a 3-step rule, passes | 47.7 |
| Write and run, stops at step 1 | 15.3 to 19.2 |
| Replay, passes | 1.9 |
| Replay, page changed, no healing | 5.3 |
| Reused (nothing changed) | 0 |

Kane does not save a failing flow, so a rule that keeps failing is written again every run. That is why Plumb reuses results.

## Layout

```text
bin/ src/        the CLI and library (zero runtime dependencies beyond yaml and picomatch)
rules/house/     the 12 house rules
policy/          the Kane gate policy
studio/          the web app (Vite, React, TypeScript)
demo/            a small site and the recorded runs
test/            node --test, using real Kane event streams as fixtures
```

```bash
npm test                      # 46 tests
cd studio && npm run build    # strict CSP, refuses development sample data
```

## Limits

A model drives the browser, so rules about judgement can vary between runs. A replay repeats what was recorded. Reuse trusts a fingerprint of the site files. Kane saves each run to your TestMu AI account by default, so do not point Plumb at pages with data you cannot share. The Studio lists these in full under Reports, Limits.

## License

Apache-2.0
