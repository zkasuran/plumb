import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, CONFIG_NAME } from './config.mjs';
import { loadRulePack } from './rules.mjs';
import { compileAll, readCompiledHash, testFileName } from './compile.mjs';
import { runCheck } from './check.mjs';
import { runLoop } from './loop.mjs';
import { runGate } from './gate.mjs';
import { latestRun, listRuns, loadRun } from './store.mjs';
import { kaneStatus } from './kane.mjs';
import { statusLine, failingRules } from './brief.mjs';
import { installHooks } from './hooks.mjs';
import { serveMcp } from './mcp.mjs';
import { c, renderReport, sym, pad } from './ui.mjs';
import { PlumbError, plural } from './util.mjs';

const PKG = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const HERE = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      pos.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = (eq > 0 ? a.slice(2, eq) : a.slice(2)).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      if (eq > 0) flags[key] = a.slice(eq + 1);
      else if (key.startsWith('no') && key.length > 2 && /[A-Z]/.test(key[2])) flags[key[2].toLowerCase() + key.slice(3)] = false;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else pos.push(a);
  }
  return { flags, pos };
}

const list = (v) => (v == null || v === true ? undefined : String(v).split(',').map((s) => s.trim()).filter(Boolean));

const HELP = `${c.bold('plumb')} ${PKG.version}  design rules held by a real browser, inside your agent's loop

${c.bold('Everyday')}
  plumb check [--rules PL-THEME,PL-NAV] [--fresh]   run the rules, write .plumb/brief.md
  plumb loop  [--agent claude|codex|kiro|opencode]  check, let an agent fix, check again
  plumb status                                      last verdict, free
  plumb brief                                       what the agent should fix, free

${c.bold('Setup')}
  plumb init --url http://localhost:3000 [--site-dir .] [--hooks kiro,claude]
  plumb rules [list|lint|show ID|new ID]            browse and write rules
  plumb compile [--check]                           rules -> Kane tests (done for you by check)
  plumb doctor                                      kane-cli, sign-in, credits, config

${c.bold('Integrations')}
  plumb gate                                        for hooks: exit 2 plus the brief when blocked
  plumb mcp                                         MCP server (plumb_check, plumb_brief, ...)
  plumb hook install kiro|claude|agents
  plumb studio [--port 4310] [--data DIR]           the Studio web app plus its API, one origin
  plumb serve [--port 4310]                         Studio API only (for npm run dev in studio/)
  plumb export --out DIR                            write Studio data (runs, loops, rules)

Exit codes: 0 gate passed, 1 gate blocked, 2 could not run.
`;

function out(text) {
  process.stdout.write(`${text}\n`);
}
function err(text) {
  process.stderr.write(`${text}\n`);
}

function progressPrinter({ quiet = false } = {}) {
  if (quiet) return () => {};
  return (e) => {
    switch (e.type) {
      case 'compiled':
        if (e.written) err(c.dim(`compiled ${plural(e.written, 'rule')} to Kane tests`));
        break;
      case 'fingerprint':
        err(c.dim(`site fingerprint ${e.hash ?? 'unavailable'} (${e.kind}, ${plural(e.files, 'file')})${e.error ? ` ${e.error}` : ''}`));
        break;
      case 'rule_start':
        err(c.dim(`  … ${e.id}`));
        break;
      case 'rule_end':
        err(`  ${e.source === 'cache' ? sym.cache : e.status === 'pass' ? sym.pass : e.status === 'skipped' ? sym.skip : sym.fail} ${e.id} ${c.dim(e.source === 'cache' ? 'cached, no credits' : e.source === 'skipped' ? 'skipped' : `${e.durationS ?? ''}s`)}`);
        break;
      case 'iteration_start':
        err(`\n${c.bold(`Iteration ${e.iteration}`)} ${c.dim(e.label)}`);
        break;
      case 'agent_start':
        err(`${c.cyan('agent')} ${e.agent} is fixing (attempt ${e.iteration})`);
        break;
      case 'rule_retry':
        err(c.yellow(`  ↻ ${e.id} hit a Kane startup race, running it again on its own`));
        break;
      case 'agent_limit':
        err(c.yellow(`${e.agent}${e.model ? ` (${e.model})` : ''} reports a usage limit, trying the next model`));
        break;
      case 'agent_wait':
        err(c.yellow(`all models are at their limit, waiting ${Math.round(e.seconds / 60)} min`));
        break;
      case 'agent_end':
        err(`${c.cyan('agent')} done in ${e.durationS}s, changed ${plural(e.filesChanged.length, 'file')}${e.tampered.length ? c.red(`, tried to change protected files (${e.tampered.join(', ')}), restored`) : ''}`);
        break;
      default:
    }
  };
}

