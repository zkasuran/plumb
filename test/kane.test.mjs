import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authArgs, parseNdjson, parseBalance, parseVersion, parseWhoami, testrunArgs } from '../src/kane.mjs';
import { fixture } from './helpers.mjs';

test('real testrun stream parses and non-JSON notices are skipped', () => {
  const text = `${fixture('testrun-author-pass.ndjson')}\nSkill update available: not installed → 0.1.4\n`;
  const events = parseNdjson(`Skill update available: x\n${text}`);
  assert.equal(events[0].type, 'stream_start');
  assert.equal(events.at(-1).type, 'testrun_done');
  assert.equal(events.at(-1).overall_status, 'passed');
});

test('a half written line does not throw', () => {
  assert.deepEqual(parseNdjson('{"a":1}\n{"b":'), [{ a: 1 }]);
});

test('balance, version and whoami parse the real output shapes', () => {
  assert.equal(parseBalance('Update available\nAvailable credits: 129.8311\n'), 129.8311);
  assert.equal(parseBalance('nothing'), null);
  assert.equal(parseVersion('0.10.4\n'), '0.10.4');
  const w = parseWhoami(' Identity\n │  ✓ Authenticated  \n │  Profile       default\n │  Environment   prod\n │  User          zkasuran\n');
  assert.deepEqual(w, { authenticated: true, user: 'zkasuran', environment: 'prod' });
  assert.equal(parseWhoami('Not authenticated').authenticated, false);
});

test('testrun arguments are what Kane documents', () => {
  const a = testrunArgs({ files: ['tests/plumb/pl-theme_test.md'], url: 'http://127.0.0.1:4173/', parallel: 3, heal: false, policy: 'policy/plumb-gate.yaml', name: 'plumb x' });
  assert.deepEqual(a, ['testrun', 'run', 'tests/plumb/pl-theme_test.md', '--agent', '--headless', '--parallel', '3', '--no-adaptive-heal', '--policy', 'policy/plumb-gate.yaml', '--override-start-url', 'http://127.0.0.1:4173/', '--name', 'plumb x']);
  const b = testrunArgs({ files: ['a_test.md'], url: null, headless: false });
  assert.deepEqual(b, ['testrun', 'run', 'a_test.md', '--agent']);
});

test('LT_USERNAME and LT_ACCESS_KEY become Kane flags, and nothing is passed without both', () => {
  assert.deepEqual(authArgs({ LT_USERNAME: 'u', LT_ACCESS_KEY: 'k' }), ['--username', 'u', '--access-key', 'k']);
  assert.deepEqual(authArgs({ LT_USERNAME: 'u' }), []);
  assert.deepEqual(authArgs({}), []);
});
