const useColor = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const wrap = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};

export const sym = { pass: c.green('✓'), fail: c.red('✗'), skip: c.gray('·'), warn: c.yellow('!'), cache: c.cyan('↺') };

export function statusMark(r) {
  if (r.source === 'cache') return sym.cache;
  if (r.status === 'pass') return sym.pass;
  if (r.status === 'skipped') return sym.skip;
  return r.severity === 'advisory' ? sym.warn : sym.fail;
}

export function pad(s, n) {
  const plain = String(s).replace(/\x1b\[[0-9;]*m/g, '');
  return plain.length >= n ? s : s + ' '.repeat(n - plain.length);
}

export function renderReport(report) {
  const lines = [];
  lines.push(`${c.bold('Plumb')} ${c.dim(report.id)}  ${report.site.url}`);
  for (const r of report.rules) {
    const tag = r.source === 'cache' ? c.cyan('cached') : r.status === 'skipped' ? c.gray('skipped') : r.kind === 'replay' ? c.gray('replay') : r.kind === 'author' ? c.gray('authored') : r.kind === 'healed' ? c.yellow('healed') : '';
    const time = r.durationS ? c.gray(`${r.durationS}s`) : '';
    lines.push(`  ${statusMark(r)} ${pad(c.bold(r.id), 16)} ${pad(r.title.length > 58 ? `${r.title.slice(0, 57)}…` : r.title, 59)} ${pad(tag, 9)} ${time}`);
    if (r.status === 'fail' || r.status === 'broken') {
      const f = r.failure;
      if (f) {
        lines.push(`      ${c.dim(f.step ? `step ${f.step}:` : 'result:')} ${f.happened || f.message}`);
        if (f.suggestedFix) lines.push(`      ${c.dim('fix:')} ${f.suggestedFix}`);
      }
    }
  }
  const t = report.totals;
  const cr = report.credits.used != null ? `${report.credits.used} credits used, ${report.credits.after} left` : 'credits unknown';
  lines.push('');
  lines.push(`${report.gate.passed ? c.green('Gate passed') : c.red(`Gate blocked by ${report.gate.blocking.join(', ')}`)}  ${c.dim(`${t.pass}/${t.rules} pass, ${t.cached} cached, ${cr}, ${report.durationS}s`)}`);
  return lines.join('\n');
}
