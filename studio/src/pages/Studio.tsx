import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAsync, useData } from '../lib/data';
import { Chip, EmptyState, ErrorNote, PageHead, RuleChip, Skeleton, CodeBlock } from '../components/ui';
import { GateBanner, RuleDetailBlock, RunList } from '../components/RunViews';
import { LoopPlayer } from '../components/LoopPlayer';
import { credits, gateLabel, secs, when } from '../lib/format';
import type { LoopRecord, Report, RuleResult } from '../lib/types';
import { Shot } from '../components/ui';

/* ---------- live run panel ---------- */

function LivePanel() {
  const { state, startJob, jobEvents, reload } = useData();
  const nav = useNavigate();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState(false);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  if (state.status !== 'ready') return null;
  const health = state.health;
  const ready = !!health?.kane?.installed && !!health.kane.authenticated;

  const run = async (kind: 'check' | 'loop') => {
    setErr(null);
    setLog([]);
    setBusy(true);
    try {
      const id = await startJob(kind, { fresh });
      stop.current = jobEvents(id, (e) => {
        const t = String(e.type);
        if (t === 'rule_end') setLog((l) => [...l, `${e.id}: ${e.status === 'pass' ? 'passing' : e.status === 'skipped' ? 'not run' : 'needs work'}${e.source === 'cache' ? ' (reused)' : ''}`]);
        else if (t === 'rule_start') setLog((l) => [...l, `${e.id}: checking…`]);
        else if (t === 'agent_start') setLog((l) => [...l, `${String(e.agent)} is fixing the site…`]);
        else if (t === 'iteration_start') setLog((l) => [...l, `— ${String(e.label)}`]);
        else if (t === 'error') {
          setErr(String(e.message));
          setBusy(false);
        } else if (t === 'done') {
          setBusy(false);
          reload();
          window.setTimeout(() => nav(e.loopId ? `/studio/loops/${String(e.loopId)}` : `/studio/runs/${String(e.runId)}`), 400);
        }
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start');
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-label="Run from the Studio">
      <div className="row between">
        <div className="row">
          <span className="live-dot" aria-hidden="true" />
          <strong>Live</strong>
          <span className="muted small">{ready ? `Kane ${health?.kane?.version} · ${health?.kane?.credits ?? '?'} credits` : 'Kane is not signed in on this machine'}</span>
        </div>
        <div className="row">
          <label className="small muted row">
            <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} /> Ignore reused results
          </label>
          <button type="button" className="btn primary small" disabled={!ready || busy} onClick={() => run('check')}>
            Run a check
          </button>
          <button type="button" className="btn small" disabled={!ready || busy} onClick={() => run('loop')}>
            Start a loop
          </button>
        </div>
      </div>
      {err && <ErrorNote message={err} />}
      {log.length > 0 && (
        <pre className="mono small" aria-live="polite">
          {log.join('\n')}
        </pre>
      )}
    </section>
  );
}

/* ---------- overview ---------- */

export function StudioHome() {
  const { state, getRun } = useData();
  const id = state.status === 'ready' ? state.index.runs[0]?.id : undefined;
  const latest = useAsync<Report | null>(`studio-latest:${id ?? 'none'}`, async () => (id ? getRun(id) : null));
  if (state.status === 'loading') return <div className="wrap section"><Skeleton lines={8} /></div>;
  if (state.status === 'error') return <div className="wrap section"><ErrorNote message={state.message} /></div>;
  const idx = state.index;
  return (
    <div className="wrap section">
      <PageHead eyebrow="Studio" title="Where your site stands">
        {idx.project.site ? `Checking ${idx.project.site}` : 'Pick a site to check'} against {idx.project.rules} rules.
      </PageHead>
      <div className="stack">
        {state.live && <LivePanel />}
        {idx.sample && <div className="callout info">This is sample data for development. Real runs replace it.</div>}
        {latest.status === 'loading' && <Skeleton lines={5} />}
        {latest.status === 'error' && <ErrorNote message={latest.message} />}
        {latest.status === 'ready' && !latest.value && (
          <EmptyState title="No runs yet" action={<Link to="/docs/quick-start" className="btn">Run your first check</Link>}>
            Run <code>plumb check</code> in your project. The result will show up here.
          </EmptyState>
        )}
        {latest.status === 'ready' && latest.value && (
          <>
            <GateBanner report={latest.value} />
            <div className="grid two">
              {latest.value.rules.map((r) => (
                <Link key={r.id} className="card" to={`/studio/runs/${latest.value!.id}#${r.id}`}>
                  <div className="row between">
                    <span className="mono muted small">{r.id}</span>
                    <RuleChip r={r} />
                  </div>
                  <h3>{r.title}</h3>
                  <p className="muted small">{r.severity === 'blocking' ? 'Blocks shipping' : 'Suggestion'} · {r.steps.length} step{r.steps.length === 1 ? '' : 's'}</p>
                </Link>
              ))}
            </div>
          </>
        )}
        {idx.runs.length > 0 && (
          <>
            <div className="row between">
              <h2>Recent runs</h2>
              <Link to="/studio/runs">All runs</Link>
            </div>
            <RunList runs={idx.runs.slice(0, 5)} />
          </>
        )}
        {idx.loops.length > 0 && (
          <>
            <div className="row between">
              <h2>Loops</h2>
              <Link to="/studio/loops">All loops</Link>
            </div>
            <LoopTable loops={idx.loops.slice(0, 3)} />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- runs ---------- */

export function RunsPage() {
  const { state } = useData();
  if (state.status !== 'ready') return <div className="wrap section"><Skeleton lines={6} /></div>;
  return (
    <div className="wrap section">
      <PageHead eyebrow="Studio" title="Runs">Every check Plumb has run on this project, newest first.</PageHead>
      {state.index.runs.length === 0 ? <EmptyState title="No runs yet">Run <code>plumb check</code> to see the first one.</EmptyState> : <RunList runs={state.index.runs} />}
    </div>
  );
}

function BriefCard({ id }: { id: string }) {
  const { getBrief } = useData();
  const b = useAsync(`brief:${id}`, () => getBrief(id));
  if (b.status !== 'ready') return null;
  return (
    <section className="stack" id="brief">
      <h2>The fix brief</h2>
      <p className="muted">This is what the agent reads. It is written for every run, and it is empty when everything passes.</p>
      <CodeBlock label="brief.md" code={b.value.trim()} />
    </section>
  );
}

export function RunDetail() {
  const { id = '' } = useParams();
  const { getRun } = useData();
  const r = useAsync(`run:${id}`, () => getRun(id));
  useEffect(() => {
    if (r.status !== 'ready' || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) {
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: 'start' });
    }
  }, [r.status]);
  if (r.status === 'loading') return <div className="wrap section"><Skeleton lines={8} /></div>;
  if (r.status === 'error') return <div className="wrap section"><ErrorNote message={r.message} /></div>;
  const rep = r.value;
  const order = (a: RuleResult, b: RuleResult) => Number(a.status === 'pass') - Number(b.status === 'pass');
  const rules = [...rep.rules].sort(order);
  const exec = rep.kane.executions;
  return (
    <div className="wrap section">
      <PageHead eyebrow={`Run ${rep.id}`} title={gateLabel(rep).label}>
        {rep.site.url} · {rep.mode}{rep.iteration != null ? ` · iteration ${rep.iteration}` : ''}
      </PageHead>
      <GateBanner report={rep} />
      <div className="stack">
        {rules.map((x) => (
          <RuleDetailBlock key={x.id} report={rep} r={x} />
        ))}
      </div>
      <BriefCard id={rep.id} />
      <section className="stack">
        <h2>About this run</h2>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th>Kane CLI</th><td>{rep.kane.version ?? 'unknown'}</td></tr>
              <tr><th>Credits</th><td>{credits(rep.credits.used)} used · {credits(rep.credits.before)} before · {credits(rep.credits.after)} after · floor {rep.credits.floor}</td></tr>
              <tr><th>Site</th><td>{rep.site.url} · fingerprint <code>{rep.site.fingerprint ?? 'none'}</code> ({rep.site.kind}, {rep.site.files} files)</td></tr>
              <tr><th>Started</th><td>{when(rep.startedAt)} · {secs(rep.durationS)}</td></tr>
              {exec.map((e, i) => (
                <tr key={i}><th>Kane execution {i + 1}</th><td><code>{e.id ?? 'none'}</code> · {e.status} · exit {e.exit ?? '?'}{e.verdict ? ` · gate ${e.verdict.result}` : ''}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- loops ---------- */

function LoopTable({ loops }: { loops: { id: string; startedAt: string; outcome: string; agent: string; iterations: number; creditsUsed: number }[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Loop</th>
            <th>Outcome</th>
            <th>Agent</th>
            <th className="num">Attempts</th>
            <th className="num">Credits</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {loops.map((l) => (
            <tr key={l.id}>
              <td><Link to={`/studio/loops/${l.id}`} className="mono">{l.id}</Link></td>
              <td><Chip tone={l.outcome === 'green' ? 'ok' : 'warn'}>{l.outcome === 'green' ? 'Rules pass' : l.outcome === 'stalled' ? 'Agent stalled' : 'Out of attempts'}</Chip></td>
              <td>{l.agent}</td>
              <td className="num">{Math.max(0, l.iterations - 1)}</td>
              <td className="num">{credits(l.creditsUsed)}</td>
              <td>{when(l.startedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LoopsPage() {
  const { state } = useData();
  if (state.status !== 'ready') return <div className="wrap section"><Skeleton lines={6} /></div>;
  return (
    <div className="wrap section">
      <PageHead eyebrow="Studio" title="Loops">A loop is a check, an agent's fix and a new check, repeated until the rules pass.</PageHead>
      {state.index.loops.length === 0 ? <EmptyState title="No loops yet">Run <code>plumb loop --agent claude</code> and the replay shows up here.</EmptyState> : <LoopTable loops={state.index.loops} />}
    </div>
  );
}

export function LoopDetail() {
  const { id = '' } = useParams();
  const { getLoop, getRun, shotUrl } = useData();
  const r = useAsync<{ loop: LoopRecord; reports: Report[] }>(`loop:${id}`, async () => {
    const loop = await getLoop(id);
    const reports = await Promise.all(loop.iterations.map((it) => getRun(it.runId)));
    return { loop, reports };
  });
  const moved = useMemo(() => {
    if (r.status !== 'ready') return [];
    const first = r.value.reports[0];
    const last = r.value.reports[r.value.reports.length - 1];
    if (!first || !last) return [];
    return first.rules.filter((x) => x.status !== 'pass').map((before) => ({ before, after: last.rules.find((y) => y.id === before.id) })).filter((x) => x.after);
  }, [r]);
  if (r.status === 'loading') return <div className="wrap section"><Skeleton lines={10} /></div>;
  if (r.status === 'error') return <div className="wrap section"><ErrorNote message={r.message} /></div>;
  const { loop, reports } = r.value;
  const attempts = loop.iterations.length - 1;
  return (
    <div className="wrap section">
      <PageHead eyebrow={`Loop ${loop.id}`} title={loop.outcome === 'green' ? 'From needs work to passing' : 'A loop that did not finish'}>
        {loop.agent} fixed {loop.site} in {attempts} attempt{attempts === 1 ? '' : 's'}. Every result below is a real Kane run.
      </PageHead>
      <div className="stats">
        <div className="card stat"><strong>{reports[0]?.totals.pass}/{reports[0]?.totals.rules}</strong><span>rules passing at the start</span></div>
        <div className="card stat"><strong>{reports[reports.length - 1]?.totals.pass}/{reports[reports.length - 1]?.totals.rules}</strong><span>rules passing at the end</span></div>
        <div className="card stat"><strong>{attempts}</strong><span>agent attempt{attempts === 1 ? '' : 's'}</span></div>
        <div className="card stat"><strong>{credits(loop.creditsUsed)}</strong><span>Kane credits in all</span></div>
      </div>

      <section className="stack">
        <h2>Replay</h2>
        <LoopPlayer loop={loop} reports={reports} />
      </section>

      {moved.length > 0 && (
        <section className="stack">
          <h2>What changed</h2>
          <div className="stack">
            {moved.map(({ before, after }) => (
              <div key={before.id} className="card stack">
                <div className="row between">
                  <div>
                    <span className="mono muted small">{before.id}</span>
                    <h3>{before.title}</h3>
                  </div>
                  <div className="row"><RuleChip r={before} /> <span aria-hidden="true">→</span> <RuleChip r={after!} /></div>
                </div>
                {before.failure && <div className="callout"><strong>Before: step {before.failure.step} needed work</strong>{before.failure.happened ?? before.failure.message}</div>}
                <div className="grid two">
                  <Shot src={shotUrl(reports[0].id, before.failure?.screenshot ?? before.steps.find((s) => s.screenshot)?.screenshot)} alt={`${before.id} before the fix`} caption="Before" />
                  <Shot src={shotUrl(reports[reports.length - 1].id, [...after!.steps].reverse().find((s) => s.screenshot)?.screenshot)} alt={`${before.id} after the fix`} caption="After" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="stack">
        <h2>Timeline</h2>
        <div className="timeline">
          {loop.iterations.map((it, n) => (
            <div key={it.runId}>
              {n > 0 && it.agent && (
                <div className="t-item agent">
                  <span className="t-dot">AI</span>
                  <div className="t-body">
                    <strong>{loop.agent} attempt {n}</strong>
                    <span className="muted small">{secs(it.agent.durationS)} · changed {it.agent.filesChanged.length} file{it.agent.filesChanged.length === 1 ? '' : 's'}{it.agent.tampered.length ? ` · tried to edit ${it.agent.tampered.join(', ')} (restored)` : ''}</span>
                    {it.agent.filesChanged.length > 0 && <span className="mono small">{it.agent.filesChanged.join(', ')}</span>}
                  </div>
                </div>
              )}
              <div className={`t-item ${it.gate.passed ? 'ok' : 'warn'}`}>
                <span className="t-dot">{n}</span>
                <div className="t-body">
                  <strong>{n === 0 ? 'First check' : `Check after attempt ${n}`}</strong>
                  <span className="muted small">{it.totals.pass} of {it.totals.rules} rules pass · {credits(it.credits)} credits · <Link to={`/studio/runs/${it.runId}`}>open the run</Link></span>
                  {it.moved && (
                    <div className="moved">
                      {it.moved.fixed.map((x) => <Chip key={x} tone="ok">{x} fixed</Chip>)}
                      {it.moved.regressed.map((x) => <Chip key={x} tone="warn">{x} slipped</Chip>)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
