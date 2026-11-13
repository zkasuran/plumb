import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, relative } from 'node:path';
import { PlumbError, newRunId, nowIso, round, plural } from './util.mjs';
import { loadRulePack } from './rules.mjs';
import { compileAll, testFileName, testStem } from './compile.mjs';
import { runKane, kaneStatus, getBalance, readNdjsonFile, testrunArgs } from './kane.mjs';
import { fingerprintSite } from './fingerprint.mjs';
import { readPack, consoleFindings, extractScreenshots, packExists } from './evidence.mjs';
import { buildRuleResult, readMember, totalsOf, gateOf, sanitizeReport } from './report.mjs';
import { renderBrief } from './brief.mjs';
import { readState, writeState, saveRun, runDir, pruneRuns } from './store.mjs';

const BUNDLED_POLICY = fileURLToPath(new URL('../policy/plumb-gate.yaml', import.meta.url));
const INFRA_RE = /project\/folder gate failed|no TMS credentials/i;
const MEMBER_END = /^testrun_(authored_)?member_end$/;

/** Decide which rules can reuse their last result. Pure, so the credit saving is testable. */
export const isInfraFailure = (message) => INFRA_RE.test(message ?? '');

export function planRules({ rules, state, fingerprint, fresh = false, forceIds = [] }) {
  const reuse = [];
  const run = [];
  for (const rule of rules) {
    const prev = state.rules?.[rule.id];
    const same = prev && fingerprint?.hash && prev.fingerprint === fingerprint.hash && prev.sha === rule.sha && prev.result;
    if (!fresh && same && !forceIds.includes(rule.id)) reuse.push({ rule, prev });
    else run.push(rule);
  }
  return { reuse, run };
}

/** Rough credits for a rule: a recorded one replays cheaply, a new or red one authors. */
export function estimateCredits(rule, state, cfg) {
  const prev = state.rules?.[rule.id];
  const recorded = prev?.result?.status === 'pass';
  return recorded ? 3 : cfg.credits.perRuleEstimate;
}

/** Keep the rules that fit above the floor, blocking ones first. */
export function fitToBudget({ rules, balance, state, cfg }) {
  if (balance == null) return { fit: rules, skipped: [] };
  const sorted = [...rules].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1));
  let left = balance - cfg.credits.floor;
  const fit = [];
  const skipped = [];
  for (const r of sorted) {
    const cost = estimateCredits(r, state, cfg);
    if (cost <= left) {
      fit.push(r);
      left -= cost;
    } else skipped.push(r);
  }
  const keep = new Set(fit.map((r) => r.id));
  return { fit: rules.filter((r) => keep.has(r.id)), skipped };
}

