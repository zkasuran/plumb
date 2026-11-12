import { round, truncate, homeless } from './util.mjs';
import { ruleIdFromTestPath } from './compile.mjs';
import { lastShotPerFlow } from './evidence.mjs';

/**
 * Turn one member's own event log (events.ndjson) into plain data. The log holds the
 * step headings and timings, Kane's written reason for a failure, and its bug verdict.
 */
export function readMember(events) {
  const steps = [];
  const byIndex = new Map();
  let summary = null;
  let bug = null;
  let credits = 0;
  let sawCredits = false;
  const failures = [];
  for (const e of events) {
    switch (e.type) {
      case 'test_md_step_start': {
        const s = { index: e.step_index, heading: e.heading ?? `Step ${e.step_index}`, status: 'running', durationS: null };
        byIndex.set(e.step_index, s);
        steps.push(s);
        break;
      }
      case 'test_md_step_end': {
        const s = byIndex.get(e.step_index);
        if (s) {
          s.status = e.status === 'passed' ? 'pass' : e.status === 'skipped' ? 'skipped' : 'fail';
          s.durationS = round(e.duration_s, 1);
        }
        break;
      }
      case 'run_end':
        if (typeof e.credits_consumed === 'number') {
          credits += e.credits_consumed;
          sawCredits = true;
        }
        if (e.status === 'failed') failures.push({ summary: e.summary ?? null, reason: e.reason ?? null, oneLiner: e.one_liner ?? null, resultCode: e.result_code ?? null, reasonCode: e.reason_code ?? null });
        break;
      case 'test_md_bug_verdict':
        bug = { confirmed: !!e.confirmed, title: e.bug_title ?? null, severity: e.severity ?? null, confidence: e.confidence ?? null, family: e.family ?? null, oneLiner: e.one_liner ?? null };
        break;
      case 'test_md_summary':
        summary = e;
        break;
      default:
    }
  }
  const total = summary?.steps ?? {};
  const kind = summary?.adaptive_heal?.triggered
    ? 'healed'
    : (total.author_decisions ?? 0) > 0 && (total.replay_decisions ?? 0) === 0
      ? 'author'
      : (total.replay_decisions ?? 0) > 0
        ? 'replay'
        : 'unknown';
  return {
    steps,
    status: summary?.overall_status ?? null,
    durationS: summary?.duration_s ?? null,
    kind,
    committed: summary?.commit?.committed ?? null,
    credits: sawCredits ? round(credits, 1) : 0,
    failure: failures.at(-1) ?? null,
    bug,
    shareUrl: summary?.share_url ?? null,
  };
}

