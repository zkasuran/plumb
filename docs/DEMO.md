# Demo script (3 minutes)

Judges stop at 3:00 and watch the first minute closely. Lead with the loop.

| Time | On screen | Say |
|---|---|---|
| 0:00 | Terminal, `plumb check` already red. The brief on the right. | "An agent built this site. These are the design rules it broke. A real browser found them." |
| 0:20 | `plumb loop --agent opencode` starts. Progress lines: rule by rule, Kane running in Chrome. | "Plumb gives the failed step to the agent and checks again. I'm not touching anything." |
| 0:50 | Chrome window driven by Kane (visible run), a rule failing at a named step. | "This is Kane: it looked for a theme switch and did not find one." |
| 1:10 | Agent line: changed N files. Second check: more rules green. | "Second check: the rules it fixed turn green. One slipped, so it tries again." |
| 1:40 | Final: all blocking rules pass. Credits used printed. | "Done. Here is what it cost." |
| 1:55 | Studio, Loops, the recorded replay player. Before and after screenshots of a rule. | "Every result is a real run. Before, after, and the steps Kane took." |
| 2:25 | Terminal: agent edits `rules/PL-THEME.md`. Plumb restores it. | "The agent can't weaken the rules. Plumb snapshots them and puts them back." |
| 2:40 | `plumb hook install kiro`, MCP tool in the agent. Credits table in the Studio. | "Works in Kiro and Claude Code, and replays cost about two credits." |
| 2:55 | Studio home. | "Plumb: design rules held by a real browser." |

## Checklist before recording

- Credits above 400 (`plumb doctor`).
- `plumb check --dry-run` shows the expected reuse.
- Chrome visible (`kane.headless: false` for the recording only).
- Studio built with real data: `plumb export --out studio/public/data && cd studio && npm run build`.
- Unlisted video link tested in an incognito window.
