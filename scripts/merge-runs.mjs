// Copy finished runs from one Plumb project into another so the Studio can show them side by side.
// usage: node scripts/merge-runs.mjs <from-project> <to-project>
import { cpSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadRun, runDir, summarize } from '../src/store.mjs';
import { readJson, writeJson } from '../src/util.mjs';

const [from, to] = process.argv.slice(2).map((p) => resolve(p));
if (!from || !to) {
  console.error('usage: node scripts/merge-runs.mjs <from-project> <to-project>');
  process.exit(2);
}
const ids = readdirSync(join(from, '.plumb', 'runs')).sort();
let n = 0;
for (const id of ids) {
  const report = loadRun(from, id);
  if (!report || existsSync(join(to, '.plumb', 'runs', id))) continue;
  cpSync(runDir(from, id), runDir(to, id), { recursive: true });
  n++;
}
// rebuild the destination index from every run folder, newest first
const all = readdirSync(join(to, '.plumb', 'runs')).map((id) => loadRun(to, id)).filter(Boolean).map(summarize);
all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
const idx = readJson(join(to, '.plumb', 'index.json'), { v: 1, runs: [] });
idx.runs = all;
writeJson(join(to, '.plumb', 'index.json'), idx);
if (all[0]) writeJson(join(to, '.plumb', 'latest.json'), { runId: all[0].id, at: all[0].endedAt });
console.log(`merged ${n} run(s); ${all.length} in ${to}`);
