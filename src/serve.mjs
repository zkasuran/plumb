import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { listRuns, loadRun, latestRun, runDir, plumbDir } from './store.mjs';
import { listLoops, rulesForStudio } from './export.mjs';
import { runCheck } from './check.mjs';
import { runLoop } from './loop.mjs';
import { kaneStatus } from './kane.mjs';
import { readJson } from './util.mjs';

const STUDIO_DIST = fileURLToPath(new URL('../studio/dist', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };
const CLIENT_ROUTES = /^\/(studio|rules|docs|reports)(\/|$)/;
const SECURITY = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()' };
const ID_RE = /^[0-9A-Za-z_-]{6,64}$/;
const SHOT_RE = /^[\w.-]+\.jpg$/;
const MAX_BODY = 8 * 1024;

/**
 * The Studio's live API. It binds to 127.0.0.1 only, checks the Host header (DNS rebinding),
 * and requires a custom header on every POST so a web page cannot trigger a check by
 * submitting a form. Reads are limited to .plumb.
 */
export { STUDIO_DIST };
export async function serveStudioApi({ root, cfg, port = 4310, host = '127.0.0.1', allowOrigins = [], staticDir = null, dataDir = null }) {
  const origins = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`, 'http://127.0.0.1:5173', 'http://localhost:5173', ...allowOrigins]);
  const jobs = new Map();
  let running = null;
  let kaneCache = { at: 0, value: null };

  const json = (res, code, body, extra = {}) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(JSON.stringify(body));
  };

  function startJob(kind, flags) {
    const id = randomUUID().slice(0, 12);
    const job = { id, kind, events: [], done: false, listeners: new Set(), result: null, error: null };
    jobs.set(id, job);
    const push = (e) => {
      const ev = { at: Date.now(), ...e };
      job.events.push(ev);
      for (const l of job.listeners) l(ev);
    };
    running = job;
    const task = kind === 'loop' ? runLoop({ root, cfg, flags, onProgress: push }) : runCheck({ root, cfg, flags: { ...flags, mode: 'studio' }, onProgress: push });
    task
      .then((r) => {
        job.result = kind === 'loop' ? { loopId: r.id, outcome: r.outcome } : { runId: r.report.id, gate: r.report.gate };
        push({ type: 'done', ...job.result });
      })
      .catch((e) => {
        job.error = e.message;
        push({ type: 'error', message: e.message, hint: e.hint ?? null });
      })
      .finally(() => {
        job.done = true;
        running = null;
        for (const l of job.listeners) l(null);
        setTimeout(() => jobs.delete(id), 10 * 60_000).unref();
      });
    return job;
  }

  // Static Studio: the built app, recorded data from dataDir when given, SPA fallback for client routes.
  function sendStatic(_req, res, p) {
    let rel = normalize(decodeURIComponent(p)).replace(/^[/\\]+/, '');
    if (rel.includes('..')) return json(res, 400, { error: 'bad path' });
    let base = staticDir;
    if (dataDir && (rel === 'data' || rel.startsWith(`data${sep}`))) {
      base = dataDir;
      rel = rel.replace(/^data[/\\]?/, '');
    }
    let file = join(base, rel);
    const inside = file === base || file.startsWith(base + sep);
    const isFile = inside && existsSync(file) && statSync(file).isFile();
    if (!isFile) {
      if (extname(rel)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY });
        return res.end('Not found');
      }
      file = join(staticDir, 'index.html');
      if (!existsSync(file)) return json(res, 503, { error: 'Studio is not built. Run: npm run build in studio/' });
      const known = p === '/' || CLIENT_ROUTES.test(p);
      res.writeHead(known ? 200 : 404, { 'content-type': MIME['.html'], 'cache-control': 'no-store', ...SECURITY });
      return res.end(readFileSync(file));
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': /\/assets\//.test(p) ? 'public, max-age=31536000, immutable' : 'no-store', ...SECURITY });
    createReadStream(file).pipe(res);
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${host}:${port}`);
      const hostOk = [`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host ?? '');
      if (!hostOk) return json(res, 403, { error: 'bad host' });
      const origin = req.headers.origin;
      const cors = origin && origins.has(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-headers': 'content-type, x-plumb', 'access-control-allow-methods': 'GET, POST, OPTIONS' } : {};
      if (req.method === 'OPTIONS') return json(res, 204, {}, cors);
      if (origin && !origins.has(origin)) return json(res, 403, { error: 'origin not allowed' });

      const p = url.pathname;
      if (req.method === 'GET' && staticDir && !p.startsWith('/api/')) return sendStatic(req, res, p);
      if (req.method === 'GET') {
        if (p === '/api/health') {
          if (Date.now() - kaneCache.at > 30_000) kaneCache = { at: Date.now(), value: await kaneStatus() };
          return json(res, 200, { ok: true, mode: 'live', version: '0.1.0', busy: !!running, kane: kaneCache.value }, cors);
        }
        if (p === '/api/index') {
          const rules = rulesForStudio({ root, cfg });
          return json(res, 200, { v: 1, generatedAt: new Date().toISOString(), sample: false, live: true, project: { site: cfg.site.url, rules: rules.length, protect: cfg.protect, agent: cfg.agent.name }, runs: listRuns(root), loops: listLoops(root), rules }, cors);
        }
        let m;
        if ((m = p.match(/^\/api\/runs\/([^/]+)$/))) {
          if (!ID_RE.test(m[1])) return json(res, 400, { error: 'bad id' }, cors);
          const r = loadRun(root, m[1]);
          return r ? json(res, 200, r, cors) : json(res, 404, { error: 'no such run' }, cors);
        }
        if ((m = p.match(/^\/api\/runs\/([^/]+)\/brief$/))) {
          if (!ID_RE.test(m[1])) return json(res, 400, { error: 'bad id' }, cors);
          const f = join(runDir(root, m[1]), 'brief.md');
          if (!existsSync(f)) return json(res, 404, { error: 'no brief' }, cors);
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8', ...cors });
          return res.end(readFileSync(f));
        }
        if ((m = p.match(/^\/api\/runs\/([^/]+)\/shots\/([^/]+)$/))) {
          if (!ID_RE.test(m[1]) || !SHOT_RE.test(m[2])) return json(res, 400, { error: 'bad name' }, cors);
          const f = join(runDir(root, m[1]), 'shots', m[2]);
          if (!existsSync(f)) return json(res, 404, { error: 'no such image' }, cors);
          res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': statSync(f).size, 'cache-control': 'public, max-age=3600', ...cors });
          return createReadStream(f).pipe(res);
        }
        if ((m = p.match(/^\/api\/loops\/([^/]+)$/))) {
          if (!ID_RE.test(m[1])) return json(res, 400, { error: 'bad id' }, cors);
          const rec = readJson(join(plumbDir(root), 'loops', `${m[1]}.json`), null);
          return rec ? json(res, 200, rec, cors) : json(res, 404, { error: 'no such loop' }, cors);
        }
        if ((m = p.match(/^\/api\/jobs\/([^/]+)\/events$/))) {
          const job = jobs.get(m[1]);
          if (!job) return json(res, 404, { error: 'no such job' }, cors);
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', ...cors });
          const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
          for (const ev of job.events) send(ev);
          if (job.done) return res.end();
          const l = (ev) => (ev ? send(ev) : res.end());
          job.listeners.add(l);
          req.on('close', () => job.listeners.delete(l));
          return;
        }
        if (p === '/api/latest') {
          const r = latestRun(root);
          return r ? json(res, 200, r, cors) : json(res, 404, { error: 'no runs yet' }, cors);
        }
        return json(res, 404, { error: 'not found' }, cors);
      }

      if (req.method === 'POST') {
        if (req.headers['x-plumb'] !== '1') return json(res, 403, { error: 'missing X-Plumb header' }, cors);
        if (running) return json(res, 409, { error: 'a job is already running', jobId: running.id }, cors);
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > MAX_BODY) return json(res, 413, { error: 'too large' }, cors);
        }
        const args = body ? JSON.parse(body) : {};
        const rules = Array.isArray(args.rules) ? args.rules.filter((x) => typeof x === 'string' && /^[A-Z][A-Z0-9-]{2,40}$/.test(x)).slice(0, 40) : undefined;
        if (p === '/api/check') return json(res, 202, { jobId: startJob('check', { rules, fresh: !!args.fresh }).id }, cors);
        if (p === '/api/loop') return json(res, 202, { jobId: startJob('loop', { rules, agent: typeof args.agent === 'string' ? args.agent : undefined }).id }, cors);
        return json(res, 404, { error: 'not found' }, cors);
      }
      return json(res, 405, { error: 'method not allowed' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  process.stderr.write(`Plumb Studio API on http://${host}:${port}\n`);
  return server;
}
