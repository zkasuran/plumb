import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES = 4000;

/** Hash a folder by relative path and content. Same bytes in, same hash out. */
export function fingerprintDir(dir, ignore = []) {
  const h = createHash('sha256');
  let count = 0;
  const skip = new Set(ignore);
  const walk = (d) => {
    let names = [];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (skip.has(name) || name.startsWith('.DS_')) continue;
      const p = join(d, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && st.size <= MAX_FILE && count < MAX_FILES) {
        h.update(relative(dir, p)).update('\0').update(readFileSync(p)).update('\0');
        count++;
      }
    }
  };
  walk(dir);
  return { hash: h.digest('hex').slice(0, 16), files: count };
}

const ASSET_RE = /(?:<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']|<script[^>]+src=["']([^"']+)["']|<link[^>]+href=["']([^"']+)["'][^>]*rel=["']?stylesheet["']?)/gi;

async function fetchText(url, timeoutMs) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' });
    const body = await res.text();
    return { status: res.status, body: body.slice(0, MAX_FILE) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Hash what a visitor's browser receives: the start page plus its same-origin stylesheets
 * and scripts. Used when the site is only reachable by URL, such as a preview deploy.
 */
export async function fingerprintUrl(url, { timeoutMs = 6000 } = {}) {
  try {
    const first = await fetchText(url, timeoutMs);
    const h = createHash('sha256').update(String(first.status)).update(first.body);
    const origin = new URL(url).origin;
    const assets = new Set();
    for (const m of first.body.matchAll(ASSET_RE)) {
      const ref = m[1] || m[2] || m[3];
      try {
        const abs = new URL(ref, url);
        if (abs.origin === origin) assets.add(abs.href);
      } catch {
        /* skip bad href */
      }
    }
    let n = 0;
    for (const a of [...assets].sort().slice(0, 24)) {
      try {
        const r = await fetchText(a, timeoutMs);
        h.update(a).update(String(r.status)).update(r.body);
        n++;
      } catch {
        h.update(a).update('unreachable');
      }
    }
    return { hash: h.digest('hex').slice(0, 16), files: n + 1, status: first.status, error: null };
  } catch (e) {
    return { hash: null, files: 0, status: null, error: e.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : e.message };
  }
}

/** Prefer the folder when known (exact), else the URL (what a browser sees). */
export async function fingerprintSite({ url, dir, ignore }) {
  if (dir) {
    const d = fingerprintDir(dir, ignore);
    return { kind: 'dir', ...d, error: null };
  }
  if (url) return { kind: 'url', ...(await fingerprintUrl(url)) };
  return { kind: 'none', hash: null, files: 0, error: 'no site.url or site.dir configured' };
}