function findRulesForLint(root, cfg) {
  return loadRulePack({ root, dirs: cfg.rules.dirs, exclude: cfg.rules.exclude, only: null });
}

async function cmdRules({ pos, flags, root, cfg }) {
  const sub = pos[0] ?? 'list';
  const pack = findRulesForLint(root, cfg);
  if (sub === 'list') {
    if (flags.json) return out(JSON.stringify(pack.rules, null, 2));
    for (const r of pack.rules) out(`${pad(c.bold(r.id), 18)} ${pad(r.severity === 'blocking' ? c.red('blocking') : c.yellow('advisory'), 18)} ${r.title} ${c.dim(`(${plural(r.steps.length, 'step')})`)}`);
    out(c.dim(`\n${plural(pack.rules.length, 'rule')}. Folders: ${cfg.rules.dirs.join(', ')}`));
    return 0;
  }
  if (sub === 'lint') {
    let bad = 0;
    for (const p of pack.problems) {
      if (p.level === 'error') bad++;
      out(`${p.level === 'error' ? sym.fail : sym.warn} ${p.file}${p.id ? ` (${p.id})` : ''}: ${p.message}`);
    }
    out(bad ? c.red(`${plural(bad, 'error')}`) : c.green(`${plural(pack.rules.length, 'rule')} OK`));
    return bad ? 1 : 0;
  }
  if (sub === 'show') {
    const r = pack.all.find((x) => x.id === (pos[1] ?? '').toUpperCase());
    if (!r) throw new PlumbError(`No rule ${pos[1]}`);
    out(`${c.bold(r.id)} ${r.title}  [${r.severity}]  ${c.dim(r.file)}\n\n${r.statement}\n\n${c.bold('Browser steps')}\n${r.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}\n\n${c.bold('Usual fix')}\n${r.fix}`);
    return 0;
  }
  if (sub === 'new') {
    const id = (pos[1] ?? '').toUpperCase();
    if (!/^[A-Z][A-Z0-9]{1,7}-[A-Z0-9-]+$/.test(id)) throw new PlumbError('Give an id like PL-BRAND or ACME-CTA');
    const dir = resolve(root, cfg.rules.dirs.find((d) => d !== '@house') ?? 'rules');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${id}.md`);
    if (existsSync(file)) throw new PlumbError(`${file} already exists`);
    writeFileSync(file, `---\nid: ${id}\ntitle: Say what must be true in one line\nseverity: blocking\napplies: [landing]\n---\n## Rule\nState the rule in one or two plain sentences.\n\n## Why\nWhy this matters to a visitor.\n\n## Check\n- Do something in the browser. Verify the visible outcome.\n\n## Fix\nWhat usually fixes it.\n`);
    out(`${sym.pass} wrote ${file}`);
    return 0;
  }
  throw new PlumbError(`Unknown rules command ${sub}`);
}

