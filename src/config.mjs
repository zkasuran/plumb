import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PlumbError } from './util.mjs';

export const CONFIG_NAME = 'plumb.config.json';

export const DEFAULTS = Object.freeze({
  site: { url: null, dir: null, ignore: ['node_modules', '.git', '.plumb', '.testmuai', 'dist', 'coverage'] },
  rules: { dirs: ['@house', 'rules'], exclude: [], only: null },
  tests: { dir: 'tests/plumb' },
  kane: { parallel: 2, headless: true, heal: true, policy: 'policy/plumb-gate.yaml', maxSteps: 25 },
  credits: { floor: 60, perRuleEstimate: 50 },
  protect: ['rules/**', 'tests/**', 'policy/**', 'plumb.config.json'],
  agent: { name: 'claude', maxIterations: 4, timeoutS: 900, cmd: null, model: null, models: [], limitWaitS: 300, limitRetries: 8 },
});

function merge(base, extra) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(extra ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') out[k] = merge(base[k], v);
    else out[k] = v;
  }
  return out;
}

/** Walk up from `from` until a plumb.config.json is found. */
export function findRoot(from = process.cwd()) {
  let dir = resolve(from);
  for (;;) {
    if (existsSync(join(dir, CONFIG_NAME))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function validateConfig(cfg) {
  const problems = [];
  if (cfg.site.url) {
    try {
      const u = new URL(cfg.site.url);
      if (!/^https?:$/.test(u.protocol)) problems.push('site.url must be http or https');
    } catch {
      problems.push(`site.url is not a valid URL: ${cfg.site.url}`);
    }
  }
  if (!Number.isInteger(cfg.kane.parallel) || cfg.kane.parallel < 1 || cfg.kane.parallel > 8) problems.push('kane.parallel must be an integer from 1 to 8');
  if (typeof cfg.credits.floor !== 'number' || cfg.credits.floor < 0) problems.push('credits.floor must be a number >= 0');
  if (!Array.isArray(cfg.rules.dirs) || cfg.rules.dirs.length === 0) problems.push('rules.dirs must list at least one folder');
  if (!Array.isArray(cfg.protect)) problems.push('protect must be a list of globs');
  return problems;
}

/**
 * Load the project config. `root` defaults to the nearest folder holding plumb.config.json,
 * falling back to cwd so `plumb init` and `plumb rules` work in a bare folder.
 */
export function loadConfig({ cwd = process.cwd(), overrides = {} } = {}) {
  const root = findRoot(cwd) ?? resolve(cwd);
  const file = join(root, CONFIG_NAME);
  let user = {};
  if (existsSync(file)) {
    try {
      user = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      throw new PlumbError(`${CONFIG_NAME} is not valid JSON: ${e.message}`, { code: 'CONFIG_JSON' });
    }
  }
  const cfg = merge(merge(structuredClone(DEFAULTS), user), overrides);
  const problems = validateConfig(cfg);
  if (problems.length) throw new PlumbError(`${CONFIG_NAME}: ${problems.join('; ')}`, { code: 'CONFIG_INVALID' });
  return { root, file, exists: existsSync(file), cfg };
}
