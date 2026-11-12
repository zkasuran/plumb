import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import YAML from 'yaml';

/**
 * Minimal reader for Kane's `.evidence` packs. They are plain zip files (stored or
 * deflated, no zip64), so a central-directory walk is enough and needs no dependency.
 */
export function openZip(path) {
  const buf = readFileSync(path);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`${path} is not a zip file`);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip directory');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const elen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { method, csize, usize, local });
    p += 46 + nlen + elen + clen;
  }
  const read = (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lnlen = buf.readUInt16LE(e.local + 26);
    const lelen = buf.readUInt16LE(e.local + 28);
    const start = e.local + 30 + lnlen + lelen;
    const raw = buf.subarray(start, start + e.csize);
    if (e.method === 0) return Buffer.from(raw);
    if (e.method === 8) return inflateRawSync(raw);
    throw new Error(`unsupported zip method ${e.method} for ${name}`);
  };
  return { names: [...entries.keys()], read, text: (n) => read(n)?.toString('utf8') ?? null };
}

const yamlOf = (text) => {
  try {
    return text ? YAML.parse(text) : null;
  } catch {
    return null;
  }
};

const ndjsonOf = (text) =>
  (text ?? '')
    .split(/\r?\n/)
    .filter((l) => l.trim().startsWith('{'))
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

/** Messages that are page-load noise rather than a design defect. */
export const DEFAULT_CONSOLE_IGNORE = [/favicon\.ico/i];

export function classifyConsole(entry) {
  const text = String(entry.text ?? '');
  if (/content security policy|refused to (load|apply|execute|connect)/i.test(text)) return 'csp';
  if (/failed to load resource|net::err|404|500/i.test(text)) return 'network';
  if (entry.level === 'error') return 'error';
  return 'other';
}

/**
 * Read one pack into plain data: per test the written result, each step with its
 * screenshot name, Kane's failure triage (root cause, severity, suggested fix) and the
 * console findings. Nothing here calls the network or costs credits.
 */
export function readPack(path) {
  const zip = openZip(path);
  const run = yamlOf(zip.text('run.yaml')) ?? {};
  const failureIndex = yamlOf(zip.text('failure.yaml')) ?? {};
  const testDirs = [...new Set(zip.names.map((n) => n.match(/^tests\/([^/]+)\//)?.[1]).filter(Boolean))];
  const tests = testDirs.map((dir) => {
    const result = yamlOf(zip.text(`tests/${dir}/result.yaml`)) ?? {};
    const steps = (result.steps ?? []).map((s) => {
      const folder = zip.names.map((n) => n.match(new RegExp(`^tests/${dir}/steps/(\\d+-${s.id})/`))?.[1]).find(Boolean);
      const meta = folder ? JSON.parse(zip.text(`tests/${dir}/steps/${folder}/step.json`) ?? '{}') : {};
      const shot = folder && zip.names.includes(`tests/${dir}/steps/${folder}/screenshot.jpg`) ? `tests/${dir}/steps/${folder}/screenshot.jpg` : null;
      return { id: s.id, ordinal: s.ordinal, status: s.status, kind: s.kind ?? meta.kind ?? null, durationMs: s.duration_ms ?? null, summary: meta.summary ?? null, url: meta.url ?? null, screenshot: shot };
    });
    const failures = zip.names
      .filter((n) => n.startsWith(`tests/${dir}/steps/`) && n.endsWith('/failure.yaml'))
      .map((n) => ({ file: n, ...yamlOf(zip.text(n)) }))
      .map((f) => ({
        step: f.step,
        message: f.error?.message ?? null,
        title: f.title ?? null,
        rootCause: f.triage?.rca?.root_cause ?? null,
        category: f.triage?.rca?.category ?? null,
        confidence: f.triage?.rca?.confidence ?? null,
        severity: f.triage?.severity ?? null,
        suggestedFix: f.triage?.suggested_fix?.summary ?? null,
        screenshot: f.page_state?.screenshot ? `tests/${dir}/${f.page_state.screenshot}` : null,
        pageUrl: f.page_state?.url ?? null,
      }));
    const consoleFiles = zip.names.filter((n) => n.startsWith(`tests/${dir}/logs/`) && n.endsWith('-console.ndjson'));
    const consoleEntries = consoleFiles.flatMap((n) => ndjsonOf(zip.text(n))).filter((e) => e.level);
    return {
      dir,
      status: result.status ?? null,
      durationMs: result.duration_ms ?? null,
      sessionName: result.external_id?.session_name ?? null,
      sessionId: result.external_id?.session_id ?? null,
      shareLink: result.external_id?.sharable_link ?? null,
      runKind: result.environment?.run_kind ?? null,
      tags: result.tags ?? [],
      steps,
      failures,
      console: consoleEntries.map((e) => ({ level: e.level, text: e.text, url: e.url ?? null, kind: classifyConsole(e) })),
    };
  });
  return { zip, run, failureIndex, tests };
}

/**
 * Console findings that count against a page: errors and CSP refusals, minus ignorable
 * noise. Rules can opt in with `Verify` text, but this check needs no model and no credits.
 */
export function consoleFindings(test, ignore = DEFAULT_CONSOLE_IGNORE) {
  return test.console.filter((e) => ['error', 'csp', 'network'].includes(e.kind) && !ignore.some((re) => re.test(`${e.text} ${e.url ?? ''}`)));
}

/** Copy a pack's screenshots next to the report so the Studio can show them without Kane. */
export function extractScreenshots(pack, test, outDir, prefix) {
  mkdirSync(outDir, { recursive: true });
  const written = {};
  for (const s of test.steps) {
    if (!s.screenshot) continue;
    const buf = pack.zip.read(s.screenshot);
    if (!buf) continue;
    const name = `${prefix}-step${String(s.ordinal).padStart(2, '0')}.jpg`;
    writeFileSync(join(outDir, name), buf);
    written[s.screenshot] = name;
  }
  for (const f of test.failures) {
    if (!f.screenshot || written[f.screenshot]) continue;
    const buf = pack.zip.read(f.screenshot);
    if (!buf) continue;
    const name = `${prefix}-failure.jpg`;
    writeFileSync(join(outDir, name), buf);
    written[f.screenshot] = name;
  }
  return written;
}

export const packExists = (p) => !!p && existsSync(p);
