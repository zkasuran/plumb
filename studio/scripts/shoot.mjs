// Visual QA: serve dist/ with SPA fallback, screenshot routes in both themes at several widths
// with headless Chrome, and report console errors (CSP violations show up here).
// usage: node scripts/shoot.mjs [--out /tmp/plumb-shots] [--routes /,/studio] [--widths 1440,390] [--themes light,dark]
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => (x.startsWith('--') ? [...a, [x.slice(2), all[i + 1]]] : a), []));
const out = args.out ?? '/tmp/plumb-shots';
const routes = (args.routes ?? '/,/studio,/studio/runs,/rules,/rules/PL-THEME,/docs/quick-start,/reports/costs,/nope-404').split(',');
const widths = (args.widths ?? '1440,390').split(',').map(Number);
const themes = (args.themes ?? 'light,dark').split(',');
mkdirSync(out, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.jpg': 'image/jpeg', '.md': 'text/markdown' };
const csp = readFileSync(join(dist, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)?.[1];
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(dist, p);
  if (!f.startsWith(dist) || !existsSync(f) || statSync(f).isDirectory()) {
    if (p.startsWith('/api/')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end('{"error":"no api"}');
    }
    if (p.startsWith('/data/') || extname(p)) {
      res.writeHead(404);
      return res.end('not found');
    }
    f = join(dist, 'index.html');
  }
  res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const problems = [];
const files = [];

for (const theme of themes) {
  for (const w of widths) {
    for (const route of routes) {
      const name = `${route === '/' ? 'home' : route.replace(/^\//, '').replace(/[^\w]+/g, '-')}-${theme}-${w}.png`;
      const file = join(out, name);
      const h = w < 600 ? 1800 : 1200;
      const r = await run('google-chrome', ['--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, `--blink-settings=preferredColorScheme=${theme === 'dark' ? 0 : 1}`, '--virtual-time-budget=5000', '--enable-logging=stderr', '--v=0', `--screenshot=${file}`, `http://127.0.0.1:${port}${route}`], { encoding: 'utf8', timeout: 60000 }).catch((e) => ({ stderr: String(e.stderr ?? e.message), status: e.code, signal: e.signal }));
      if (!existsSync(file)) problems.push(`${route} ${theme} ${w}: no screenshot (status ${r.status}, signal ${r.signal}, ${String(r.error ?? '')}) ${String(r.stderr).slice(-300)}`);
      const lines = `${r.stderr}`.split('\n').filter((l) => /CONSOLE/.test(l) && !/DevTools listening/.test(l));
      for (const l of lines) problems.push(`${route} ${theme} ${w}: ${l.replace(/^.*CONSOLE[^\]]*\]\s*/, '').slice(0, 220)}`);
      files.push(file);
    }
  }
}
server.close();
console.log(`CSP: ${csp ? 'present' : 'MISSING'}`);
console.log(`${files.length} screenshots in ${out}`);
console.log(problems.length ? `console messages:\n${[...new Set(problems)].join('\n')}` : 'no console messages');