async function cmdCompile({ flags, root, cfg }) {
  const pack = findRulesForLint(root, cfg);
  const errors = pack.problems.filter((p) => p.level === 'error');
  if (errors.length) throw new PlumbError(errors.map((e) => `${e.file}: ${e.message}`).join('\n'), { code: 'RULES_INVALID' });
  if (flags.check) {
    const stale = pack.rules.filter((r) => readCompiledHash(join(root, cfg.tests.dir, testFileName(r.id))) !== r.sha);
    out(stale.length ? `${sym.fail} ${plural(stale.length, 'test')} out of date: ${stale.map((r) => r.id).join(', ')}` : `${sym.pass} all ${plural(pack.rules.length, 'test')} match their rules`);
    return stale.length ? 1 : 0;
  }
  const r = compileAll(pack.rules, { root, testsDir: cfg.tests.dir, url: null, maxSteps: cfg.kane.maxSteps });
  out(`${sym.pass} ${plural(r.written.length, 'test')} written, ${r.current.length} already current in ${cfg.tests.dir}`);
  if (r.orphans.length) out(c.yellow(`${plural(r.orphans.length, 'test')} have no rule any more: ${r.orphans.join(', ')}`));
  return 0;
}

async function cmdCheck({ flags, root, cfg }) {
  const { report } = await runCheck({
    root,
    cfg,
    flags: { rules: list(flags.rules), fresh: !!flags.fresh, url: typeof flags.url === 'string' ? flags.url : undefined, dryRun: !!flags.dryRun, heal: flags.heal === false ? false : undefined, parallel: flags.parallel ? Number(flags.parallel) : undefined, author: !!flags.author },
    onProgress: progressPrinter({ quiet: !!flags.json }),
  });
  if (flags.json) out(JSON.stringify(report, null, 2));
  else if (report.dryRun) {
    out(`\n${c.bold('Dry run')} on ${report.site.url}`);
    out(`  would reuse ${plural(report.plan.reuse.length, 'cached result')}: ${report.plan.reuse.join(', ') || 'none'}`);
    out(`  would run   ${plural(report.plan.run.length, 'rule')}: ${report.plan.run.join(', ') || 'none'} ${c.dim(`(about ${report.plan.estimateCredits} credits, ${report.credits.before ?? '?'} available)`)}`);
    if (report.plan.skipped.length) out(`  over budget ${report.plan.skipped.join(', ')}`);
    return 0;
  } else {
    out(`\n${renderReport(report)}`);
    if (!report.gate.passed) out(c.dim('\nFix brief: .plumb/brief.md'));
  }
  return report.gate.passed ? 0 : 1;
}

async function cmdLoop({ flags, root, cfg }) {
  const rec = await runLoop({
    root,
    cfg,
    flags: { agent: typeof flags.agent === 'string' ? flags.agent : undefined, maxIterations: flags.max ? Number(flags.max) : undefined, rules: list(flags.rules), url: typeof flags.url === 'string' ? flags.url : undefined },
    onProgress: progressPrinter({ quiet: !!flags.json }),
  });
  if (flags.json) out(JSON.stringify(rec, null, 2));
  else {
    out('');
    for (const it of rec.iterations) out(`  ${it.gate.passed ? sym.pass : sym.fail} iteration ${it.iteration}: ${it.totals.pass}/${it.totals.rules} pass${it.moved ? c.dim(`  fixed ${it.moved.fixed.length}, regressed ${it.moved.regressed.length}`) : ''}${it.agent ? c.dim(`  agent changed ${plural(it.agent.filesChanged.length, 'file')}`) : ''}`);
    out(`\n${rec.outcome === 'green' ? c.green('Green') : c.red(rec.outcome)} after ${plural(rec.iterations.length - 1, 'agent attempt')}, ${rec.creditsUsed} credits`);
  }
  return rec.outcome === 'green' ? 0 : 1;
}

async function readStdinJson() {
  if (process.stdin.isTTY) return null;
  return new Promise((resolveJson) => {
    let data = '';
    const t = setTimeout(() => resolveJson(null), 400);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => {
      clearTimeout(t);
      try {
        resolveJson(JSON.parse(data));
      } catch {
        resolveJson(null);
      }
    });
  });
}

