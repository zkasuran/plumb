import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNdjson } from '../src/kane.mjs';
import { readMember, splitSummary, buildRuleResult, totalsOf, gateOf, sanitizeReport } from '../src/report.mjs';
import { parseRule } from '../src/rules.mjs';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers.mjs';

const { rule } = parseRule(readFileSync(new URL('../rules/house/PL-THEME.md', import.meta.url), 'utf8'), '@house/PL-THEME.md');
const member = (n) => readMember(parseNdjson(fixture(`member-${n}.events.ndjson`)));
const memberEnd = (n) => parseNdjson(fixture(`testrun-${n}.ndjson`)).find((e) => /member_end/.test(e.type));

test('an authored passing run: three passed steps, kind author, credits summed', () => {
  const m = member('author-pass');
  assert.deepEqual(m.steps.map((s) => s.status), ['pass', 'pass', 'pass']);
  assert.equal(m.kind, 'author');
  assert.equal(m.committed, true);
  assert.ok(m.credits > 40 && m.credits < 50, `credits ${m.credits}`);
});

test('an authored failing run carries Kane\'s reason, fix sentence and bug verdict', () => {
  const m = member('author-fail');
  assert.equal(m.status, 'failed');
  assert.equal(m.steps[0].status, 'fail');
  assert.equal(m.bug.confirmed, true);
  assert.equal(m.bug.severity, 'major');
  const s = splitSummary(m.failure.summary);
  assert.match(s.happened, /theme-switching control was not shown/);
  assert.match(s.fix, /^Add a clearly visible light\/dark theme control/);
});

test('a replay is recognised and costs nothing at step level', () => {
  const m = member('replay-pass');
  assert.equal(m.kind, 'replay');
  assert.equal(m.credits, 0);
  assert.equal(m.steps.length, 3);
});

test('buildRuleResult for a red rule has step, message, fix and no screenshot without a pack', () => {
  const r = buildRuleResult({ rule, member: member('author-fail'), memberEnd: memberEnd('author-fail'), test: null });
  assert.equal(r.status, 'fail');
  assert.equal(r.failure.step, 1);
  assert.match(r.failure.stepText, /^Look for a control/);
  assert.match(r.failure.suggestedFix, /theme control/);
  assert.equal(r.failure.severity, 'major');
  assert.equal(r.steps.length, 3);
  assert.deepEqual(r.steps.map((s) => s.status), ['fail', 'skipped', 'skipped']);
  assert.ok(r.fix.includes('data-theme'));
});

test('buildRuleResult for a green rule has no failure', () => {
  const r = buildRuleResult({ rule, member: member('replay-pass'), memberEnd: memberEnd('replay-pass'), test: null });
  assert.equal(r.status, 'pass');
  assert.equal(r.failure, null);
  assert.equal(r.kind, 'replay');
});

test('a console-evidence rule fails on console findings even when Kane said pass', () => {
  const consoleRule = { ...rule, id: 'PL-CONSOLE', evidence: ['console'] };
  const r = buildRuleResult({ rule: consoleRule, member: member('replay-pass'), memberEnd: memberEnd('replay-pass'), test: null, consoleCount: 2, consoleSample: [{ text: 'Refused to load script', url: 'http://x/a.js' }, { text: 'boom' }] });
  assert.equal(r.status, 'fail');
  assert.match(r.failure.message, /console reported 2 problems/);
  assert.match(r.failure.happened, /Refused to load script/);
});

test('totals and gate: only blocking failures block', () => {
  const mk = (id, status, severity) => ({ id, status, severity, source: 'kane', kind: 'replay' });
  const rs = [mk('A', 'pass', 'blocking'), mk('B', 'fail', 'advisory'), mk('C', 'fail', 'blocking'), { ...mk('D', 'pass', 'blocking'), source: 'cache' }];
  const t = totalsOf(rs);
  assert.equal(t.blockingFail, 1);
  assert.equal(t.advisoryFail, 1);
  assert.equal(t.cached, 1);
  assert.deepEqual(gateOf(rs), { passed: false, blocking: ['C'] });
  assert.deepEqual(gateOf([mk('A', 'pass', 'blocking'), mk('B', 'fail', 'advisory')]), { passed: true, blocking: [] });
  assert.equal(gateOf([mk('A', 'skipped', 'blocking')]).passed, false);
});

test('reports never carry the home directory', () => {
  const home = process.env.HOME;
  const r = sanitizeReport({ a: `${home}/x/y`, n: [{ b: `${home}/z` }] });
  assert.equal(r.a, '~/x/y');
  assert.equal(r.n[0].b, '~/z');
});
