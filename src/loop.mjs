import { join, resolve } from 'node:path';
import { newRunId, nowIso, round, PlumbError, writeJson, readJson } from './util.mjs';
import { runCheck } from './check.mjs';
import { snapshotProtected, diffSnapshots, restoreProtected, snapshotSite, changedFiles } from './guard.mjs';
import { buildPrompt, runAgent } from './agents.mjs';
import { plumbDir } from './store.mjs';

/** What moved between two reports, by rule id. */
export function diffReports(prev, next) {
  const was = new Map(prev.rules.map((r) => [r.id, r.status]));
  const out = { fixed: [], regressed: [], stillFailing: [], stillPassing: [] };
  for (const r of next.rules) {
    const before = was.get(r.id);
    const bad = r.status !== 'pass';
    if (before === undefined) continue;
    if (before !== 'pass' && !bad) out.fixed.push(r.id);
    else if (before === 'pass' && bad) out.regressed.push(r.id);
    else if (bad) out.stillFailing.push(r.id);
    else out.stillPassing.push(r.id);
  }
  return out;
}

const failingIds = (report) => report.rules.filter((r) => r.status === 'fail' || r.status === 'broken').map((r) => r.id);

/**
 * Check, hand the brief to a coding agent, check again. Stops when every blocking rule
 * passes or the iteration limit is reached. The agent runs with the protected files
 * snapshotted; if it touches them the change is reverted and the next prompt says so.
 */
export async function runLoop({ root, cfg, flags = {}, onProgress = () => {} }) {
  const id = newRunId();
  const startedAt = nowIso();
  const agentName = flags.agent ?? cfg.agent.name;
  const max = flags.maxIterations ?? cfg.agent.maxIterations;
  const siteDir = cfg.site.dir ? resolve(root, cfg.site.dir) : null;
  const iterations = [];
  let previousAttempt = null;
  let prevReport = null;
  let outcome = 'exhausted';
  let creditsUsed = 0;

  for (let i = 0; i <= max; i++) {
    onProgress({ type: 'iteration_start', iteration: i, label: i === 0 ? 'baseline check' : `check after agent attempt ${i}` });
    const { report, relDir } = await runCheck({ root, cfg, flags: { ...flags, mode: 'loop', iteration: i }, onProgress });
    creditsUsed += report.credits.used ?? 0;
    const moved = prevReport ? diffReports(prevReport, report) : null;
    const entry = { iteration: i, runId: report.id, runDir: relDir, gate: report.gate, totals: report.totals, credits: report.credits.used, moved, agent: previousAttempt?.agent ?? null };
    iterations.push(entry);
    onProgress({ type: 'iteration_end', ...entry });
    prevReport = report;
    if (report.gate.passed) {
      outcome = 'green';
      break;
    }
    if (i === max) break;

    const protectedBefore = snapshotProtected(root, cfg.protect);
    const siteBefore = snapshotSite(siteDir, cfg.site.ignore);
    const briefPath = '.plumb/brief.md';
    const prompt = buildPrompt({ report, briefPath, siteDir: cfg.site.dir, protect: cfg.protect, previous: previousAttempt ? { tampered: previousAttempt.tampered, stillFailing: failingIds(report) } : null });
    onProgress({ type: 'agent_start', agent: agentName, iteration: i + 1 });
    const result = await runAgent(agentName, { prompt, cwd: root, cmd: cfg.agent.cmd, timeoutS: cfg.agent.timeoutS, env: { PLUMB_BRIEF: join(root, briefPath), PLUMB_RUN: report.id }, onOutput: (t) => onProgress({ type: 'agent_output', text: t }) });
    if (result.missing) throw new PlumbError(`${agentName} is not installed on this machine.`, { code: 'AGENT_MISSING', hint: `Pick another agent with --agent (${['claude', 'codex', 'kiro', 'opencode'].join(', ')}) or set agent.cmd.` });

    const protectedAfter = snapshotProtected(root, cfg.protect);
    const tamper = diffSnapshots(protectedBefore, protectedAfter);
    let tampered = [];
    if (tamper.tampered) tampered = restoreProtected(root, protectedBefore, tamper);
    const files = changedFiles(siteBefore, snapshotSite(siteDir, cfg.site.ignore));
    previousAttempt = { tampered, agent: { name: agentName, exit: result.exit, durationS: result.durationS, timedOut: result.timedOut, filesChanged: files, tampered, summary: result.output.split('\n').filter(Boolean).slice(-8).join('\n') } };
    onProgress({ type: 'agent_end', ...previousAttempt.agent });
    if (files.length === 0 && tampered.length === 0 && i > 0 && iterations.at(-1)?.agent?.filesChanged?.length === 0) {
      outcome = 'stalled';
      break;
    }
  }

  const record = {
    v: 1,
    id,
    startedAt,
    endedAt: nowIso(),
    agent: agentName,
    site: prevReport.site.url,
    outcome,
    iterations,
    creditsUsed: round(creditsUsed, 1),
    finalRunId: prevReport.id,
  };
  writeJson(join(plumbDir(root), 'loops', `${id}.json`), record);
  const idx = readJson(join(plumbDir(root), 'loops', 'index.json'), { v: 1, loops: [] });
  idx.loops = [{ id, startedAt, outcome, agent: agentName, iterations: iterations.length, creditsUsed: record.creditsUsed }, ...idx.loops].slice(0, 100);
  writeJson(join(plumbDir(root), 'loops', 'index.json'), idx);
  return record;
}
