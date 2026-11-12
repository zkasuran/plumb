import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRules, fitToBudget, estimateCredits } from '../src/check.mjs';
import { DEFAULTS } from '../src/config.mjs';

const r = (id, severity = 'blocking', sha = 'a') => ({ id, severity, sha });
const cfg = { credits: { floor: 60, perRuleEstimate: 50 } };

test('a rule whose rule text and site are unchanged is reused, even if it was red', () => {
  const state = { rules: { A: { fingerprint: 'f1', sha: 'a', runId: 'r1', result: { status: 'fail' } }, B: { fingerprint: 'f1', sha: 'a', runId: 'r1', result: { status: 'pass' } } } };
  const plan = planRules({ rules: [r('A'), r('B'), r('C')], state, fingerprint: { hash: 'f1' } });
  assert.deepEqual(plan.reuse.map((x) => x.rule.id), ['A', 'B']);
  assert.deepEqual(plan.run.map((x) => x.id), ['C']);
});

test('a changed site, a changed rule, --fresh or no fingerprint all force a rerun', () => {
  const state = { rules: { A: { fingerprint: 'f1', sha: 'a', runId: 'r1', result: { status: 'pass' } } } };
  assert.equal(planRules({ rules: [r('A')], state, fingerprint: { hash: 'f2' } }).run.length, 1);
  assert.equal(planRules({ rules: [r('A', 'blocking', 'b')], state, fingerprint: { hash: 'f1' } }).run.length, 1);
  assert.equal(planRules({ rules: [r('A')], state, fingerprint: { hash: 'f1' }, fresh: true }).run.length, 1);
  assert.equal(planRules({ rules: [r('A')], state, fingerprint: { hash: null } }).run.length, 1);
});

test('a recorded green rule is estimated as a cheap replay, a new or red one as an authoring run', () => {
  const state = { rules: { A: { result: { status: 'pass' } }, B: { result: { status: 'fail' } } } };
  assert.equal(estimateCredits(r('A'), state, cfg), 3);
  assert.equal(estimateCredits(r('B'), state, cfg), 50);
  assert.equal(estimateCredits(r('C'), state, cfg), 50);
});

test('the budget keeps blocking rules first and stops above the floor', () => {
  const rules = [r('ADV', 'advisory'), r('B1'), r('B2'), r('B3')];
  const { fit, skipped } = fitToBudget({ rules, balance: 220, state: { rules: {} }, cfg });
  assert.deepEqual(fit.map((x) => x.id), ['B1', 'B2', 'B3'].slice(0, 3));
  assert.deepEqual(skipped.map((x) => x.id), ['ADV']);
  assert.equal(fitToBudget({ rules, balance: 50, state: { rules: {} }, cfg }).fit.length, 0);
  assert.equal(fitToBudget({ rules, balance: null, state: { rules: {} }, cfg }).fit.length, 4);
});

test('defaults protect the things that judge the site', () => {
  for (const p of ['rules/**', 'tests/**', 'policy/**', 'plumb.config.json']) assert.ok(DEFAULTS.protect.includes(p));
});
