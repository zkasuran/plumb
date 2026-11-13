import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { CodeBlock, EmptyState } from '../components/ui';

interface Doc {
  slug: string;
  title: string;
  summary: string;
  body: ReactNode;
}

const T = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="table-wrap">
    <table>
      <thead>
        <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const DOCS: Doc[] = [
  {
    slug: 'quick-start',
    title: 'Quick start',
    summary: 'From install to your first verdict.',
    body: (
      <>
        <p>You need Node 20 or newer, Chrome, and a Kane CLI account. Kane CLI gives every signup 10,000 free credits.</p>
        <h2 id="install">1. Install</h2>
        <CodeBlock code={`npm install -g @testmuai/kane-cli\nkane-cli login --oauth\n\ngit clone https://github.com/zkasuran/plumb && cd plumb\nnpm install && npm link        # puts "plumb" on your PATH`} />
        <h2 id="init">2. Set up your project</h2>
        <p>Run this in the project that holds your site. Point it at the address your site runs on and, if you can, at its source folder. Plumb uses the folder to skip rules whose page did not change.</p>
        <CodeBlock code={`plumb init --url http://localhost:3000 --site-dir . --hooks kiro,claude\nplumb doctor`} />
        <p><code>plumb doctor</code> checks Kane, the sign-in, your credits, the site address and the rules.</p>
        <h2 id="check">3. Run a check</h2>
        <CodeBlock code="plumb check" />
        <p>Kane opens your site in Chrome and runs every rule. The first run writes each flow, which costs credits. Later runs replay them and cost far less. If a blocking rule needs work, Plumb writes <code>.plumb/brief.md</code> and exits with 1.</p>
        <h2 id="loop">4. Let an agent fix it</h2>
        <CodeBlock code="plumb loop --agent claude --max 4" />
        <p>Plumb hands the brief to the agent, restores any rule or test the agent edits, and checks again. It stops when every blocking rule passes or the attempts run out. Open the result in the <Link to="/studio">Studio</Link>.</p>
        <h2 id="studio">5. Open the Studio</h2>
        <CodeBlock code="plumb serve   # then open the Studio from studio/dist or npm run dev in studio/" />
      </>
    ),
  },
  {
    slug: 'write-a-rule',
    title: 'Write a rule',
    summary: 'Plain English in, a Kane test out.',
    body: (
      <>
        <p>A rule is one markdown file. It says what must be true, how a browser can look for it, and what usually fixes it.</p>
        <CodeBlock label="rules/ACME-CTA.md" code={`---\nid: ACME-CTA\ntitle: Every page offers one clear next step\nseverity: blocking\n---\n## Rule\nEach page shows one primary button above the fold.\n\n## Why\nVisitors who see no next step leave.\n\n## Check\n- Look at the top of the page. Verify one primary button is\n  visible and its label names an action.\n\n## Fix\nPut one verb-labelled button under the heading.`} />
        <h2 id="steps">Write steps Kane can follow</h2>
        <ul>
          <li>Phrase each step as something a person does, then what they should see. Start with the action, end with <code>Verify</code>.</li>
          <li>Check the outcome, not the trigger. Verify the confirmation appears, not that the button is visible.</li>
          <li>Keep a rule to eight steps. Kane is most reliable under about fifteen actions.</li>
          <li>Do not use double braces. Kane reads them as variables.</li>
        </ul>
        <h2 id="lint">Let the linter catch the rest</h2>
        <CodeBlock code="plumb rules lint" />
        <p>The most useful error is <code>RULE_NO_ASSERT</code>: a rule whose last step verifies nothing can never fail, so Plumb refuses it. Kane's gate policy refuses it again at run time.</p>
        <h2 id="override">Change a house rule</h2>
        <p>Give your rule the same id as a house rule. Folders listed later in <code>rules.dirs</code> win, so your version replaces the shipped one.</p>
      </>
    ),
  },
  {
    slug: 'rule-format',
    title: 'Rule format',
    summary: 'Every field of a rule file.',
    body: (
      <>
        <h2 id="frontmatter">Front matter</h2>
        <T
          head={['Field', 'Required', 'Meaning']}
          rows={[
            [<code key="a">id</code>, 'yes', 'Capital letters, a dash, then capitals, digits or dashes. It names the test file and the report row.'],
            [<code key="b">title</code>, 'yes', 'One line, 8 to 90 characters.'],
            [<code key="c">severity</code>, 'no', <><code>blocking</code> (default) stops the gate. <code>advisory</code> is reported but does not block.</>],
            [<code key="d">applies</code>, 'no', 'Page kinds the rule is meant for, such as landing or app. Shown in the Studio.'],
            [<code key="e">max_steps</code>, 'no', 'Cap on Kane reasoning steps for this rule.'],
            [<code key="f">evidence</code>, 'no', <><code>[console]</code> also reads Kane's console log and fails the rule on errors or blocked resources.</>],
          ]}
        />
        <h2 id="sections">Sections</h2>
        <T
          head={['Heading', 'Used for']}
          rows={[
            [<code key="a">## Rule</code>, 'The statement. Shown in the Studio and in the fix brief.'],
            [<code key="b">## Why</code>, 'Why it matters. Shown on the rule page.'],
            [<code key="c">## Check</code>, 'A list. Each top-level bullet becomes one Kane step.'],
            [<code key="d">## Fix</code>, 'The usual remedy. Copied into the fix brief when the rule needs work.'],
          ]}
        />
        <h2 id="compiled">What Plumb generates</h2>
        <p>Each rule becomes <code>tests/plumb/&lt;id&gt;_test.md</code> with the tags <code>plumb</code>, the lower-case id and the severity. A comment records the rule hash, so Plumb rewrites a test only when its rule changed. Commit the tests and the <code>output-*</code> folders Kane writes beside them, and teammates and CI replay instead of writing the flows again.</p>
      </>
    ),
  },
  {
    slug: 'cli',
    title: 'CLI',
    summary: 'Every command and what it costs.',
    body: (
      <>
        <T
          head={['Command', 'What it does', 'Credits']}
          rows={[
            [<code key="a">plumb check</code>, 'Runs the rules, writes the report and .plumb/brief.md. Exit 0 passed, 1 blocked, 2 could not run.', 'Only for rules that changed'],
            [<code key="b">plumb check --rules PL-THEME --fresh</code>, 'Runs the named rules and ignores reused results.', 'Yes'],
            [<code key="c">plumb check --dry-run</code>, 'Shows what would run, what would be reused and the estimate.', 'None'],
            [<code key="d">plumb loop --agent claude</code>, 'Check, agent fix, check again. Restores protected files.', 'Per check'],
            [<code key="e">plumb gate</code>, 'For hooks. Exit 2 with the brief on stderr when blocked. Lets go after agent.maxIterations.', 'Only if the site changed'],
            [<code key="f">plumb status</code>, 'Last verdict from the stored report.', 'None'],
            [<code key="g">plumb brief</code>, 'Prints the current fix brief.', 'None'],
            [<code key="h">plumb rules list | lint | show ID | new ID</code>, 'Browse, validate and scaffold rules.', 'None'],
            [<code key="i">plumb compile --check</code>, 'Tells you whether the generated tests match their rules.', 'None'],
            [<code key="j">plumb doctor</code>, 'Checks Kane, sign-in, credits, config and rules.', 'None'],
            [<code key="k">plumb mcp</code>, 'Starts the MCP server on stdio.', 'On plumb_check'],
            [<code key="l">plumb serve</code>, 'Studio API on 127.0.0.1:4310.', 'On Run'],
            [<code key="m">plumb export --out DIR</code>, 'Writes runs, loops and rules as static files for the Studio.', 'None'],
          ]}
        />
        <h2 id="config">plumb.config.json</h2>
        <CodeBlock label="plumb.config.json" code={`{\n  "site": { "url": "http://localhost:3000", "dir": "." },\n  "rules": { "dirs": ["@house", "rules"], "exclude": [] },\n  "kane": { "parallel": 2, "heal": true },\n  "credits": { "floor": 60, "perRuleEstimate": 50 },\n  "protect": ["rules/**", "tests/**", "policy/**", "plumb.config.json"],\n  "agent": { "name": "claude", "maxIterations": 4 }\n}`} />
        <p><code>credits.floor</code> is the balance Plumb never spends below. Rules that would cross it are marked not run, blocking rules first.</p>
      </>
    ),
  },
  {
    slug: 'agents',
    title: 'Agents, hooks and MCP',
    summary: 'Close the loop in Kiro, Claude Code, Codex and anything that speaks MCP.',
    body: (
      <>
        <h2 id="install">One command</h2>
        <CodeBlock code="plumb hook install kiro claude agents" />
        <T
          head={['Target', 'Writes', 'How the loop closes']}
          rows={[
            ['Kiro', <>.kiro/hooks/plumb.json, .kiro/settings/mcp.json, .kiro/steering/plumb.md</>, 'Steering tells the agent to call plumb_check after UI changes. The MCP tool returns the brief. A prompt hook shows the last verdict.'],
            ['Claude Code', <>.claude/settings.json, .mcp.json</>, 'A Stop hook runs plumb gate. While a blocking rule needs work the hook exits 2 and Claude Code keeps going with the brief as its next input.'],
            ['Others', 'AGENTS.md section', 'Cursor, Copilot and Codex read AGENTS.md. For a fully automatic loop run plumb loop --agent codex.'],
          ]}
        />
        <h2 id="mcp">MCP tools</h2>
        <T
          head={['Tool', 'Does', 'Cost']}
          rows={[
            [<code key="a">plumb_check</code>, 'Runs the rules and returns the verdict plus the brief when blocked.', 'Credits for changed rules'],
            [<code key="b">plumb_status</code>, 'Returns the newest verdict.', 'Free'],
            [<code key="c">plumb_brief</code>, 'Returns the fix brief.', 'Free'],
            [<code key="d">plumb_rules</code>, 'Lists the rules and their steps.', 'Free'],
          ]}
        />
        <h2 id="guard">The agent cannot change the judge</h2>
        <p>Before each attempt <code>plumb loop</code> hashes everything matched by <code>protect</code>. If the agent edits, adds or deletes any of it, Plumb restores the files and tells the agent on the next prompt. Kane's recordings under <code>output-*</code> are not counted.</p>
        <h2 id="custom">Any other agent</h2>
        <CodeBlock label="plumb.config.json" code={`"agent": { "name": "cmd", "cmd": "my-agent --task-file $PLUMB_BRIEF" }`} />
        <p>The command runs in the project folder. <code>PLUMB_BRIEF</code> holds the path of the brief and <code>PLUMB_PROMPT</code> the full prompt.</p>
      </>
    ),
  },
  {
    slug: 'ci',
    title: 'CI',
    summary: 'Gate a pull request on the rules.',
    body: (
      <>
        <p>Commit <code>tests/plumb/</code> with the <code>output-*</code> folders so CI replays recordings instead of writing flows. Add your Kane username and access key as secrets.</p>
        <CodeBlock label=".github/workflows/plumb.yml" code={`name: plumb\non: pull_request\njobs:\n  rules:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with: { node-version: 22 }\n      - run: npm install -g @testmuai/kane-cli\n      - run: npm ci && npm start &       # your site\n      - run: npx plumb check --json > plumb-report.json\n        env:\n          LT_USERNAME: \${{ secrets.LT_USERNAME }}\n          LT_ACCESS_KEY: \${{ secrets.LT_ACCESS_KEY }}\n      - uses: actions/upload-artifact@v4\n        if: always()\n        with: { name: plumb, path: ".plumb/**" }`} />
        <p>Exit code 1 fails the job when a blocking rule needs work. This workflow is an example. Check it against your own setup before you rely on it.</p>
      </>
    ),
  },
];

export default function DocPage() {
  const { slug = '' } = useParams();
  const doc = DOCS.find((d) => d.slug === slug);
  useEffect(() => {
    document.title = `${doc?.title ?? 'Docs'} · Plumb`;
  }, [doc]);
  if (!doc) return <div className="wrap section"><EmptyState title="No such page" action={<Link className="btn" to="/docs/quick-start">Quick start</Link>}>That docs page does not exist.</EmptyState></div>;
  return (
    <div className="wrap docs">
      <nav className="toc" aria-label="Docs">
        {DOCS.map((d) => (
          <NavLink key={d.slug} to={`/docs/${d.slug}`}>
            {d.title}
          </NavLink>
        ))}
      </nav>
      <article className="prose">
        <span className="eyebrow">Developers</span>
        <h1 className="page-title">{doc.title}</h1>
        <p className="muted">{doc.summary}</p>
        {doc.body}
      </article>
    </div>
  );
}
