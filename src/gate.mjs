import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { latestRun, readState, writeState } from './store.mjs';
import { runCheck } from './check.mjs';
import { fingerprintSite } from './fingerprint.mjs';
import { loadRulePack } from './rules.mjs';
import { statusLine, failingRules } from './brief.mjs';

/** Is the newest report still about this site and these rules? */
export async function reportIsCurrent({ root, cfg, report }) {
  if (!report) return false;
  const url = cfg.site.url;
  if (report.site.url !== url) return false;
  const fp = await fingerprintSite({ url, dir: cfg.site.dir ? resolve(root, cfg.site.dir) : null, ignore: cfg.site.ignore });
  if (!fp.hash || fp.hash !== report.site.fingerprint) return false;
  const pack = loadRulePack({ root, dirs: cfg.rules.dirs, exclude: cfg.rules.exclude, only: cfg.rules.only });
  const shas = new Map(report.rules.map((r) => [r.id, r.sha]));
  return pack.rules.length === shas.size && pack.rules.every((r) => shas.get(r.id) === r.sha);
}

function briefText(root) {
  try {
    return readFileSync(join(root, '.plumb', 'brief.md'), 'utf8');
  } catch {
    return '';
  }
}

/**
 * The command a hook calls. Exit 0 means go on. Exit 2 means stop and read stderr, which is
 * the convention coding-agent hooks use to hand text back to the agent.
 *
 * - the newest report matches the current site and rules: answer from it, spend nothing
 * - otherwise run the check, which itself reuses every rule whose inputs did not change
 * - after `agent.maxIterations` red answers in a row the gate lets go, so a hook can never loop forever
 */
export async function runGate({ root, cfg, flags = {}, hookInput = null, onProgress }) {
  const last = latestRun(root);
  let report = last;
  let ran = false;
  const current = await reportIsCurrent({ root, cfg, report: last });
  if (!current && !flags.noRun) {
    ({ report } = await runCheck({ root, cfg, flags: { mode: 'gate' }, onProgress }));
    ran = true;
  }
  const state = readState(root);
  state.gate ??= { attempts: 0 };
  if (!report) return { exit: 0, stdout: 'Plumb: no report yet. Run `plumb check` once.', stderr: '', ran, report: null };
  if (report.gate.passed) {
    state.gate = { attempts: 0 };
    writeState(root, state);
    return { exit: 0, stdout: statusLine(report), stderr: '', ran, report };
  }
  if (flags.noRun) return { exit: 2, stdout: '', stderr: `${statusLine(report)}${current ? '' : ' (site changed since this report)'}\n\n${briefText(root)}`, ran, report };
  state.gate.attempts = (state.gate.attempts ?? 0) + (hookInput?.stop_hook_active || ran ? 1 : 0);
  writeState(root, state);
  if (state.gate.attempts > cfg.agent.maxIterations) {
    state.gate = { attempts: 0 };
    writeState(root, state);
    const ids = failingRules(report).map((r) => r.id).join(', ');
    return { exit: 0, stdout: `Plumb gave up after ${cfg.agent.maxIterations} attempts. Still failing: ${ids}. A person needs to look.`, stderr: '', ran, report };
  }
  return { exit: 2, stdout: '', stderr: `${statusLine(report)}\n\n${briefText(root)}`, ran, report };
}
