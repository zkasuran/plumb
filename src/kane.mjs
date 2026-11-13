import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const KANE = process.env.PLUMB_KANE_BIN || 'kane-cli';
const AGENT_TAG = process.env.KANE_CLI_USER_AGENT || 'plumb';

/**
 * Credentials for CI and shared machines: LT_USERNAME and LT_ACCESS_KEY, the pair Kane documents.
 * They are passed on each command and never written to disk by Plumb.
 */
export function authArgs(env = process.env) {
  return env.LT_USERNAME && env.LT_ACCESS_KEY ? ['--username', env.LT_USERNAME, '--access-key', env.LT_ACCESS_KEY] : [];
}

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (s) => String(s ?? '').replace(ANSI_RE, '');

/** Parse NDJSON text. Lines that are not JSON objects (update notices) are skipped, as Kane documents. */
export function parseNdjson(text) {
  const events = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object') events.push(o);
    } catch {
      /* partial line */
    }
  }
  return events;
}

export function readNdjsonFile(path) {
  if (!path || !existsSync(path)) return [];
  return parseNdjson(readFileSync(path, 'utf8'));
}

/**
 * Run kane-cli. stdin is closed (Kane requires that for testrun without --agent and it
 * keeps a prompt from hanging a hook). Events are handed to `onEvent` as they arrive.
 */
export function runKane(args, { cwd, env = {}, onEvent, onStderr, timeoutMs = 0, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(KANE, [...args, ...authArgs()], {
      cwd,
      env: { ...process.env, KANE_CLI_USER_AGENT: AGENT_TAG, NO_COLOR: '1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const events = [];
    let buf = '';
    let stderr = '';
    let timer = null;
    let timedOut = false;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGINT');
        setTimeout(() => child.kill('SIGKILL'), 8000).unref();
      }, timeoutMs);
    }
    if (signal) signal.addEventListener('abort', () => child.kill('SIGINT'), { once: true });
    const feed = (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        for (const ev of parseNdjson(line)) {
          events.push(ev);
          onEvent?.(ev);
        }
      }
    };
    child.stdout.setEncoding('utf8').on('data', feed);
    child.stderr.setEncoding('utf8').on('data', (c) => {
      stderr += c;
      onStderr?.(c);
    });
    child.on('error', (e) => {
      if (timer) clearTimeout(timer);
      reject(e.code === 'ENOENT' ? Object.assign(new Error('kane-cli is not installed. Run: npm install -g @testmuai/kane-cli'), { code: 'KANE_MISSING' }) : e);
    });
    child.on('close', (code, sig) => {
      if (timer) clearTimeout(timer);
      if (buf.trim()) for (const ev of parseNdjson(buf)) (events.push(ev), onEvent?.(ev));
      resolve({ code, signal: sig, events, stderr: stripAnsi(stderr), timedOut });
    });
  });
}

/** Plain text commands (balance, whoami, version) that do not stream NDJSON. */
export async function kaneText(args, opts = {}) {
  const r = await new Promise((resolve, reject) => {
    const child = spawn(KANE, args, { cwd: opts.cwd, env: { ...process.env, NO_COLOR: '1', KANE_CLI_USER_AGENT: AGENT_TAG }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const t = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 30000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(t);
      resolve({ code, out: stripAnsi(out), err: stripAnsi(err) });
    });
  });
  return r;
}

export const parseBalance = (text) => {
  const m = stripAnsi(text).match(/Available credits:\s*([\d.]+)/i);
  return m ? Number(m[1]) : null;
};

export const parseVersion = (text) => {
  const m = stripAnsi(text).match(/(\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?)/);
  return m ? m[1] : null;
};

export function parseWhoami(text) {
  const t = stripAnsi(text);
  return {
    authenticated: /Authenticated/i.test(t) && !/not authenticated/i.test(t),
    user: (t.match(/User\s+(\S+)/) || [])[1] ?? null,
    environment: (t.match(/Environment\s+(\S+)/) || [])[1] ?? null,
  };
}

export async function kaneStatus() {
  if (authArgs().length) {
    const status = { installed: false, version: null, authenticated: false, user: process.env.LT_USERNAME, credits: null };
    try {
      status.version = parseVersion((await kaneText(['--version'])).out);
      status.installed = !!status.version;
      status.credits = parseBalance((await kaneText(['balance', ...authArgs()])).out);
      status.authenticated = status.credits != null;
    } catch {
      /* leave defaults */
    }
    return status;
  }
  const status = { installed: false, version: null, authenticated: false, user: null, credits: null };
  try {
    const v = await kaneText(['--version']);
    status.installed = v.code === 0;
    status.version = parseVersion(v.out);
  } catch {
    return status;
  }
  try {
    const w = parseWhoami((await kaneText(['whoami'])).out);
    status.authenticated = w.authenticated;
    status.user = w.user;
  } catch {
    /* leave defaults */
  }
  if (status.authenticated) {
    try {
      status.credits = parseBalance((await kaneText(['balance'])).out);
    } catch {
      /* leave null */
    }
  }
  return status;
}

export async function getBalance() {
  try {
    return parseBalance((await kaneText(['balance', ...authArgs()])).out);
  } catch {
    return null;
  }
}

/**
 * Build the `kane-cli testrun run` argument list. Kept pure so tests can pin it.
 * Heal stays on by default: a replay that misses re-authors the failing tail, which is
 * what produces Kane's written reason and fix sentence.
 */
export function testrunArgs({ files, url, headless = true, parallel = 1, heal = true, policy = null, name = null, author = false }) {
  const a = ['testrun', 'run', ...files, '--agent'];
  if (headless) a.push('--headless');
  if (parallel > 1) a.push('--parallel', String(parallel));
  if (!heal) a.push('--no-adaptive-heal');
  if (author) a.push('--author');
  if (policy) a.push('--policy', policy);
  if (url) a.push('--override-start-url', url);
  if (name) a.push('--name', name);
  return a;
}
