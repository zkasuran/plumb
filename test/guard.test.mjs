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
