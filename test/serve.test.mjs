import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import { serveStudioApi } from '../src/serve.mjs';
import { loadConfig } from '../src/config.mjs';
import { saveRun } from '../src/store.mjs';
import { tmp } from './helpers.mjs';

const PORT = 4391;
let server;
let root;
let runId;

const report = (id) => ({ v: 1, id, startedAt: 'a', endedAt: 'b', durationS: 1, mode: 'check', iteration: null, site: { url: 'http://127.0.0.1:1/' }, totals: { rules: 1, pass: 1 }, gate: { passed: true, blocking: [] }, credits: { used: 0 }, rules: [] });

// fetch() forbids overriding Host, so use http.request for the host and origin checks
const raw = (path, { method = 'GET', headers = {} } = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method, headers }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });

before(async () => {
  root = tmp();
  writeFileSync(join(root, 'plumb.config.json'), JSON.stringify({ site: { url: 'http://127.0.0.1:1/' } }));
  runId = '20261113T000000Z-abcd';
  saveRun(root, report(runId), '# brief\n');
  mkdirSync(join(root, '.plumb', 'runs', runId, 'shots'), { recursive: true });
  writeFileSync(join(root, '.plumb', 'runs', runId, 'shots', 'pl-theme-s1.jpg'), 'JPEG');
  writeFileSync(join(root, '.plumb', 'state.json'), '{"secret":"do not serve"}');
  const { cfg } = loadConfig({ cwd: root });
  server = await serveStudioApi({ root, cfg, port: PORT });
});
after(() => server.close());

test('index lists runs and rules; a run and its brief and screenshot are served', async () => {
  const idx = JSON.parse((await raw('/api/index')).body);
  assert.equal(idx.runs[0].id, runId);
  assert.ok(idx.rules.length >= 12);
  assert.ok(idx.rules[0].testMd.startsWith('---'));
  assert.equal(JSON.parse((await raw(`/api/runs/${runId}`)).body).id, runId);
  assert.equal((await raw(`/api/runs/${runId}/brief`)).body, '# brief\n');
  const shot = await raw(`/api/runs/${runId}/shots/pl-theme-s1.jpg`);
  assert.equal(shot.status, 200);
  assert.equal(shot.headers['content-type'], 'image/jpeg');
});

test('paths cannot escape .plumb/runs', async () => {
  assert.equal((await raw(`/api/runs/${runId}/shots/..%2F..%2Fstate.json`)).status, 400);
  assert.equal((await raw('/api/runs/..%2Fstate/brief')).status, 400);
  assert.equal((await raw('/api/runs/nope-nope/brief')).status, 404);
});

test('a foreign Host or Origin is refused, and POST needs the custom header', async () => {
  assert.equal((await raw('/api/health', { headers: { Host: 'evil.example:4391' } })).status, 403);
  assert.equal((await raw('/api/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const ok = await raw('/api/health', { headers: { Origin: 'http://127.0.0.1:5173' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
  assert.equal((await raw('/api/check', { method: 'POST' })).status, 403);
});

test('static Studio: assets, SPA fallback for client routes, 404 status for unknown ones, no traversal', async () => {
  const dir = tmp();
  const dist = join(dir, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>studio</title>');
  writeFileSync(join(dist, 'assets', 'a.js'), 'x');
  writeFileSync(join(dir, 'secret.txt'), 'nope');
  const dataDir = join(dir, 'data');
  mkdirSync(dataDir);
  writeFileSync(join(dataDir, 'index.json'), '{"v":1}');
  const { cfg } = loadConfig({ cwd: root });
  const s2 = await serveStudioApi({ root, cfg, port: 4392, staticDir: dist, dataDir });
  const get = (path) => new Promise((resolve, reject) => http.get({ host: '127.0.0.1', port: 4392, path }, (res) => { let b = ''; res.on('data', (d) => (b += d)); res.on('end', () => resolve({ status: res.statusCode, body: b, headers: res.headers })); }).on('error', reject));
  try {
    assert.equal((await get('/')).status, 200);
    assert.match((await get('/studio/runs/x')).body, /studio/);
    const missing = await get('/plumb-missing-page-404');
    assert.equal(missing.status, 404);
    assert.match(missing.body, /studio/);
    assert.equal((await get('/assets/a.js')).headers['content-type'], 'text/javascript; charset=utf-8');
    assert.equal((await get('/assets/none.js')).status, 404);
    assert.equal((await get('/data/index.json')).body, '{"v":1}');
    assert.notEqual((await get('/..%2Fsecret.txt')).body, 'nope');
    assert.equal((await get('/')).headers['x-content-type-options'], 'nosniff');
  } finally {
    s2.close();
  }
});
