import { Link } from 'react-router-dom';
import type { Report, RuleResult, RunSummary } from '../lib/types';
import { credits, gateLabel, kindLabel, secs, when } from '../lib/format';
import { Chip, RuleChip, Shot } from './ui';
import { useData } from '../lib/data';

/** A compact list of a run's rules, used on the home page and the Studio overview. */
export function RuleRows({ report, linkRuns = true }: { report: Report; linkRuns?: boolean }) {
  return (
    <ul className="rule-list">
      {report.rules.map((r) => (
        <li key={r.id} className="rule-row">
          <div>
            <div className="id">{r.id}</div>
            {linkRuns ? (
              <Link to={`/studio/runs/${report.id}#${r.id}`}>
                <span className="title">{r.title}</span>
              </Link>
            ) : (
              <span className="title">{r.title}</span>
            )}
          </div>
          <RuleChip r={r} />
        </li>
      ))}
    </ul>
  );
}

export function GateBanner({ report }: { report: Pick<Report, 'gate' | 'totals' | 'credits' | 'durationS' | 'endedAt'> }) {
  const g = gateLabel(report);
  return (
    <div className={`banner ${g.tone === 'ok' ? 'ok' : 'warn'}`}>
      <span className="big" aria-hidden="true">
        {g.tone === 'ok' ? '✓' : '△'}
      </span>
      <div className="grow">
        <h2>{g.label}</h2>
        <p className="muted small">
          {report.totals.pass} of {report.totals.rules} rules pass · {report.totals.cached} reused · {report.credits.used == null ? 'credits unknown' : `${credits(report.credits.used)} credits`} · {secs(report.durationS)} · {when(report.endedAt)}
        </p>
      </div>
    </div>
  );
}

export function RunList({ runs }: { runs: RunSummary[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Result</th>
            <th className="num">Rules passing</th>
            <th className="num">Credits</th>
            <th>Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => {
            const g = gateLabel(r);
            return (
              <tr key={r.id}>
                <td>
                  <Link to={`/studio/runs/${r.id}`} className="mono">
                    {r.id}
                  </Link>
                  <div className="muted small">{r.mode}{r.iteration != null ? ` · iteration ${r.iteration}` : ''}</div>
                </td>
                <td>
                  <Chip tone={g.tone}>{g.label}</Chip>
                </td>
                <td className="num">
                  {r.totals.pass} / {r.totals.rules}
                </td>
                <td className="num">{r.credits.used == null ? '' : credits(r.credits.used)}</td>
                <td>{when(r.startedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RuleDetailBlock({ report, r }: { report: Report; r: RuleResult }) {
  const { shotUrl } = useData();
  const f = r.failure;
  const shots = r.steps.filter((s) => s.screenshot);
  const open = r.status !== 'pass';
  return (
    <details className="rule-detail" id={r.id} open={open}>
      <summary>
        <div>
          <div className="mono muted small">
            {r.id} · {r.severity}
          </div>
          <strong>{r.title}</strong>
        </div>
        <div className="row">
          <span className="muted small">{kindLabel(r)}</span>
          <RuleChip r={r} />
        </div>
      </summary>
      <div className="rule-body">
        <p className="muted">{r.statement}</p>
        <ol className="steps-line">
          {r.steps.map((s) => (
            <li key={s.index} className={`step ${s.status}`}>
              <span className="dot" aria-hidden="true">
                {s.status === 'pass' ? '✓' : s.status === 'fail' ? '!' : s.index}
              </span>
              <span className="text">
                <span className="sr-only">{s.status === 'pass' ? 'Passed: ' : s.status === 'fail' ? 'Needs work: ' : 'Not run: '}</span>
                {s.text}
              </span>
              <span className="meta">{s.durationS != null ? secs(s.durationS) : ''}</span>
            </li>
          ))}
        </ol>
        {f && (
          <div className="callout">
            <strong>{f.step ? `Step ${f.step} needs work` : 'What the browser reported'}</strong>
            {f.happened ?? f.message}
            {f.suggestedFix && (
              <p className="small">
                <strong>Kane suggests:</strong> {f.suggestedFix}
              </p>
            )}
          </div>
        )}
        {r.console.count > 0 && (
          <div className="callout info">
            <strong>{r.console.count} console message{r.console.count === 1 ? '' : 's'}</strong>
            {r.console.sample.map((c, i) => (
              <div key={i} className="mono small">
                {c.text}
              </div>
            ))}
          </div>
        )}
        {shots.length > 0 && (
          <div className="shots">
            {shots.map((s) => (
              <Shot key={s.index} src={shotUrl(report.id, s.screenshot)} alt={`${r.id} step ${s.index}: ${s.text}`} caption={`Step ${s.index} · ${s.status === 'pass' ? 'passed' : s.status === 'fail' ? 'needs work' : 'not run'}`} />
            ))}
          </div>
        )}
        {r.shareUrl && (
          <p className="small">
            <a href={r.shareUrl} target="_blank" rel="noreferrer noopener">
              Open this run in Kane Test Manager
            </a>
          </p>
        )}
      </div>
    </details>
  );
}
