import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { sha256 } from './util.mjs';

export const HOUSE_DIR = fileURLToPath(new URL('../rules/house', import.meta.url));
export const SEVERITIES = ['blocking', 'advisory'];
const ID_RE = /^[A-Z][A-Z0-9]{1,7}-[A-Z0-9][A-Z0-9-]{0,30}$/;
const SECTION_NAMES = ['rule', 'why', 'check', 'fix'];
const ASSERT_RE = /\b(verify|assert|confirm|check that|ensure)\b/i;

/** Split `---\nyaml\n---\nbody` into its two parts. */
export function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text, error: 'missing frontmatter (--- fences)' };
  try {
    const data = YAML.parse(m[1]) ?? {};
    return { data, body: m[2], error: null };
  } catch (e) {
    return { data: null, body: m[2], error: `frontmatter is not valid YAML: ${e.message.split('\n')[0]}` };
  }
}

/** Collect `## Name` sections of a markdown body. Keys are lower-cased. */
export function splitSections(body) {
  const sections = {};
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) {
      current = h[1].toLowerCase();
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  return Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()]));
}

/**
 * A Check section is a list. Each top-level bullet is one browser step. Indented lines
 * continue the bullet they follow.
 */
export function parseCheckSteps(text) {
  const steps = [];
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const bullet = raw.match(/^\s{0,1}(?:[-*]|\d+[.)])\s+(.*)$/);
    if (bullet) steps.push(bullet[1].trim());
    else if (steps.length && raw.trim()) steps[steps.length - 1] += ` ${raw.trim()}`;
  }
  return steps;
}

export function parseRule(text, file = '<memory>') {
  const problems = [];
  const { data, body, error } = splitFrontmatter(text);
  if (error) problems.push({ level: 'error', code: 'RULE_FRONTMATTER', message: error });
  const fm = data ?? {};
  const sections = splitSections(body);
  const steps = parseCheckSteps(sections.check);

  const rule = {
    id: String(fm.id ?? '').trim(),
    title: String(fm.title ?? '').trim(),
    severity: String(fm.severity ?? 'blocking').trim(),
    applies: Array.isArray(fm.applies) ? fm.applies.map(String) : fm.applies ? [String(fm.applies)] : [],
    watch: Array.isArray(fm.watch) ? fm.watch.map(String) : [],
    maxSteps: Number.isInteger(fm.max_steps) ? fm.max_steps : null,
    evidence: Array.isArray(fm.evidence) ? fm.evidence.map(String) : fm.evidence ? [String(fm.evidence)] : [],
    statement: sections.rule ?? '',
    why: sections.why ?? '',
    fix: sections.fix ?? '',
    steps,
    file,
    sha: sha256(text).slice(0, 12),
  };

  if (!ID_RE.test(rule.id)) problems.push({ level: 'error', code: 'RULE_ID', message: `id "${rule.id}" must look like PL-THEME (2 to 8 capitals, a dash, then capitals, digits or dashes)` });
  if (rule.title.length < 8 || rule.title.length > 90) problems.push({ level: 'error', code: 'RULE_TITLE', message: 'title must be 8 to 90 characters' });
  for (const e of rule.evidence) if (!['console'].includes(e)) problems.push({ level: 'error', code: 'RULE_EVIDENCE', message: `unknown evidence check "${e}" (supported: console)` });
  if (!SEVERITIES.includes(rule.severity)) problems.push({ level: 'error', code: 'RULE_SEVERITY', message: `severity must be one of ${SEVERITIES.join(', ')}` });
  if (!rule.statement) problems.push({ level: 'error', code: 'RULE_STATEMENT', message: 'missing "## Rule" section' });
  if (steps.length === 0) problems.push({ level: 'error', code: 'RULE_NO_STEPS', message: 'the "## Check" section needs at least one bullet' });
  if (steps.length > 8) problems.push({ level: 'error', code: 'RULE_TOO_LONG', message: 'more than 8 steps; Kane runs are most reliable under about 15 actions. Split the rule' });
  if (steps.length && !ASSERT_RE.test(steps[steps.length - 1])) problems.push({ level: 'error', code: 'RULE_NO_ASSERT', message: 'the last step must end in a check ("Verify ...") or the rule has no pass or fail' });
  const unasserted = steps.map((s, i) => [s, i]).filter(([s]) => !ASSERT_RE.test(s));
  if (steps.length > 1 && unasserted.length === steps.length) problems.push({ level: 'error', code: 'RULE_NO_ASSERT_ANY', message: 'no step verifies anything' });
  if (/\{\{|\}\}/.test(sections.check ?? '')) problems.push({ level: 'error', code: 'RULE_VARIABLES', message: 'use plain words in checks; Kane treats {{name}} as a variable' });
  if (!rule.fix) problems.push({ level: 'warning', code: 'RULE_NO_FIX', message: 'no "## Fix" section; the agent brief will have no hint for this rule' });
  if (!rule.why) problems.push({ level: 'warning', code: 'RULE_NO_WHY', message: 'no "## Why" section' });
  for (const k of Object.keys(sections)) if (!SECTION_NAMES.includes(k)) problems.push({ level: 'warning', code: 'RULE_SECTION', message: `unknown section "## ${k}" is ignored` });
  return { rule, problems };
}

function listMarkdown(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries.sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listMarkdown(p));
    else if (name.endsWith('.md') && !name.toLowerCase().startsWith('readme')) out.push(p);
  }
  return out;
}

/**
 * Load every rule under the configured folders. Duplicate ids are an error because the
 * id names the compiled test and the report row.
 */
export function loadRulePack({ root, dirs, exclude = [], only = null }) {
  const rules = [];
  const problems = [];
  const seen = new Map(); // id -> { dirIndex, file, at }
  dirs.forEach((d, dirIndex) => {
    const abs = d === '@house' ? HOUSE_DIR : resolve(root, d);
    for (const file of listMarkdown(abs)) {
      const rel = d === '@house' ? `@house/${relative(abs, file)}` : relative(root, file);
      const { rule, problems: p } = parseRule(readFileSync(file, 'utf8'), rel);
      for (const x of p) problems.push({ ...x, file: rel, id: rule.id || null });
      if (!rule.id) continue;
      const prev = seen.get(rule.id);
      if (prev && prev.dirIndex === dirIndex) {
        problems.push({ level: 'error', code: 'RULE_DUPLICATE', file: rel, id: rule.id, message: `id ${rule.id} is also defined in ${prev.file}` });
        continue;
      }
      if (prev) rules[prev.at] = rule; // a later folder overrides an earlier one: that is how a project tunes a house rule
      else rules.push(rule);
      seen.set(rule.id, { dirIndex, file: rel, at: prev ? prev.at : rules.length - 1 });
    }
  });
  let picked = rules.filter((r) => !exclude.includes(r.id));
  if (only && only.length) picked = picked.filter((r) => only.includes(r.id));
  return { rules: picked, all: rules, problems };
}
