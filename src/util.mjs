import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Write atomically so a hook that reads mid-write never sees half a file. */
export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, path);
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export const exists = existsSync;

export function nowIso() {
  return new Date().toISOString();
}

/** Run id that sorts by time and is safe in a file name: 20261113T051200Z-ab12 */
export function newRunId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  return `${stamp}-${Math.random().toString(16).slice(2, 6)}`;
}

export function round(n, digits = 1) {
  if (typeof n !== 'number' || Number.isNaN(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function truncate(text, max = 240) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Replace the home directory so a path never leaks the user name into a report. */
export function homeless(text, home = process.env.HOME || '') {
  if (!text || !home) return text;
  return String(text).split(home).join('~');
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export class PlumbError extends Error {
  constructor(message, { code = 'PLUMB_ERROR', exit = 2, hint = null } = {}) {
    super(message);
    this.code = code;
    this.exit = exit;
    this.hint = hint;
  }
}
