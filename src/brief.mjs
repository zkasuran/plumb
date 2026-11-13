import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { plural } from './util.mjs';

const SOURCE_EXT = /\.(html?|css|scss|jsx?|tsx?|vue|svelte|astro|mdx?)$/i;

/** Source files an agent is likely to edit, newest first, so the brief points somewhere. */
export function candidateFiles(siteDir, ignore = [], limit = 10, root = process.cwd()) {
  if (!siteDir) return [];
  const out = [];
  const skip = new Set(ignore);
  const walk = (d, depth) => {
    if (depth > 4) return;
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
      if (st.isDirectory()) walk(p, depth + 1);
      else if (SOURCE_EXT.test(name)) out.push({ path: relative(siteDir, p), mtime: st.mtimeMs });
    }
  };
  walk(siteDir, 0);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, limit).map((f) => join(relative(root, siteDir) || '.', f.path));
}

const order = (a, b) => (a.severity === b.severity ? a.id.localeCompare(b.id) : a.severity === 'blocking' ? -1 : 1);

export function failingRules(report) {
  return report.rules.filter((r) => r.status === 'fail' || r.status === 'broken').sort(order);
}

/** One line for hooks and chat: what is red and how to see more. */
export function statusLine(report) {
  const bad = failingRules(report);
  if (bad.length === 0) return `Plumb: all ${plural(report.totals.rules, 'rule')} pass on ${report.site.url}.`;
  const blocking = bad.filter((r) => r.severity === 'blocking');
  return `Plumb: ${plural(blocking.length, 'blocking rule')} failing (${blocking.map((r) => r.id).join(', ') || 'none'})${bad.length > blocking.length ? `, ${bad.length - blocking.length} advisory` : ''}. Read .plumb/brief.md.`;
}

/**
 * The brief is what the coding agent reads. It names the rule, the step that failed,
 * what the browser saw, and Kane's suggested change. It does not ask the agent to edit
 * the rules: the loop rejects a run where protected files changed.
 */
export function renderBrief(report, { protect = [], siteDir = null, ignore = [], root = process.cwd() } = {}) {
  const bad = failingRules(report);
  const lines = [];
  if (bad.length === 0) {
    lines.push(`# Plumb: all ${plural(report.totals.rules, 'rule')} pass`, '', `Checked ${report.site.url} in a real browser (Kane CLI). Nothing to fix.`);
    return lines.join('\n') + '\n';
  }
  lines.push(
    `# Plumb: ${bad.length === 1 ? '1 rule needs' : `${bad.length} rules need`} work on ${report.site.url}`,
    '',
    'Plumb opened the site in a real browser (Kane CLI) and ran your design rules. Change the **site source** so these rules pass.',
    '',
    `Do not edit ${protect.map((p) => `\`${p}\``).join(', ') || 'the rules'}. A run where those files changed is rejected. Plumb reruns the rules after you stop, so you do not need to run Kane yourself.`,
    ''
  );
  const files = candidateFiles(siteDir, ignore, 10, root);
  if (files.length) lines.push(`Source files most recently touched: ${files.map((f) => `\`${f}\``).join(', ')}`, '');
  for (const r of bad) {
    lines.push(`## ${r.id}: ${r.title}  (${r.severity})`, '', `**Rule.** ${r.statement.replace(/\s+/g, ' ')}`, '');
    const f = r.failure;
    if (f) {
      const where = f.step ? `Failed at step ${f.step} of ${r.steps.length}${f.stepText ? `: "${f.stepText.replace(/[.\s]+$/, '')}"` : ''}.` : (f.message ? `${f.message.replace(/[.\s]+$/, '')}.` : 'The run did not finish.');
      lines.push(`**What failed.** ${where}`);
      if (f.happened) lines.push(`**What the browser saw.** ${f.happened}`);
      else lines.push(`**Kane said.** ${f.message}`);
      if (f.suggestedFix) lines.push(`**Kane suggests.** ${f.suggestedFix}`);
      if (f.severity) lines.push(`**Severity.** ${f.severity}${typeof f.confidence === 'number' ? `, confidence ${f.confidence}` : ''}.`);
    }
    if (r.fix) lines.push('', '**Usual fix.**', '', r.fix);
    const shot = r.failure?.screenshot;
    if (shot) lines.push('', `Screenshot of the failing moment: \`.plumb/runs/${report.id}/shots/${shot}\``);
    if (r.console?.count) lines.push('', `Console findings (${r.console.count}): ${r.console.sample.map((c) => `\`${c.text}\``).join('; ')}`);
    lines.push('');
  }
  lines.push('---', `Run \`${report.id}\`. ${report.totals.pass} of ${report.totals.rules} rules pass.`);
  return lines.join('\n') + '\n';
}
