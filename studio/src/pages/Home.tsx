import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useData, useHeadlineRun } from '../lib/data';
import { CodeBlock, EmptyState, Skeleton } from '../components/ui';
import { GateBanner, RuleRows } from '../components/RunViews';
import { Coins, Loop, Pencil, Shield, Terminal } from '../components/icons';

const RULE_SAMPLE = `---
id: ACME-CTA
title: Every page offers one clear next step
severity: blocking
---
## Rule
Each page shows one primary button above the fold.

## Check
- Look at the top of the page. Verify one primary button is
  visible and its label names an action.

## Fix
Put one verb-labelled button under the heading.`;

const WRITE_CMDS = `plumb rules new ACME-CTA     # a rule is a markdown file
plumb rules lint             # catches a rule that can never fail
plumb compile                # rules -> Kane tests`;

const SHIP_CMDS = `plumb check                  # run every rule in a real browser
plumb loop --agent claude    # check, let an agent fix, check again
plumb hook install kiro      # Kiro hooks, steering and MCP in one go`;

function Preview() {
  const { state } = useData();
  const loopId = state.status === 'ready' ? state.index.loops[0]?.id : undefined;
  const r = useHeadlineRun();
  if (state.status === 'loading' || r.status === 'loading') return <div className="card"><Skeleton lines={6} /></div>;
  if (r.status === 'error' || !r.value)
    return (
      <EmptyState title="No verdict yet" action={<Link className="btn small" to="/docs/quick-start">Run your first check</Link>}>
        Run <code>plumb check</code> and the result shows up here.
      </EmptyState>
    );
  const report = r.value;
  return (
    <div className="card run-card">
      <header>
        <div>
          <strong>{report.site.url.replace(/^https?:\/\//, '')}</strong>
          <div className="muted small">{loopId ? 'After the agent fixed it' : 'Latest check'}</div>
        </div>
        <span className="chip ok">Recorded run</span>
      </header>
      <RuleRows report={{ ...report, rules: report.rules.slice(0, 6) }} />
      {report.rules.length > 6 && (
        <div className="rule-row">
          <Link to={`/studio/runs/${report.id}`} className="small">
            and {report.rules.length - 6} more rules in the Studio
          </Link>
        </div>
      )}
    </div>
  );
}

function HomeBanner() {
  const r = useHeadlineRun();
  if (r.status !== 'ready' || !r.value) return null;
  return <GateBanner report={r.value} />;
}

export default function Home() {
  const nav = useNavigate();
  useEffect(() => {
    document.title = 'Plumb: design rules held by a real browser';
  }, []);
  const { state } = useData();
  const hasLoop = state.status === 'ready' && state.index.loops.length > 0;
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <span className="eyebrow">Design rules for sites an agent builds</span>
            <h1>
              Keep every page <em>on-brand</em>. Even the ones an agent writes.
            </h1>
            <p className="lead">Write your design rules in plain English. Plumb checks each page in a real browser, then hands the step that failed back to your coding agent to fix.</p>
            <div className="actions">
              <Link to="/docs/quick-start" className="btn primary">
                Install Plumb
              </Link>
              <button type="button" className="btn" onClick={() => nav(hasLoop && state.status === 'ready' ? `/studio/loops/${state.index.loops[0].id}` : '/studio')}>
                {hasLoop ? 'Watch a recorded run' : 'Open the Studio'}
              </button>
            </div>
            <p className="fine">Runs on Kane CLI by TestMu AI. Works with Kiro, Claude Code, Codex and any MCP client.</p>
          </div>
          <Preview />
        </div>
      </section>

      <div className="wrap">
        <section className="section" id="how">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Rules in. A real browser in the middle. A fix out.</h2>
            <p>A rule is a short markdown file. Plumb turns it into a Kane flow, runs it against your site, and writes a brief your agent can act on.</p>
          </div>
          <div className="grid three">
            <div className="card path-card">
              <span className="badge"><Pencil /></span>
              <h3>1. Write the rule</h3>
              <p className="muted">Say what must be true and how to look for it, in the words you would use with a colleague.</p>
            </div>
            <div className="card path-card">
              <span className="badge"><Terminal /></span>
              <h3>2. A browser checks it</h3>
              <p className="muted">Kane opens your site in Chrome, clicks and scrolls like a visitor, and returns pass or fail with a screenshot.</p>
            </div>
            <div className="card path-card">
              <span className="badge"><Loop /></span>
              <h3>3. The agent fixes it</h3>
              <p className="muted">The failed step, what the browser saw and a suggested change go back to the agent. Then Plumb checks again.</p>
            </div>
          </div>
          <div className="grid two">
            <div className="stack">
              <h3>A rule, as you write it</h3>
              <CodeBlock label="rules/ACME-CTA.md" code={RULE_SAMPLE} />
            </div>
            <div className="stack">
              <h3>The latest verdict</h3>
              <HomeBanner />
              <p className="muted small">Every result links to the steps Kane took and a screenshot of each one.</p>
              <Link to="/studio" className="btn">Open the Studio</Link>
            </div>
          </div>
        </section>

        <section className="section" id="paths">
          <div className="section-head">
            <span className="eyebrow">Two ways in</span>
            <h2>Write the rules, or ship the pages.</h2>
            <p>Design leads own the rules. Developers and agents ship against them. Both get the same Studio.</p>
          </div>
          <div className="grid two">
            <div className="card path-card">
              <span className="badge"><Pencil /></span>
              <h3>I write the rules</h3>
              <p className="muted">Turn your brand and UX standards into checks that run on every change.</p>
              <ol className="steps">
                <li>Describe the rule and how to look for it.</li>
                <li>Lint it, so a rule that can never fail is caught.</li>
                <li>Share the folder. Everyone checks against the same standard.</li>
              </ol>
              <CodeBlock code={WRITE_CMDS} />
              <Link className="btn" to="/docs/write-a-rule">Write a rule</Link>
            </div>
            <div className="card path-card">
              <span className="badge"><Terminal /></span>
              <h3>I ship the pages</h3>
              <p className="muted">Check your work as you go, or let your agent fix its own pages until they pass.</p>
              <ol className="steps">
                <li>Point Plumb at your running site.</li>
                <li>Run a check, or start a loop with your agent.</li>
                <li>Read the brief. Ship when the rules pass.</li>
              </ol>
              <CodeBlock code={SHIP_CMDS} />
              <Link className="btn" to="/docs/quick-start">Quick start</Link>
            </div>
          </div>
        </section>

        <section className="section" id="credits">
          <div className="section-head">
            <span className="eyebrow">Built to stay affordable</span>
            <h2>A check costs credits once. After that it is nearly free.</h2>
            <p>Kane writes each flow the first time. Replays cost a fraction, and Plumb skips rules whose page did not change.</p>
          </div>
          <div className="stats">
            <div className="card stat"><strong>47.7</strong><span>credits to write and run a 3-step rule once</span></div>
            <div className="card stat"><strong>1.9</strong><span>credits to replay the same rule</span></div>
            <div className="card stat"><strong>0</strong><span>credits when the page is unchanged</span></div>
            <div className="card stat"><strong>16 s</strong><span>for a replay, against 92 s to write it</span></div>
          </div>
          <p className="muted small">Measured with Kane CLI 0.10.4 on a three-step rule. <Link to="/reports/costs">See how we measured it</Link>.</p>
        </section>

        <section className="section" id="agents">
          <div className="section-head">
            <span className="eyebrow">Works where you build</span>
            <h2>One verdict, wherever the agent runs.</h2>
          </div>
          <div className="grid four">
            <Link className="card path-card" to="/docs/agents"><span className="badge"><Terminal /></span><h3>Kiro</h3><p className="muted small">MCP tool, steering file and hooks, installed with one command.</p></Link>
            <Link className="card path-card" to="/docs/agents"><span className="badge"><Loop /></span><h3>Claude Code</h3><p className="muted small">A Stop hook that keeps the agent working until the rules pass.</p></Link>
            <Link className="card path-card" to="/docs/agents"><span className="badge"><Shield /></span><h3>Codex and others</h3><p className="muted small">Run <code>plumb loop</code> with Codex, opencode or any command.</p></Link>
            <Link className="card path-card" to="/docs/ci"><span className="badge"><Coins /></span><h3>CI</h3><p className="muted small">Fail a pull request when a blocking rule needs work.</p></Link>
          </div>
        </section>

        <section className="section" id="trust">
          <div className="section-head">
            <span className="eyebrow">Why you can trust a pass</span>
            <h2>The agent does not grade its own homework.</h2>
            <p>Plumb snapshots the rules, the tests and the gate before the agent runs. If any of them change, the change is undone and the run is marked.</p>
          </div>
          <div className="grid three">
            <div className="card"><h3>Protected rules</h3><p className="muted">Rules, compiled tests and the policy are restored if an agent edits them.</p></div>
            <div className="card"><h3>A gate Kane enforces</h3><p className="muted">A Kane policy fails the run if any rule has no check, so a rule cannot pass by asserting nothing.</p></div>
            <div className="card"><h3>Evidence you can open</h3><p className="muted">Every run keeps Kane's screenshots, console log and steps. <Link to="/reports/evidence">See the evidence</Link>.</p></div>
          </div>
        </section>
      </div>
    </>
  );
}
