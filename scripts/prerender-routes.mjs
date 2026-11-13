// Give every Studio route its own index.html so a static host answers deep links with 200
// instead of its 404 fallback. The app is a single page, so each file is a copy of index.html.
// usage: node scripts/prerender-routes.mjs studio/dist
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'studio/dist');
const index = join(dist, 'index.html');
const data = JSON.parse(readFileSync(join(dist, 'data', 'index.json'), 'utf8'));

const routes = [
  'studio', 'studio/runs', 'studio/loops', 'rules',
  'docs/quick-start', 'docs/write-a-rule', 'docs/rule-format', 'docs/cli', 'docs/agents', 'docs/ci',
  'reports/evidence', 'reports/costs', 'reports/limits',
  ...data.rules.map((r) => `rules/${r.id}`),
  ...data.runs.map((r) => `studio/runs/${r.id}`),
  ...data.loops.map((l) => `studio/loops/${l.id}`),
];
for (const r of routes) {
  mkdirSync(join(dist, r), { recursive: true });
  copyFileSync(index, join(dist, r, 'index.html'));
}
console.log(`prerendered ${routes.length} routes`);