/** Split Kane's summary into its first line (what happened) and a suggested change. */
export function splitSummary(summary) {
  const lines = String(summary ?? '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const happened = lines.find((l) => !/^evidence:/i.test(l)) ?? null;
  const fix = lines.find((l, i) => i > 0 && /^(add|use|make|set|change|remove|ensure|update|fix|include|wrap|move|replace)\b/i.test(l)) ?? null;
  return { happened, fix };
}

/**
 * Build the result row for one rule from everything known about its run.
 * `member` is a readMember() result, `memberEnd` the testrun_member_end event,
 * `test` the matching test read from the evidence pack (may be null).
 */
export function buildRuleResult({ rule, member, memberEnd, test, shots = {}, consoleCount = 0, consoleSample = [] }) {
  const passed = (memberEnd?.status ?? member?.status) === 'passed';
  const broken = !memberEnd && !member?.status;
  // A rule can also ask Plumb to read Kane's own console log. That check needs no model and costs nothing.
  const consoleFail = passed && rule.evidence?.includes('console') && consoleCount > 0;
  const status = broken ? 'broken' : passed && !consoleFail ? 'pass' : 'fail';
  const packFailure = test?.failures?.[0] ?? null;
  const kaneFailure = member?.failure ?? null;
  const split = splitSummary(kaneFailure?.summary);
  const steps = rule.steps.map((text, i) => {
    const m = member?.steps.find((s) => s.index === i + 1);
    const ps = test ? lastShotPerFlow(test).get(i) : null;
    return {
      index: i + 1,
      heading: m?.heading ?? null,
      text,
      status: m?.status ?? (status === 'pass' ? 'pass' : 'skipped'),
      durationS: m?.durationS ?? null,
      screenshot: ps?.screenshot ? shots[ps.screenshot] ?? null : null,
    };
  });
  let failure = null;
  if (consoleFail) {
    failure = {
      step: null, stepText: null,
      message: `The browser console reported ${consoleCount} problem${consoleCount === 1 ? '' : 's'} while the rule ran.`,
      happened: truncate(consoleSample.map((c) => c.text).join(' | '), 400),
      suggestedFix: 'Fix each console error listed, then rerun. Add any missing file such as the favicon.',
      severity: 'major', confidence: 1, confirmedBug: true, pageUrl: consoleSample[0]?.url ?? null, screenshot: null,
    };
  } else if (status !== 'pass') {
    const failedStep = steps.find((s) => s.status === 'fail') ?? null;
    failure = {
      step: failedStep?.index ?? memberEnd?.failure?.step_index ?? null,
      stepText: failedStep?.text ?? null,
      message: truncate(packFailure?.message ?? memberEnd?.failure?.message ?? kaneFailure?.reason ?? 'The run did not complete', 400),
      happened: truncate(split.happened ?? packFailure?.rootCause ?? '', 400) || null,
      suggestedFix: truncate(packFailure?.suggestedFix ?? split.fix ?? '', 400) || null,
      severity: packFailure?.severity ?? member?.bug?.severity ?? null,
      confidence: packFailure?.confidence ?? member?.bug?.confidence ?? null,
      confirmedBug: member?.bug?.confirmed ?? null,
      pageUrl: packFailure?.pageUrl ?? null,
      screenshot: packFailure?.screenshot ? shots[packFailure.screenshot] ?? null : null,
    };
  }
  return {
    id: rule.id,
    title: rule.title,
    severity: rule.severity,
    sha: rule.sha,
    status,
    source: 'kane',
    kind: member?.kind ?? 'unknown',
    durationS: round(memberEnd?.duration_s ?? member?.durationS, 1),
    credits: member?.credits ?? 0,
    steps,
    failure,
    console: { count: consoleCount, sample: consoleSample.slice(0, 5) },
    sessionId: memberEnd?.session_id ?? test?.sessionId ?? null,
    shareUrl: member?.shareUrl ?? test?.shareLink ?? null,
    fix: rule.fix || null,
    statement: rule.statement,
  };
}

export function totalsOf(results) {
  const t = { rules: results.length, pass: 0, fail: 0, broken: 0, skipped: 0, cached: 0, blockingFail: 0, advisoryFail: 0, replay: 0, author: 0, healed: 0 };
  for (const r of results) {
    if (r.source === 'cache') t.cached++;
    if (r.status === 'pass') t.pass++;
    else if (r.status === 'fail') t.fail++;
    else if (r.status === 'broken') t.broken++;
    else if (r.status === 'skipped') t.skipped++;
    if ((r.status === 'fail' || r.status === 'broken') && r.severity === 'blocking') t.blockingFail++;
    if (r.status === 'fail' && r.severity === 'advisory') t.advisoryFail++;
    if (r.source === 'kane') {
      if (r.kind === 'replay') t.replay++;
      else if (r.kind === 'author') t.author++;
      else if (r.kind === 'healed') t.healed++;
    }
  }
  return t;
}

/** The gate is green when no blocking rule failed, broke, or was skipped. */
export function gateOf(results) {
  const blocking = results.filter((r) => r.severity === 'blocking' && r.status !== 'pass').map((r) => r.id);
  return { passed: blocking.length === 0, blocking };
}

export function sanitizeReport(report) {
  return JSON.parse(JSON.stringify(report, (_, v) => (typeof v === 'string' ? homeless(v) : v)));
}

export { ruleIdFromTestPath };
