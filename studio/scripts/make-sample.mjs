// Development sample data for the Studio, flagged sample:true. The production build refuses it.
// Real data comes from `plumb export`, which replaces public/data.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRulePack } from '../../src/rules.mjs';
import { compileRule } from '../../src/compile.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'public', 'data');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'runs'), { recursive: true });
mkdirSync(join(out, 'loops'), { recursive: true });

const pack = loadRulePack({ root: process.cwd(), dirs: ['@house'] });
const SITE = 'http://127.0.0.1:4173/';
const bad0 = new Set(['PL-HERO', 'PL-THEME', 'PL-NAV', 'PL-ANCHOR', 'PL-COPY', 'PL-CONSOLE', 'PL-FOCUS']);
const bad1 = new Set(['PL-NAV', 'PL-FOCUS']);
const bad2 = new Set();
const fails = [bad0, bad1, bad2];

function report(i, id) {
  const bad = fails[i];
  const rules = pack.rules.map((r) => {
    const fail = bad.has(r.id);
    return {
      id: r.id, title: r.title, severity: r.severity, sha: r.sha, status: fail ? 'fail' : 'pass', source: 'kane', kind: i === 0 ? 'author' : 'replay', durationS: 40 - i * 12, credits: i === 0 ? 30 : 2,
      steps: r.steps.map((text, k) => ({ index: k + 1, heading: null, text, status: fail ? (k === 0 ? 'fail' : 'skipped') : 'pass', durationS: 12, screenshot: null })),
      failure: fail ? { step: 1, stepText: r.steps[0], message: 'Sample failure message.', happened: 'Sample: the browser did not find what the rule asks for.', suggestedFix: 'Sample: ' + (r.fix || 'make the change').slice(0, 120), severity: 'major', confidence: 0.9, confirmedBug: true, pageUrl: SITE, screenshot: null } : null,
      console: { count: 0, sample: [] }, sessionId: null, shareUrl: null, fix: r.fix, statement: r.statement,
    };
  });
  const blocking = rules.filter((r) => r.status !== 'pass' && r.severity === 'blocking').map((r) => r.id);
  const pass = rules.filter((r) => r.status === 'pass').length;
  return {
    v: 1, id, startedAt: new Date(Date.now() - (3 - i) * 600000).toISOString(), endedAt: new Date(Date.now() - (3 - i) * 600000 + 90000).toISOString(), durationS: 90, mode: 'loop', iteration: i, dryRun: false,
    site: { url: SITE, kind: 'dir', fingerprint: `sample${i}`, files: 3 }, kane: { version: '0.10.4', user: 'sample', executions: [{ id: `exec-${i}`, exit: blocking.length ? 1 : 0, status: blocking.length ? 'failed' : 'passed', durationS: 80, verdict: null }] },
    credits: { before: 1000 - i * 100, after: 900 - i * 100, used: 100 - i * 40, floor: 60 }, rules,
    totals: { rules: rules.length, pass, fail: rules.length - pass, broken: 0, skipped: 0, cached: 0, blockingFail: blocking.length, advisoryFail: 0, replay: i ? rules.length : 0, author: i ? 0 : rules.length, healed: 0 },
    gate: { passed: blocking.length === 0, blocking },
  };
}

const ids = ['20261201T100000Z-s001', '20261201T101000Z-s002', '20261201T102000Z-s003'];
const reports = ids.map((id, i) => report(i, id));
reports.forEach((r) => writeFileSync(join(out, 'runs', `${r.id}.json`), JSON.stringify(r)));
const loop = {
  v: 1, id: '20261201T100000Z-loop', startedAt: reports[0].startedAt, endedAt: reports[2].endedAt, agent: 'claude', site: SITE, outcome: 'green', creditsUsed: 140, finalRunId: ids[2],
  iterations: reports.map((r, i) => ({
    iteration: i, runId: r.id, runDir: `.plumb/runs/${r.id}`, gate: r.gate, totals: r.totals, credits: r.credits.used,
    moved: i ? { fixed: reports[i - 1].rules.filter((x) => x.status !== 'pass' && r.rules.find((y) => y.id === x.id).status === 'pass').map((x) => x.id), regressed: [], stillFailing: [], stillPassing: [] } : null,
    agent: i ? { name: 'claude', exit: 0, durationS: 70, timedOut: false, filesChanged: ['index.html', 'styles.css'], tampered: [], summary: 'sample' } : null,
  })),
};
writeFileSync(join(out, 'loops', `${loop.id}.json`), JSON.stringify(loop));
const rules = pack.rules.map((r) => ({ id: r.id, title: r.title, severity: r.severity, applies: r.applies, statement: r.statement, why: r.why, fix: r.fix, steps: r.steps, file: r.file, sha: r.sha, evidence: r.evidence, testMd: compileRule(r), stats: { runs: 3, pass: 2, fail: 1, credits: 34, authored: 1, replayed: 2, lastStatus: 'pass' } }));
const sum = (r) => ({ id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, durationS: r.durationS, mode: r.mode, iteration: r.iteration, site: SITE, totals: r.totals, gate: r.gate, credits: r.credits });
writeFileSync(join(out, 'index.json'), JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), sample: true, project: { site: SITE, rules: rules.length, protect: ['rules/**', 'tests/**'], agent: 'claude' }, runs: reports.map(sum).reverse(), loops: [{ id: loop.id, startedAt: loop.startedAt, outcome: 'green', agent: 'claude', iterations: 3, creditsUsed: 140 }], rules }));
console.log('wrote sample data to', out);
