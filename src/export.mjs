import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRulePack } from './rules.mjs';
import { compileRule } from './compile.mjs';
import { listRuns, loadRun, plumbDir, runDir } from './store.mjs';
import { readJson, writeJson, nowIso, round } from './util.mjs';

/** Per rule: how often it ran, passed, and what it cost. Built only from stored reports. */
export function ruleStats(root) {
  const stats = {};
  for (const s of listRuns(root)) {
    const r = loadRun(root, s.id);
    if (!r) continue;
    for (const x of r.rules) {
      if (x.source === 'cache' || x.status === 'skipped') continue;
      const e = (stats[x.id] ??= { runs: 0, pass: 0, fail: 0, credits: 0, authored: 0, replayed: 0, lastStatus: null });
      e.runs++;
      if (x.status === 'pass') e.pass++;
      else e.fail++;
      e.credits = round(e.credits + (x.credits ?? 0), 1);
      if (x.kind === 'author') e.authored++;
      if (x.kind === 'replay') e.replayed++;
    }
  }
  const latest = listRuns(root)[0];
  if (latest) for (const x of loadRun(root, latest.id)?.rules ?? []) if (stats[x.id]) stats[x.id].lastStatus = x.status;
  return stats;
}

export function rulesForStudio({ root, cfg }) {
  const pack = loadRulePack({ root, dirs: cfg.rules.dirs, exclude: cfg.rules.exclude, only: null });
  const stats = ruleStats(root);
  return pack.rules.map((r) => ({
    id: r.id,
    title: r.title,
    severity: r.severity,
    applies: r.applies,
    statement: r.statement,
    why: r.why,
    fix: r.fix,
    steps: r.steps,
    file: r.file,
    sha: r.sha,
    evidence: r.evidence,
    testMd: compileRule(r, { maxSteps: cfg.kane.maxSteps }),
    stats: stats[r.id] ?? null,
  }));
}

export function listLoops(root) {
  return readJson(join(plumbDir(root), 'loops', 'index.json'), { loops: [] }).loops;
}

/**
 * Write everything the Studio needs as static files: it can then run from any static host
 * with recorded runs and no Kane, and the same files are what `plumb serve` reads live.
 */
export function exportStudioData({ root, cfg, dest, sample = false }) {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, 'runs'), { recursive: true });
  mkdirSync(join(dest, 'loops'), { recursive: true });
  const runs = listRuns(root);
  for (const s of runs) {
    const r = loadRun(root, s.id);
    if (!r) continue;
    writeJson(join(dest, 'runs', `${s.id}.json`), r);
    const dir = runDir(root, s.id);
    if (existsSync(join(dir, 'shots'))) cpSync(join(dir, 'shots'), join(dest, 'runs', s.id, 'shots'), { recursive: true });
    if (existsSync(join(dir, 'brief.md'))) writeFileSync(join(dest, 'runs', s.id, 'brief.md'), readFileSync(join(dir, 'brief.md')));
    for (const f of existsSync(dir) ? readdirSync(dir).filter((n) => /^kane-\d+\.ndjson$/.test(n)) : []) cpSync(join(dir, f), join(dest, 'runs', s.id, f));
  }
  const loops = listLoops(root);
  for (const l of loops) {
    const rec = readJson(join(plumbDir(root), 'loops', `${l.id}.json`), null);
    if (rec) writeJson(join(dest, 'loops', `${l.id}.json`), rec);
  }
  const rules = rulesForStudio({ root, cfg });
  writeJson(join(dest, 'index.json'), {
    v: 1,
    generatedAt: nowIso(),
    sample,
    project: { site: cfg.site.url, rules: rules.length, protect: cfg.protect, agent: cfg.agent.name },
    runs,
    loops,
    rules,
  });
  return { runs: runs.length, loops: loops.length, rules: rules.length };
}
