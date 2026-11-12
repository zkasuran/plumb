import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseRule, loadRulePack, parseCheckSteps, HOUSE_DIR } from '../src/rules.mjs';
import { tmp } from './helpers.mjs';

const GOOD = `---
id: PL-DEMO
title: A demo rule that is long enough
severity: blocking
---
## Rule
Say it.
## Why
Because.
## Check
- Do a thing. Verify it worked.
## Fix
Fix it.
`;

test('a well formed rule parses with no problems', () => {
  const { rule, problems } = parseRule(GOOD);
  assert.equal(rule.id, 'PL-DEMO');
  assert.deepEqual(rule.steps, ['Do a thing. Verify it worked.']);
  assert.deepEqual(problems, []);
});

test('check steps join continuation lines and ignore other text', () => {
  assert.deepEqual(parseCheckSteps('- one\n  more\n2. two\nstray'), ['one more', 'two stray']);
});

test('a rule whose last step verifies nothing is an error', () => {
  const { problems } = parseRule(GOOD.replace('Do a thing. Verify it worked.', 'Click the button.'));
  assert.ok(problems.some((p) => p.code === 'RULE_NO_ASSERT'));
});

test('bad id, bad severity and too many steps are reported', () => {
  const many = Array.from({ length: 9 }, (_, i) => `- step ${i} verify`).join('\n');
  const { problems } = parseRule(GOOD.replace('PL-DEMO', 'bad id').replace('blocking', 'loud').replace('- Do a thing. Verify it worked.', many));
  const codes = problems.map((p) => p.code);
  assert.ok(codes.includes('RULE_ID') && codes.includes('RULE_SEVERITY') && codes.includes('RULE_TOO_LONG'));
});

test('template braces are refused because Kane would treat them as variables', () => {
  const { problems } = parseRule(GOOD.replace('Do a thing.', 'Type {{name}}.'));
  assert.ok(problems.some((p) => p.code === 'RULE_VARIABLES'));
});

test('missing frontmatter is an error, not a crash', () => {
  const { problems } = parseRule('## Rule\nx');
  assert.ok(problems.some((p) => p.code === 'RULE_FRONTMATTER'));
});

test('every shipped house rule lints clean and has a fix and a why', () => {
  const pack = loadRulePack({ root: process.cwd(), dirs: ['@house'] });
  assert.equal(pack.problems.length, 0, JSON.stringify(pack.problems));
  assert.ok(pack.rules.length >= 12);
  assert.equal(new Set(pack.rules.map((r) => r.id)).size, pack.rules.length);
  assert.ok(HOUSE_DIR.endsWith('rules/house'));
});

test('a project rule with a house id overrides it; a duplicate in one folder is an error', () => {
  const root = tmp();
  mkdirSync(join(root, 'rules'));
  writeFileSync(join(root, 'rules', 'PL-THEME.md'), GOOD.replace('PL-DEMO', 'PL-THEME').replace('A demo rule that is long enough', 'Our own theme rule, tuned'));
  const pack = loadRulePack({ root, dirs: ['@house', 'rules'] });
  assert.equal(pack.rules.find((r) => r.id === 'PL-THEME').title, 'Our own theme rule, tuned');
  writeFileSync(join(root, 'rules', 'copy.md'), GOOD.replace('PL-DEMO', 'PL-THEME'));
  const dup = loadRulePack({ root, dirs: ['rules'] });
  assert.ok(dup.problems.some((p) => p.code === 'RULE_DUPLICATE'));
});

test('exclude and only narrow the pack', () => {
  const pack = loadRulePack({ root: process.cwd(), dirs: ['@house'], exclude: ['PL-NAV'], only: ['PL-NAV', 'PL-THEME'] });
  assert.deepEqual(pack.rules.map((r) => r.id), ['PL-THEME']);
});
