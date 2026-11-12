import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readPack, consoleFindings, extractScreenshots, openZip } from '../src/evidence.mjs';
import { makeZip, tmp } from './helpers.mjs';

const RESULT = `evidence: '0.1'
test: theme-3f94b1ca
status: failed
duration_ms: 28889
external_id:
  session_name: pl-theme
  session_id: abc
tags:
  - plumb
  - pl-theme
  - blocking
environment:
  run_kind: author
steps:
  - id: 0-1
    ordinal: 1
    status: passed
    kind: navigate
    duration_ms: 0
  - id: 0-2
    ordinal: 2
    status: failed
    duration_ms: 12100
`;
const FAILURE = `step: 0-2
status: failed
error:
  message: No theme control.
page_state:
  url: http://127.0.0.1:4173/
  screenshot: steps/2-0-2/screenshot.jpg
title: Theme control missing
triage:
  rca:
    root_cause: The page has no theme control.
    category: application_issue/functional_defect
    confidence: 0.94
  severity: major
  suggested_fix:
    summary: Add a visible theme control.
`;
const CONSOLE = [
  '{"marker": "step", "step": "0-1", "ordinal": 1}',
  '{"sequence": 0, "level": "error", "text": "Failed to load resource: the server responded with a status of 404 (File not found)", "url": "http://127.0.0.1:4173/favicon.ico", "step": "0-1"}',
  '{"sequence": 1, "level": "error", "text": "Refused to execute inline script because it violates the Content Security Policy", "url": "http://127.0.0.1:4173/", "step": "0-1"}',
  '{"sequence": 2, "level": "info", "text": "hello"}',
].join('\n');

function pack() {
  const dir = tmp();
  const file = join(dir, 'x.evidence');
  writeFileSync(
    file,
    makeZip({
      'run.yaml': 'run_id: r1\nstatus: finalized\n',
      'tests/theme-3f94b1ca/result.yaml': RESULT,
      'tests/theme-3f94b1ca/steps/1-0-1/step.json': '{"kind":"navigate","status":"passed","summary":"navigate: x","url":"http://127.0.0.1:4173/"}',
      'tests/theme-3f94b1ca/steps/1-0-1/screenshot.jpg': 'JPEG1',
      'tests/theme-3f94b1ca/steps/2-0-2/step.json': '{"kind":"","status":"failed","summary":"wait: x"}',
      'tests/theme-3f94b1ca/steps/2-0-2/screenshot.jpg': 'JPEG2',
      'tests/theme-3f94b1ca/steps/2-0-2/failure.yaml': FAILURE,
      'tests/theme-3f94b1ca/logs/0-console.ndjson': CONSOLE,
    })
  );
  return { dir, file };
}

test('reads steps, failure triage and console from a pack', () => {
  const { file } = pack();
  const p = readPack(file);
  assert.equal(p.run.run_id, 'r1');
  const t = p.tests[0];
  assert.deepEqual(t.tags, ['plumb', 'pl-theme', 'blocking']);
  assert.deepEqual(t.steps.map((s) => [s.ordinal, s.status]), [[1, 'passed'], [2, 'failed']]);
  assert.equal(t.failures[0].suggestedFix, 'Add a visible theme control.');
  assert.equal(t.failures[0].severity, 'major');
  assert.equal(t.failures[0].confidence, 0.94);
});

test('console findings count errors and CSP refusals but not favicon noise or info', () => {
  const t = readPack(pack().file).tests[0];
  assert.equal(t.console.length, 3);
  const f = consoleFindings(t);
  assert.equal(f.length, 1);
  assert.equal(f[0].kind, 'csp');
});

test('screenshots are copied out under stable names', () => {
  const { file, dir } = pack();
  const p = readPack(file);
  const map = extractScreenshots(p, p.tests[0], join(dir, 'shots'), 'pl-theme');
  // one picture per rule step: the last action of flow 0 is 0-2, so 0-1 is not extracted
  assert.equal(map['tests/theme-3f94b1ca/steps/1-0-1/screenshot.jpg'], undefined);
  assert.equal(map['tests/theme-3f94b1ca/steps/2-0-2/screenshot.jpg'], 'pl-theme-s1.jpg');
  assert.equal(readFileSync(join(dir, 'shots', 'pl-theme-s1.jpg'), 'utf8'), 'JPEG2');
});

test('a file that is not a zip is rejected', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'bad.evidence'), 'nope');
  assert.throws(() => openZip(join(dir, 'bad.evidence')), /not a zip/);
});