function chunk(list, n) {
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

/**
 * Run the rules once and write a report. This is the one place that spends credits.
 * `flags`: { rules, fresh, url, iteration, mode, dryRun, noCache, heal, parallel }
 */
export async function runCheck({ root, cfg, flags = {}, onProgress = () => {} }) {
  const startedAt = nowIso();
  const t0 = Date.now();
  const id = newRunId();
  const url = flags.url || cfg.site.url;
  if (!url) throw new PlumbError('No site to check. Set site.url in plumb.config.json or pass --url.', { code: 'NO_URL' });

  const only = flags.rules?.length ? flags.rules.map((s) => s.toUpperCase()) : cfg.rules.only;
  const pack = loadRulePack({ root, dirs: cfg.rules.dirs, exclude: cfg.rules.exclude, only });
  const errors = pack.problems.filter((p) => p.level === 'error');
  if (errors.length) throw new PlumbError(`Rule pack has ${plural(errors.length, 'error')}:\n${errors.map((e) => `  ${e.file}: ${e.message}`).join('\n')}`, { code: 'RULES_INVALID' });
  if (pack.rules.length === 0) throw new PlumbError('No rules selected. Check rules.dirs and --rules.', { code: 'NO_RULES' });
  if (flags.rules?.length) {
    const unknown = flags.rules.map((s) => s.toUpperCase()).filter((s) => !pack.all.some((r) => r.id === s));
    if (unknown.length) throw new PlumbError(`Unknown rule id: ${unknown.join(', ')}`, { code: 'UNKNOWN_RULE' });
  }

  const compiled = compileAll(pack.rules, { root, testsDir: cfg.tests.dir, url: null, maxSteps: cfg.kane.maxSteps });
  onProgress({ type: 'compiled', written: compiled.written.length, current: compiled.current.length });

  const state = readState(root);
  const siteDir = cfg.site.dir ? resolve(root, cfg.site.dir) : null;
  const fp = await fingerprintSite({ url, dir: siteDir, ignore: cfg.site.ignore });
  onProgress({ type: 'fingerprint', ...fp });

  const plan = planRules({ rules: pack.rules, state, fingerprint: fp, fresh: !!flags.fresh });

  const status = await kaneStatus();
  if (plan.run.length && !flags.dryRun) {
    if (!status.installed) throw new PlumbError('kane-cli is not installed.', { code: 'KANE_MISSING', hint: 'npm install -g @testmuai/kane-cli' });
    if (!status.authenticated) throw new PlumbError('kane-cli is not signed in.', { code: 'KANE_AUTH', hint: 'kane-cli login --oauth' });
  }
  const before = status.credits;
  const { fit, skipped } = fitToBudget({ rules: plan.run, balance: before, state, cfg });
  if (plan.run.length && fit.length === 0 && !flags.dryRun) {
    throw new PlumbError(`Not enough Kane credits: ${before} available, floor is ${cfg.credits.floor}.`, { code: 'NO_CREDITS', hint: 'Ask for credits or lower credits.floor in plumb.config.json.' });
  }

  const results = new Map();
  for (const { rule, prev } of plan.reuse) {
    results.set(rule.id, { ...prev.result, source: 'cache', cachedFrom: prev.runId, credits: 0 });
    onProgress({ type: 'rule_end', id: rule.id, status: prev.result.status, source: 'cache' });
  }
  for (const rule of skipped) {
    results.set(rule.id, {
      id: rule.id, title: rule.title, severity: rule.severity, sha: rule.sha, status: 'skipped', source: 'skipped', kind: 'none', durationS: null, credits: 0,
      steps: rule.steps.map((text, i) => ({ index: i + 1, heading: null, text, status: 'skipped', durationS: null, screenshot: null })),
      failure: null, console: { count: 0, sample: [] }, sessionId: null, shareUrl: null, fix: rule.fix || null, statement: rule.statement,
      note: `Skipped: ${before} credits available, floor ${cfg.credits.floor}.`,
    });
    onProgress({ type: 'rule_end', id: rule.id, status: 'skipped', source: 'skipped' });
  }

  const executions = [];
  const dir = runDir(root, id);
  const policyFile = cfg.kane.policy ? (existsSync(resolve(root, cfg.kane.policy)) ? cfg.kane.policy : existsSync(BUNDLED_POLICY) ? BUNDLED_POLICY : null) : null;

  const plannedIds = fit.map((r) => r.id);
  if (flags.dryRun) {
    for (const rule of fit) results.set(rule.id, { ...emptyResult(rule), note: `Dry run: would run, about ${estimateCredits(rule, state, cfg)} credits.` });
  }
  if (!flags.dryRun) {
    const parallel = flags.parallel ?? cfg.kane.parallel;
    let remaining = [...fit];
    const execBatch = async (batch, par) => {
      const balanceNow = executions.length ? await getBalance() : before;
      if (balanceNow != null && balanceNow - cfg.credits.floor < batch.length * 3) {
        for (const rule of remaining) results.set(rule.id, { ...emptyResult(rule), status: 'skipped', source: 'skipped', note: `Skipped: ${balanceNow} credits left, floor ${cfg.credits.floor}.` });
        return false;
      }
      for (const r of batch) onProgress({ type: 'rule_start', id: r.id, title: r.title });
      const files = batch.map((r) => join(cfg.tests.dir, testFileName(r.id)));
      const args = testrunArgs({ files, url, headless: cfg.kane.headless, parallel: Math.min(par, batch.length), heal: flags.heal ?? cfg.kane.heal, policy: policyFile, name: `plumb ${id}`, author: !!flags.author });
      const run = await runKane(args, {
        cwd: root,
        timeoutMs: (flags.timeoutS ?? 1500) * 1000,
        onEvent: (ev) => {
          if (MEMBER_END.test(ev.type)) onProgress({ type: 'rule_end', id: idFromPath(ev.path), status: ev.status === 'passed' ? 'pass' : 'fail', source: 'kane', durationS: ev.duration_s });
        },
      });
      remaining = remaining.filter((r) => !batch.includes(r));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `kane-${executions.length + 1}.ndjson`), run.events.map((e) => JSON.stringify(e)).join('\n').split(process.env.HOME ?? '\0').join('~') + '\n');
      const exec = collectExecution(run, root);
      executions.push(exec.summary);
      const packTests = exec.packPath && packExists(exec.packPath) ? readPack(exec.packPath) : null;
      for (const rule of batch) {
        const memberEnd = run.events.find((e) => MEMBER_END.test(e.type) && idFromPath(e.path) === rule.id);
        const memberEvents = memberEnd?.log_path ? readNdjsonFile(memberEnd.log_path) : [];
        const member = readMember(memberEvents);
        const test = packTests?.tests.find((t) => t.tags.includes(rule.id.toLowerCase())) ?? null;
        let shots = {};
        if (packTests && test) shots = extractScreenshots(packTests, test, join(dir, 'shots'), testStem(rule.id));
        const findings = test ? consoleFindings(test) : [];
        results.set(rule.id, buildRuleResult({ rule, member, memberEnd, test, shots, consoleCount: findings.length, consoleSample: findings }));
      }
      if (run.code === 2 && !run.events.some((e) => MEMBER_END.test(e.type))) {
        const err = run.events.find((e) => e.type === 'error');
        for (const rule of batch) results.set(rule.id, { ...emptyResult(rule), status: 'broken', failure: { step: null, message: err?.message ?? `kane-cli exited 2: ${run.stderr.split('\n').find((l) => l.trim()) ?? 'did not start'}`, happened: null, suggestedFix: null, severity: null, confidence: null, confirmedBug: null, pageUrl: null, screenshot: null } });
      }
      return true;
    };
    for (const batch of chunk(fit, parallel)) if (!(await execBatch(batch, parallel))) break;
    // Several members starting at once can race while Kane picks a project. That is not a verdict on
    // the page, so run those rules again one at a time and call them broken if it persists.
    for (const rule of fit) {
      const first = results.get(rule.id);
      if (first && first.status !== 'pass' && INFRA_RE.test(first.failure?.message ?? '')) {
        onProgress({ type: 'rule_retry', id: rule.id });
        await execBatch([rule], 1);
        const again = results.get(rule.id);
        if (again && again.status === 'fail' && INFRA_RE.test(again.failure?.message ?? '')) results.set(rule.id, { ...again, status: 'broken' });
      }
    }
  }

  const after = flags.dryRun ? before : await getBalance();
  const ordered = pack.rules.map((r) => results.get(r.id)).filter(Boolean);
  const totals = totalsOf(ordered);
  const gate = gateOf(ordered);
  const report = sanitizeReport({
    v: 1,
    id,
    startedAt,
    endedAt: nowIso(),
    durationS: round((Date.now() - t0) / 1000, 1),
    mode: flags.mode ?? 'check',
    iteration: flags.iteration ?? null,
    dryRun: !!flags.dryRun,
    site: { url, kind: fp.kind, fingerprint: fp.hash, files: fp.files },
    kane: { version: status.version, executions },
    credits: { before, after, used: before != null && after != null ? round(before - after, 1) : null, floor: cfg.credits.floor },
    rules: ordered,
    totals,
    gate,
    plan: { reuse: plan.reuse.map((x) => x.rule.id), run: plannedIds, skipped: skipped.map((r) => r.id), estimateCredits: round(fit.reduce((n, r) => n + estimateCredits(r, state, cfg), 0), 0) },
  });
  const brief = renderBrief(report, { protect: cfg.protect, siteDir, ignore: cfg.site.ignore, root });
  if (!flags.dryRun) {
    saveRun(root, report, brief);
    const next = readState(root);
    next.lastRunId = id;
    for (const r of ordered) {
      if (r.source !== 'kane') continue;
      next.rules[r.id] = { status: r.status, sha: r.sha, fingerprint: fp.hash, runId: id, at: report.endedAt, result: stripHeavy(r) };
    }
    writeState(root, next);
    pruneRuns(root, 80);
  }
  return { report, brief, relDir: relative(root, dir) };
}