async function cmdGate({ flags, root, cfg }) {
  const hookInput = await readStdinJson();
  const r = await runGate({ root, cfg, flags: { noRun: !!flags.noRun }, hookInput, onProgress: progressPrinter({ quiet: true }) });
  if (r.stdout) out(r.stdout);
  if (r.stderr) err(r.stderr);
  return r.exit;
}

async function cmdStatus({ flags, root }) {
  const report = latestRun(root);
  if (!report) {
    if (!flags.hook) out('No Plumb report yet. Run `plumb check`.');
    return 0;
  }
  if (flags.json) {
    out(JSON.stringify(report, null, 2));
    return report.gate.passed ? 0 : 1;
  }
  if (flags.hook) {
    out(statusLine(report));
    return 0;
  }
  out(renderReport(report));
  return report.gate.passed ? 0 : 1;
}

async function cmdDoctor({ root, cfg, exists }) {
  const k = await kaneStatus();
  const row = (ok, label, detail) => out(`${ok ? sym.pass : sym.fail} ${pad(label, 22)} ${c.dim(detail)}`);
  row(k.installed, 'kane-cli', k.installed ? `v${k.version}` : 'missing: npm install -g @testmuai/kane-cli');
  row(k.authenticated, 'signed in', k.authenticated ? k.user : 'run: kane-cli login --oauth');
  row(k.credits != null && k.credits > cfg.credits.floor, 'credits', k.credits != null ? `${k.credits} available, floor ${cfg.credits.floor}` : 'unknown');
  row(exists, CONFIG_NAME, exists ? root : 'missing: run plumb init');
  row(!!cfg.site.url, 'site.url', cfg.site.url ?? 'not set');
  const pack = findRulesForLint(root, cfg);
  const errs = pack.problems.filter((p) => p.level === 'error').length;
  row(errs === 0 && pack.rules.length > 0, 'rules', `${pack.rules.length} loaded, ${errs} errors`);
  return k.installed && k.authenticated && exists ? 0 : 1;
}

async function cmdInit({ flags, pos }) {
  const root = resolve(pos[0] ?? process.cwd());
  mkdirSync(root, { recursive: true });
  const file = join(root, CONFIG_NAME);
  if (!existsSync(file)) {
    const cfg = { site: { url: typeof flags.url === 'string' ? flags.url : 'http://localhost:3000', dir: typeof flags.siteDir === 'string' ? flags.siteDir : null }, rules: { dirs: ['@house', 'rules'] }, agent: { name: typeof flags.agent === 'string' ? flags.agent : 'claude' } };
    writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
    out(`${sym.pass} wrote ${CONFIG_NAME}`);
  } else out(`${sym.skip} ${CONFIG_NAME} already exists, left as is`);
  mkdirSync(join(root, 'rules'), { recursive: true });
  const readme = join(root, 'rules', 'README.md');
  if (!existsSync(readme)) writeFileSync(readme, '# Project rules\n\nAdd your own design rules here (`plumb rules new ACME-CTA`). A rule with the same id as a house rule replaces it.\n');
  mkdirSync(join(root, 'policy'), { recursive: true });
  const pol = join(root, 'policy', 'plumb-gate.yaml');
  if (!existsSync(pol)) copyFileSync(join(HERE, '..', 'policy', 'plumb-gate.yaml'), pol);
  const gi = join(root, '.gitignore');
  const cur = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const want = ['.plumb/', '.testmuai/evidence/', '.testmuai/variables/'].filter((l) => !cur.includes(l));
  if (want.length) writeFileSync(gi, `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${want.join('\n')}\n`);
  const targets = list(flags.hooks) ?? ['agents'];
  const written = installHooks(root, targets);
  for (const [t, files] of Object.entries(written)) for (const f of files) out(`${sym.pass} ${t}: ${f.replace(`${root}/`, '')}`);
  out(`\nNext: ${c.bold('plumb doctor')}, then ${c.bold('plumb check')}`);
  return 0;
}

