import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { main } from '../src/cli.mjs';
import { tmp } from './helpers.mjs';

async function quiet(fn) {
  const w = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await fn();
  } finally {
    process.stdout.write = w;
  }
}
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('init writes config, policy, hooks and MCP entries, and is safe to run twice', async () => {
  const dir = tmp();
  assert.equal(await quiet(() => main(['init', dir, '--url', 'http://localhost:3000', '--site-dir', 'site', '--hooks', 'kiro,claude'])), 0);
  const cfg = json(join(dir, 'plumb.config.json'));
  assert.equal(cfg.site.url, 'http://localhost:3000');
  assert.equal(cfg.site.dir, 'site');
  assert.ok(existsSync(join(dir, 'policy', 'plumb-gate.yaml')));

  const kiro = json(join(dir, '.kiro', 'hooks', 'plumb.json'));
  assert.equal(kiro.version, 'v1');
  assert.deepEqual(kiro.hooks.map((h) => h.trigger), ['UserPromptSubmit', 'Stop', 'PostFileSave']);
  assert.ok(kiro.hooks[1].action.command.includes('gate'));
  assert.equal(kiro.hooks[2].action.type, 'agent');
  assert.ok(json(join(dir, '.kiro', 'settings', 'mcp.json')).mcpServers.plumb.args.includes('mcp'));
  assert.match(readFileSync(join(dir, '.kiro', 'steering', 'plumb.md'), 'utf8'), /inclusion: always[\s\S]*plumb_check/);

  const claude = json(join(dir, '.claude', 'settings.json'));
  assert.ok(claude.hooks.Stop[0].hooks[0].command.includes('gate'));
  assert.equal(claude.hooks.Stop[0].hooks[0].timeout, 900);
  assert.ok(json(join(dir, '.mcp.json')).mcpServers.plumb);

  await quiet(() => main(['init', dir, '--hooks', 'kiro,claude']));
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  assert.equal(agents.split('<!-- plumb:start -->').length - 1, 1);
  assert.equal(json(join(dir, '.claude', 'settings.json')).hooks.Stop.length, 1);
  assert.equal(json(join(dir, 'plumb.config.json')).site.url, 'http://localhost:3000');
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8').split('.plumb/').length - 1, 1);
});

test('unknown commands and missing config give a clear exit code, not a stack trace', async () => {
  const dir = tmp();
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const err = process.stderr.write.bind(process.stderr);
    let text = '';
    process.stderr.write = (t) => ((text += t), true);
    const code = await quiet(() => main(['check']));
    process.stderr.write = err;
    assert.equal(code, 2);
    assert.match(text, /No site to check/);
  } finally {
    process.chdir(cwd);
  }
});
