import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData } from '../lib/data';
import { Chip, CodeBlock, EmptyState, PageHead, Skeleton, ErrorNote } from '../components/ui';
import { RULE_ID_OK, credits } from '../lib/format';

export function RulesPage() {
  const { state } = useData();
  const [q, setQ] = useState('');
  const [sev, setSev] = useState<'all' | 'blocking' | 'advisory'>('all');
  const rules = state.status === 'ready' ? state.index.rules : [];
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rules.filter((r) => (sev === 'all' || r.severity === sev) && (!needle || `${r.id} ${r.title} ${r.statement}`.toLowerCase().includes(needle)));
  }, [rules, q, sev]);
  if (state.status === 'loading') return <div className="wrap section"><Skeleton lines={8} /></div>;
  if (state.status === 'error') return <div className="wrap section"><ErrorNote message={state.message} /></div>;
  return (
    <div className="wrap section">
      <PageHead eyebrow="Rules" title="The rules in force">
        {rules.length} rules ship with Plumb. Add your own in a <code>rules/</code> folder. A rule with a house id replaces the house version.
      </PageHead>
      <div className="row">
        <label className="sr-only" htmlFor="rule-search">Search rules</label>
        <input id="rule-search" className="search" type="search" placeholder="Search rules" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="row" role="group" aria-label="Filter by severity">
          {(['all', 'blocking', 'advisory'] as const).map((s) => (
            <button key={s} type="button" className={`btn small${sev === s ? ' primary' : ''}`} aria-pressed={sev === s} onClick={() => setSev(s)}>
              {s === 'all' ? 'All' : s === 'blocking' ? 'Blocks shipping' : 'Suggestions'}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No rule matches">Try a different word, or clear the filter.</EmptyState>
      ) : (
        <div className="grid two">
          {shown.map((r) => (
            <Link key={r.id} to={`/rules/${r.id}`} className="card">
              <div className="row between">
                <span className="mono muted small">{r.id}</span>
                <Chip tone={r.severity === 'blocking' ? 'warn' : 'info'}>{r.severity === 'blocking' ? 'Blocks shipping' : 'Suggestion'}</Chip>
              </div>
              <h3>{r.title}</h3>
              <p className="muted small">{r.statement}</p>
              <p className="muted small">{r.steps.length} browser step{r.steps.length === 1 ? '' : 's'}{r.stats ? ` · seen in ${r.stats.runs} run${r.stats.runs === 1 ? '' : 's'}` : ''}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function RuleDetail() {
  const { id = '' } = useParams();
  const { state } = useData();
  if (state.status === 'loading') return <div className="wrap section"><Skeleton lines={8} /></div>;
  if (state.status === 'error') return <div className="wrap section"><ErrorNote message={state.message} /></div>;
  const rule = RULE_ID_OK.test(id) ? state.index.rules.find((r) => r.id === id) : undefined;
  if (!rule) return <div className="wrap section"><EmptyState title="No such rule" action={<Link className="btn" to="/rules">All rules</Link>}>There is no rule called {id.slice(0, 40)}.</EmptyState></div>;
  const s = rule.stats;
  return (
    <div className="wrap section">
      <PageHead eyebrow={`${rule.id} · ${rule.severity === 'blocking' ? 'Blocks shipping' : 'Suggestion'}`} title={rule.title}>
        {rule.statement}
      </PageHead>
      <div className="grid two">
        <div className="stack">
          <h2>What the browser does</h2>
          <ol className="steps">
            {rule.steps.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ol>
          <h2>Why it matters</h2>
          <p className="muted">{rule.why}</p>
          <h2>The usual fix</h2>
          <p className="muted">{rule.fix}</p>
          {rule.evidence.includes('console') && <div className="callout info"><strong>Also reads the console</strong>Plumb reads Kane's console log for this rule. Any error or blocked resource makes the rule need work, even if the steps pass.</div>}
        </div>
        <div className="stack">
          <h2>What Kane runs</h2>
          <p className="muted small">Generated from the rule. Edit the rule, never this file.</p>
          <CodeBlock label={`tests/plumb/${rule.id.toLowerCase()}_test.md`} code={rule.testMd.trim()} />
          {s && (
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><th>Runs recorded</th><td>{s.runs} ({s.pass} passing, {s.fail} needing work)</td></tr>
                  <tr><th>Written by Kane</th><td>{s.authored} time{s.authored === 1 ? '' : 's'}</td></tr>
                  <tr><th>Replayed</th><td>{s.replayed} time{s.replayed === 1 ? '' : 's'}</td></tr>
                  <tr><th>Credits</th><td>{credits(s.credits)}</td></tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="small muted">Defined in <code>{rule.file}</code></p>
        </div>
      </div>
    </div>
  );
}