export async function main(argv) {
  const { flags, pos } = parseArgs(argv);
  const cmd = pos.shift();
  if (flags.version || cmd === '--version' || cmd === 'version') return out(PKG.version), 0;
  if (!cmd || flags.help || cmd === 'help') return out(HELP), 0;
  try {
    if (cmd === 'init') return await cmdInit({ flags, pos });
    if (cmd === 'mcp') {
      await serveMcp({ cwd: process.cwd() });
      return 0;
    }
    const { root, cfg, exists } = loadConfig({ cwd: process.cwd() });
    const ctx = { flags, pos, root, cfg, exists };
    switch (cmd) {
      case 'rules':
        return await cmdRules(ctx);
      case 'compile':
        return await cmdCompile(ctx);
      case 'check':
        return await cmdCheck(ctx);
      case 'loop':
        return await cmdLoop(ctx);
      case 'gate':
        return await cmdGate(ctx);
      case 'status':
        return await cmdStatus(ctx);
      case 'brief': {
        const r = latestRun(root);
        out(r ? readFileSync(join(root, '.plumb', 'brief.md'), 'utf8') : 'No report yet.');
        return 0;
      }
      case 'doctor':
        return await cmdDoctor(ctx);
      case 'hook': {
        if (pos[0] !== 'install') throw new PlumbError('Use: plumb hook install kiro|claude|agents');
        const written = installHooks(root, pos.slice(1).length ? pos.slice(1) : ['agents']);
        for (const [t, files] of Object.entries(written)) for (const f of files) out(`${sym.pass} ${t}: ${f.replace(`${root}/`, '')}`);
        return 0;
      }
      case 'runs': {
        for (const r of listRuns(root).slice(0, 20)) out(`${r.id}  ${r.gate.passed ? sym.pass : sym.fail}  ${r.totals.pass}/${r.totals.rules}  ${r.credits?.used ?? '?'} credits  ${r.mode}`);
        return 0;
      }
      case 'report': {
        const r = pos[0] ? loadRun(root, pos[0]) : latestRun(root);
        if (!r) throw new PlumbError('No such run');
        out(flags.json ? JSON.stringify(r, null, 2) : renderReport(r));
        return r.gate.passed ? 0 : 1;
      }
      case 'serve': {
        const { serveStudioApi } = await import('./serve.mjs');
        await serveStudioApi({ root, cfg, port: flags.port ? Number(flags.port) : 4310 });
        return await new Promise(() => {});
      }
      case 'studio': {
        const { serveStudioApi, STUDIO_DIST } = await import('./serve.mjs');
        const dist = typeof flags.dist === 'string' ? resolve(flags.dist) : STUDIO_DIST;
        const data = typeof flags.data === 'string' ? resolve(flags.data) : null;
        const num = flags.port ? Number(flags.port) : 4310;
        await serveStudioApi({ root, cfg, port: num, staticDir: dist, dataDir: data });
        out(`${sym.pass} Studio at http://127.0.0.1:${num}  ${c.dim(data ? 'recorded data' : 'live data from .plumb')}`);
        return await new Promise(() => {});
      }
      case 'export': {
        const { exportStudioData } = await import('./export.mjs');
        const dest = resolve(typeof flags.out === 'string' ? flags.out : 'studio/public/data');
        const r = exportStudioData({ root, cfg, dest });
        out(`${sym.pass} exported ${plural(r.runs, 'run')}, ${plural(r.loops, 'loop')} and ${plural(r.rules, 'rule')} to ${dest}`);
        return 0;
      }
      default:
        err(`Unknown command "${cmd}"\n`);
        out(HELP);
        return 2;
    }
  } catch (e) {
    if (e instanceof PlumbError || e.code === 'KANE_MISSING') {
      err(`${c.red('plumb:')} ${e.message}${e.hint ? `\n${c.dim(`hint: ${e.hint}`)}` : ''}`);
      return e.exit ?? 2;
    }
    err(`${c.red('plumb crashed:')} ${e.stack || e.message}`);
    return 2;
  }
}
