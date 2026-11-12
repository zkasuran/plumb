import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import picomatch from 'picomatch';
import { sha256 } from './util.mjs';

const ALWAYS_SKIP = new Set(['node_modules', '.git', '.plumb', '.testmuai', '.context']);
const MAX_BYTES = 24 * 1024 * 1024;

function walk(root, visit) {
  const go = (d) => {
    let names = [];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      if (ALWAYS_SKIP.has(name)) continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) go(p);
      else if (st.isFile()) visit(p, st);
    }
  };
  go(root);
}

/**
 * Remember the protected files (rules, compiled tests, the policy, the config) so a
 * coding agent cannot turn a red run green by editing the thing that judges it.
 * `.testmuai` and `.plumb` are skipped by name, so recordings Kane writes do not count.
 * The compiled tests under tests/ are protected, but only their text, not output-*.
 */
export function snapshotProtected(root, globs) {
  const match = picomatch(globs, { dot: true });
  const files = new Map();
  let bytes = 0;
  walk(root, (p, st) => {
    const rel = relative(root, p);
    if (!match(rel) || /(^|\/)output-[^/]+\//.test(rel)) return;
    bytes += st.size;
    if (bytes > MAX_BYTES) return;
    const buf = readFileSync(p);
    files.set(rel, { sha: sha256(buf), buf });
  });
  return files;
}

export function diffSnapshots(before, after) {
  const changed = [];
  const removed = [];
  const added = [];
  for (const [rel, b] of before) {
    const a = after.get(rel);
    if (!a) removed.push(rel);
    else if (a.sha !== b.sha) changed.push(rel);
  }
  for (const rel of after.keys()) if (!before.has(rel)) added.push(rel);
  return { changed, removed, added, tampered: changed.length + removed.length + added.length > 0 };
}

/** Put protected files back exactly as they were. Returns what was restored. */
export function restoreProtected(root, before, diff) {
  for (const rel of [...diff.changed, ...diff.removed]) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, before.get(rel).buf);
  }
  for (const rel of diff.added) rmSync(join(root, rel), { force: true });
  return [...diff.changed, ...diff.removed, ...diff.added];
}

/** Hash the site source files so the loop can say which ones the agent touched. */
export function snapshotSite(dir, ignore = []) {
  const files = new Map();
  if (!dir || !existsSync(dir)) return files;
  const skip = new Set([...ALWAYS_SKIP, ...ignore]);
  const go = (d) => {
    let names = [];
    try {
      names = readdirSync(d);
    } catch {
      return;
    }
    for (const name of names) {
      if (skip.has(name)) continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) go(p);
      else if (st.isFile() && st.size < 2 * 1024 * 1024) files.set(relative(dir, p), sha256(readFileSync(p)));
    }
  };
  go(dir);
  return files;
}

export function changedFiles(before, after) {
  const out = [];
  for (const [rel, sha] of after) if (before.get(rel) !== sha) out.push(rel);
  for (const rel of before.keys()) if (!after.has(rel)) out.push(rel);
  return out.sort();
}
