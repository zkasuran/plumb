import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, writeJson, writeText } from './util.mjs';

/**
 * Everything Plumb remembers lives under <root>/.plumb:
 *   state.json            per-rule memory used for the credit-saving cache
 *   runs/<id>/report.json one finished check, with brief.md and shots/ beside it
 *   latest.json           pointer to the newest run
 */
export function plumbDir(root) {
  return join(root, '.plumb');
}

export const runDir = (root, id) => join(plumbDir(root), 'runs', id);

export function readState(root) {
  return readJson(join(plumbDir(root), 'state.json'), { v: 1, rules: {}, lastRunId: null });
}

export function writeState(root, state) {
  writeJson(join(plumbDir(root), 'state.json'), state);
}

export function saveRun(root, report, brief) {
  const dir = runDir(root, report.id);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'report.json'), report);
  if (brief != null) writeText(join(dir, 'brief.md'), brief);
  const summary = summarize(report);
  const index = readJson(join(plumbDir(root), 'index.json'), { v: 1, runs: [] });
  index.runs = [summary, ...index.runs.filter((r) => r.id !== report.id)].slice(0, 200);
  writeJson(join(plumbDir(root), 'index.json'), index);
  writeJson(join(plumbDir(root), 'latest.json'), { runId: report.id, at: report.endedAt });
  if (brief != null) writeText(join(plumbDir(root), 'brief.md'), brief);
  return dir;
}

export function summarize(report) {
  return {
    id: report.id,
    startedAt: report.startedAt,
    endedAt: report.endedAt,
    durationS: report.durationS,
    mode: report.mode,
    iteration: report.iteration ?? null,
    site: report.site.url,
    totals: report.totals,
    gate: report.gate,
    credits: report.credits,
  };
}

export function loadRun(root, id) {
  return readJson(join(runDir(root, id), 'report.json'), null);
}

export function latestRun(root) {
  const p = readJson(join(plumbDir(root), 'latest.json'), null);
  return p ? loadRun(root, p.runId) : null;
}

export function listRuns(root) {
  const idx = readJson(join(plumbDir(root), 'index.json'), null);
  if (idx) return idx.runs;
  const dir = join(plumbDir(root), 'runs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .reverse()
    .map((id) => loadRun(root, id))
    .filter(Boolean)
    .map(summarize);
}

export function pruneRuns(root, keep = 60) {
  const dir = join(plumbDir(root), 'runs');
  if (!existsSync(dir)) return 0;
  const ids = readdirSync(dir).sort().reverse();
  let n = 0;
  for (const id of ids.slice(keep)) {
    rmSync(join(dir, id), { recursive: true, force: true });
    n++;
  }
  return n;
}
