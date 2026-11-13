import { Link, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { EmptyState, PageHead, Skeleton, ErrorNote } from '../components/ui';
import { RunList } from '../components/RunViews';
import { Chip } from '../components/ui';
import { credits, when } from '../lib/format';

function Shell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const items = [
    ['evidence', 'Evidence'],
    ['costs', 'Measured costs'],
    ['limits', 'Limits'],
  ];
  return (
    <div className="wrap docs">
      <nav className="toc" aria-label="Reports">
        {items.map(([s, t]) => (
          <Link key={s} to={`/reports/${s}`} aria-current={s === slug ? 'page' : undefined}>
            {t}
          </Link>
        ))}
      </nav>
      <article className="prose">{children}</article>
    </div>
  );
}

function Evidence() {
  const { state } = useData();
  if (state.status === 'loading') return <Skeleton lines={6} />;
  if (state.status === 'error') return <ErrorNote message={state.message} />;
  const { runs, loops } = state.index;
  return (
    <>
      <PageHead eyebrow="Reports" title="Evidence">Every number in this project comes from a Kane run listed here. Open a run to see its steps, screenshots and the brief it produced.</PageHead>
      {state.index.sample && <div className="callout info">This build is showing development sample data.</div>}
      <h2 id="runs">Runs</h2>
      {runs.length === 0 ? <EmptyState title="No runs recorded yet" /> : <RunList runs={runs} />}
      <h2 id="loops">Loops</h2>
      {loops.length === 0 ? (
        <EmptyState title="No loops recorded yet" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Loop</th><th>Outcome</th><th>Agent</th><th className="num">Credits</th><th>Started</th></tr></thead>
            <tbody>
              {loops.map((l) => (
                <tr key={l.id}>
                  <td><Link className="mono" to={`/studio/loops/${l.id}`}>{l.id}</Link></td>
                  <td><Chip tone={l.outcome === 'green' ? 'ok' : 'warn'}>{l.outcome === 'green' ? 'Rules pass' : l.outcome}</Chip></td>
                  <td>{l.agent}</td>
                  <td className="num">{credits(l.creditsUsed)}</td>
                  <td>{when(l.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 id="method">How runs are recorded</h2>
      <p>Each check writes a report, the fix brief, one screenshot per rule step and Kane's raw event stream under <code>.plumb/runs/</code>. <code>plumb export</code> copies them next to the Studio, so this page works without Kane. Nothing here is typed in by hand.</p>
    </>
  );
}

function Costs() {
  return (
    <>
      <PageHead eyebrow="Reports" title="Measured costs">What a Kane run cost on a real account, read from the credit balance before and after each run.</PageHead>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Run</th><th className="num">Credits</th><th className="num">Time</th><th>What it was</th></tr></thead>
          <tbody>
            <tr><td>Write and run, passes</td><td className="num">47.7</td><td className="num">92 s</td><td>3-step theme rule on a small page. Kane wrote and ran every step.</td></tr>
            <tr><td>Write and run, stops at step 1</td><td className="num">15.3</td><td className="num">45 s</td><td>Same rule on a page with no theme switch. Not saved, so the next run writes it again.</td></tr>
            <tr><td>Write and run, stops at step 1</td><td className="num">19.2</td><td className="num">54 s</td><td>The shipped PL-THEME rule through <code>plumb check</code>.</td></tr>
            <tr><td>Replay, passes</td><td className="num">1.9</td><td className="num">16 s</td><td>The saved flow replayed against the compliant page.</td></tr>
            <tr><td>Replay, misses, no healing</td><td className="num">5.3</td><td className="num">35 s</td><td>The saved flow against a page that lost its theme switch.</td></tr>
            <tr><td>Reused result</td><td className="num">0</td><td className="num">0 s</td><td>Plumb saw the same page and the same rule text and skipped Kane.</td></tr>
          </tbody>
        </table>
      </div>
      <h2 id="what">What this means</h2>
      <ul>
        <li>The first pass over a rule is the expensive one. A passing rule is saved and replays for a small fraction of that.</li>
        <li>A rule that keeps failing is written again on every run, because Kane does not save a failing flow. That is why Plumb reuses a result when neither the page nor the rule changed.</li>
        <li>Plumb stops before it spends below <code>credits.floor</code> and runs blocking rules first.</li>
      </ul>
      <h2 id="how">How these were measured</h2>
      <p>Kane CLI 0.10.4, on 13 November 2026, one run each, read with <code>kane-cli balance</code> before and after. These are single measurements on small pages, not a benchmark. Costs grow with the number of steps and the size of the page.</p>
    </>
  );
}

function Limits() {
  return (
    <>
      <PageHead eyebrow="Reports" title="Limits">What a passing Plumb check does and does not tell you.</PageHead>
      <ul>
        <li><strong>A model drives the browser.</strong> Kane reads the page and decides whether a step holds. Rules about judgement, such as whether a heading reads like a report, can come out differently on another run. Rules about behaviour, such as a menu opening, are steadier.</li>
        <li><strong>A replay repeats what was recorded.</strong> It catches a page that no longer matches the recording. It does not look for new problems the recording never visited.</li>
        <li><strong>Reuse trusts a fingerprint.</strong> Plumb hashes the site folder, or the page plus its same-origin stylesheets and scripts. A change that lives only on a server, such as data, is not seen. Use <code>--fresh</code> to force a run.</li>
        <li><strong>The guard covers what you list.</strong> <code>protect</code> names the files an agent may not change. Anything outside it is the agent's to edit.</li>
        <li><strong>It checks presence, not taste.</strong> Plumb can tell a theme switch works. It cannot tell you the dark theme is beautiful.</li>
        <li><strong>Runs leave your machine.</strong> By default Kane saves each run, with its screenshots, to your TestMu AI account. Do not point Plumb at pages that show data you cannot share.</li>
        <li><strong>The first run needs credits.</strong> Writing a full rule pack costs several hundred. Replays cost a few each.</li>
        <li><strong>Kane can fail to start a rule.</strong> In the first recorded check, one of three rules that started together was not judged because Kane was still choosing a project. The Studio marks it Not judged, and Plumb now runs such a rule again on its own.</li>
        <li><strong>Small samples.</strong> Costs on the Measured costs page are single runs.</li>
      </ul>
    </>
  );
}

export default function ReportPage() {
  const { slug = '' } = useParams();
  if (slug === 'evidence') return <Shell slug={slug}><Evidence /></Shell>;
  if (slug === 'costs') return <Shell slug={slug}><Costs /></Shell>;
  if (slug === 'limits') return <Shell slug={slug}><Limits /></Shell>;
  return <div className="wrap section"><EmptyState title="No such report" action={<Link className="btn" to="/reports/evidence">Evidence</Link>}>Pick one from the Reports menu.</EmptyState></div>;
}