function idFromPath(p) {
  return String(p ?? '').split('/').pop().replace(/_test\.md$/, '').toUpperCase();
}

function emptyResult(rule) {
  return {
    id: rule.id, title: rule.title, severity: rule.severity, sha: rule.sha, status: 'skipped', source: 'skipped', kind: 'none', durationS: null, credits: 0,
    steps: rule.steps.map((text, i) => ({ index: i + 1, heading: null, text, status: 'skipped', durationS: null, screenshot: null })),
    failure: null, console: { count: 0, sample: [] }, sessionId: null, shareUrl: null, fix: rule.fix || null, statement: rule.statement,
  };
}

/** A cached result must not point at screenshots of a run that may be pruned later. */
function stripHeavy(r) {
  return { ...r, steps: r.steps.map((s) => ({ ...s })), failure: r.failure ? { ...r.failure } : null };
}

function collectExecution(run, root) {
  const done = run.events.find((e) => e.type === 'testrun_done');
  const summary = run.events.find((e) => e.type === 'testrun_summary');
  const verdict = run.events.find((e) => e.type === 'verdict');
  const execId = done?.execution_id ?? summary?.execution?.id ?? null;
  const packPath = execId ? join(root, '.testmuai', 'evidence', `${execId}.evidence`) : null;
  return {
    packPath,
    summary: {
      id: execId,
      exit: run.code,
      status: done?.overall_status ?? (run.timedOut ? 'timeout' : 'unknown'),
      totals: summary?.totals ?? null,
      durationS: summary?.duration_s ?? null,
      verdict: verdict ? { result: verdict.result, failedGates: verdict.policies?.flatMap((p) => p.failed_gate_ids ?? []) ?? [] } : null,
    },
  };
}
