import { useEffect, useMemo, useState } from 'react';
import type { LoopRecord, Report } from '../lib/types';
import { credits, gateLabel, secs } from '../lib/format';
import { Chip, RuleChip } from './ui';
import { Pause, Play } from './icons';

type Beat = { kind: 'rule'; it: number; i: number } | { kind: 'agent'; it: number };

/**
 * Replays a recorded loop beat by beat: each rule appears with the verdict it really got,
 * then the agent's attempt, then the next check. Durations and counts come from the run.
 */
export function LoopPlayer({ loop, reports }: { loop: LoopRecord; reports: Report[] }) {
  const beats = useMemo<Beat[]>(
    () =>
      loop.iterations.flatMap((_, n) => [
        ...(n > 0 ? ([{ kind: 'agent', it: n }] as Beat[]) : []),
        ...(reports[n]?.rules ?? []).map((__, i) => ({ kind: 'rule', it: n, i }) as Beat),
      ]),
    [loop, reports]
  );
  const [pos, setPos] = useState(() => Math.max(0, beats.length - 1));
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const last = beats.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (pos >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setPos((p) => Math.min(last, p + 1)), (beats[pos + 1]?.kind === 'agent' ? 1600 : 520) / (fast ? 2.5 : 1));
    return () => window.clearTimeout(t);
  }, [playing, pos, last, beats, fast]);

  const beat = beats[Math.min(pos, last)];
  if (!beat) return null;
  const it = beat.it;
  const rep = reports[it];
  const entry = loop.iterations[it];
  const shown = beat.kind === 'rule' ? beat.i : (rep?.rules.length ?? 0) - 1;

  return (
    <div className="player">
      <div className="row between">
        <div className="row" role="tablist" aria-label="Checks in this loop">
          {loop.iterations.map((x, n) => (
            <button key={x.runId} role="tab" aria-selected={it === n} type="button" className={`btn small${it === n ? ' primary' : ''}`} onClick={() => setPos(beats.findLastIndex((b) => b.it === n && b.kind === 'rule'))}>
              {n === 0 ? 'First check' : `After attempt ${n}`}
            </button>
          ))}
        </div>
        <span className="muted small">{loop.agent} as the fixing agent</span>
      </div>

      <div className="card player-stage" aria-live="polite">
        {beat.kind === 'agent' && entry?.agent && (
          <div className="callout info fade-in" key={`agent-${it}`}>
            <strong>
              {loop.agent} read the fix brief and changed {entry.agent.filesChanged.length} file{entry.agent.filesChanged.length === 1 ? '' : 's'} in {secs(entry.agent.durationS)}
            </strong>
            {entry.agent.filesChanged.length > 0 && <div className="mono small">{entry.agent.filesChanged.join(', ')}</div>}
            {entry.agent.tampered.length > 0 && <div className="small">It also tried to edit {entry.agent.tampered.join(', ')}. Plumb restored those files.</div>}
          </div>
        )}
        <div className="row between">
          <strong>{it === 0 ? 'First check' : `Check after attempt ${it}`}</strong>
          {entry && <Chip tone={gateLabel({ gate: entry.gate, totals: entry.totals }).tone}>{gateLabel({ gate: entry.gate, totals: entry.totals }).label}</Chip>}
        </div>
        <ul className="rule-list">
          {rep?.rules.map((r, i) =>
            i <= shown ? (
              <li key={r.id} className="rule-row fade-in">
                <div>
                  <div className="id">{r.id}</div>
                  <span className="title">{r.title}</span>
                  {r.status !== 'pass' && r.failure?.happened && <div className="muted small">{r.failure.happened}</div>}
                </div>
                <RuleChip r={r} />
              </li>
            ) : null
          )}
        </ul>
        {entry?.moved && beat.kind === 'rule' && beat.i === (rep?.rules.length ?? 1) - 1 && (
          <div className="moved fade-in">
            {entry.moved.fixed.map((id) => (
              <Chip key={id} tone="ok">
                {id} fixed
              </Chip>
            ))}
            {entry.moved.regressed.map((id) => (
              <Chip key={id} tone="warn">
                {id} slipped
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="player-bar">
        <button type="button" className="btn small" onClick={() => {
            if (pos >= last) {
              setPos(0);
              setPlaying(true);
            } else setPlaying((p) => !p);
          }} aria-label={playing ? 'Pause the replay' : 'Play the replay'}>
          {playing ? <Pause width={14} height={14} /> : <Play width={14} height={14} />} {playing ? 'Pause' : pos >= last ? 'Replay' : 'Play'}
        </button>
        <input type="range" min={0} max={last} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Position in the replay" />
        <label className="small muted row fast">
          <input type="checkbox" checked={fast} onChange={(e) => setFast(e.target.checked)} /> Fast
        </label>
        <span className="muted small">
          {credits(loop.creditsUsed)} credits in all
        </span>
      </div>
    </div>
  );
}
