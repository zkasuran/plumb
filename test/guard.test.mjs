import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotProtected, diffSnapshots, restoreProtected, snapshotSite, changedFiles } from '../src/guard.mjs';
import { diffReports } from '../src/loop.mjs';
import { tmp } from './helpers.mjs';

const GLOBS = ['rules/**', 'tests/**', 'policy/**', 'plumb.config.json'];

function project() {
  const root = tmp();
  for (const [p, t] of Object.entries({ 'rules/A.md': 'rule a', 'tests/plumb/a_test.md': 'test a', 'tests/plumb/output-a/x.json': 'recording', 'policy/plumb-gate.yaml': 'gate', 'plumb.config.json': '{}', 'site/index.html': '<h1>hi</h1>' })) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), t);
  }
  return root;
}

test('editing, deleting or adding a protected file is detected and then undone', () => {
  const root = project();
  const before = snapshotProtected(root, GLOBS);
  assert.ok(before.has('rules/A.md') && !before.has('site/index.html'));
  writeFileSync(join(root, 'rules/A.md'), 'weakened');
  rmSync(join(root, 'policy/plumb-gate.yaml'));
  writeFileSync(join(root, 'rules/NEW.md'), 'extra');
  const d = diffSnapshots(before, snapshotProtected(root, GLOBS));
  assert.deepEqual(d.changed, ['rules/A.md']);
  assert.deepEqual(d.removed, ['policy/plumb-gate.yaml']);
  assert.deepEqual(d.added, ['rules/NEW.md']);
  assert.equal(d.tampered, true);
  restoreProtected(root, before, d);
  assert.equal(readFileSync(join(root, 'rules/A.md'), 'utf8'), 'rule a');
  assert.equal(readFileSync(join(root, 'policy/plumb-gate.yaml'), 'utf8'), 'gate');
  assert.equal(existsSync(join(root, 'rules/NEW.md')), false);
  assert.equal(diffSnapshots(before, snapshotProtected(root, GLOBS)).tampered, false);
});

test('Kane recordings under output-* are not treated as tampering', () => {
  const root = project();
  const before = snapshotProtected(root, GLOBS);
  writeFileSync(join(root, 'tests/plumb/output-a/x.json'), 'new recording');
  assert.equal(diffSnapshots(before, snapshotProtected(root, GLOBS)).tampered, false);
});

test('site edits are listed, protected folders are not mistaken for site files', () => {
  const root = project();
  const a = snapshotSite(join(root, 'site'));
  writeFileSync(join(root, 'site/index.html'), '<h1>new</h1>');
  writeFileSync(join(root, 'site/app.css'), 'x');
  assert.deepEqual(changedFiles(a, snapshotSite(join(root, 'site'))), ['app.css', 'index.html']);
});

test('diffReports names fixed, regressed and still failing rules', () => {
  const rep = (o) => ({ rules: Object.entries(o).map(([id, status]) => ({ id, status })) });
  const d = diffReports(rep({ A: 'fail', B: 'pass', C: 'fail', D: 'pass' }), rep({ A: 'pass', B: 'fail', C: 'fail', D: 'pass' }));
  assert.deepEqual(d, { fixed: ['A'], regressed: ['B'], stillFailing: ['C'], stillPassing: ['D'] });
});

import { agentCommand } from '../src/agents.mjs';
test('agent commands take an optional model and keep the prompt as one argument', () => {
  const o = agentCommand('opencode', { prompt: 'fix it', cwd: '/x', model: 'prov/model' });
  assert.deepEqual(o, { bin: 'opencode', args: ['run', '-m', 'prov/model', 'fix it'] });
  assert.deepEqual(agentCommand('opencode', { prompt: 'p', cwd: '/x', model: null }).args, ['run', 'p']);
  assert.throws(() => agentCommand('cmd', { prompt: 'p', cwd: '/x' }), /agent.cmd/);
});

import { agentModels, runAgentWithFallback } from '../src/loop.mjs';
import { isLimitError, modelLabel, cleanOutput } from '../src/agents.mjs';

test('usage limits are recognised, other failures are not', () => {
  assert.equal(isLimitError({ exit: 1, output: 'Error: pool budget exhausted — next batch in 36m' }), true);
  assert.equal(isLimitError({ exit: 1, output: '429 Too Many Requests' }), true);
  assert.equal(isLimitError({ exit: 1, output: 'syntax error in prompt' }), false);
  assert.equal(isLimitError({ exit: 0, output: 'quota used up' }), false);
});

test('model labels hide the provider and the env list wins over config', () => {
  assert.equal(modelLabel('vendor/model-1'), 'model-1');
  assert.equal(modelLabel(null), null);
  const cfg = { agent: { model: 'c', models: ['a', 'b'] } };
  assert.deepEqual(agentModels(cfg, { PLUMB_AGENT_MODELS: 'x, y' }), ['x', 'y']);
  assert.deepEqual(agentModels(cfg, {}), ['a', 'b']);
  assert.deepEqual(agentModels({ agent: { model: null, models: [] } }, {}), [null]);
});

test('the agent rotates models on a limit, waits when all are limited, and gives up after the retries', async () => {
  const seen = [];
  const events = [];
  const ok = await runAgentWithFallback({ agentName: 'a', models: ['m1', 'm2'], onProgress: (e) => events.push(e.type), sleepFn: async () => {}, run: async (m) => (seen.push(m), m === 'm2' ? { exit: 0, output: 'done' } : { exit: 1, output: 'budget exhausted' }) });
  assert.equal(ok.model, 'm2');
  assert.deepEqual(seen, ['m1', 'm2']);
  assert.deepEqual(events, ['agent_limit']);

  let calls = 0;
  const waits = [];
  const later = await runAgentWithFallback({ agentName: 'a', models: ['m1'], onProgress: () => {}, sleepFn: async (ms) => waits.push(ms), waitS: 5, run: async () => (++calls < 3 ? { exit: 1, output: 'rate limit' } : { exit: 0, output: 'ok' }) });
  assert.equal(later.exit, 0);
  assert.deepEqual(waits, [5000, 5000]);

  const never = await runAgentWithFallback({ agentName: 'a', models: ['m1'], onProgress: () => {}, sleepFn: async () => {}, retries: 2, run: async () => ({ exit: 1, output: 'quota' }) });
  assert.equal(never.limited, true);
});

test('agent output is cleaned of colour codes and tool-call noise', () => {
  const text = '\u001b[0m⚙ some_gateway_tool {"id":1}\n\u001b[0m% Patch 2 files\nI changed the header and the theme switch.\n';
  assert.equal(cleanOutput(text), 'I changed the header and the theme switch.');
});
