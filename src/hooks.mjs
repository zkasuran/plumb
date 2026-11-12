import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { readJson, writeJson } from './util.mjs';

const BIN = fileURLToPath(new URL('../bin/plumb.mjs', import.meta.url));
const START = '<!-- plumb:start -->';
const END = '<!-- plumb:end -->';

/** `plumb` if it is on PATH, otherwise run this checkout with node. */
export function plumbCommand() {
  try {
    execFileSync('plumb', ['--version'], { stdio: 'ignore' });
    return { cmd: 'plumb', args: [] };
  } catch {
    return { cmd: process.execPath, args: [BIN] };
  }
}

const shellQuote = (s) => (/^[\w./:@=+-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const line = ({ cmd, args }, sub) => [cmd, ...args, ...sub].map(shellQuote).join(' ');

export const AGENT_SECTION = `${START}
## Design rules (Plumb)

This project's design rules are checked in a real browser by Plumb (Kane CLI).

- After you change UI code, call the \`plumb_check\` MCP tool, or run \`plumb check\`.
- If blocking rules fail, read \`.plumb/brief.md\`, fix the **site source**, and check again.
- Never edit \`rules/\`, \`tests/\`, \`policy/\` or \`plumb.config.json\` to make a rule pass. Plumb restores them and rejects the run.
- \`plumb status\` shows the last verdict for free. \`plumb rules\` lists every rule and the steps it runs.
${END}
`;

export function writeAgentSection(root) {
  const file = join(root, 'AGENTS.md');
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
  const next = re.test(cur) ? cur.replace(re, AGENT_SECTION) : `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${cur ? '\n' : ''}${AGENT_SECTION}`;
  if (next !== cur) writeFileSync(file, next);
  return file;
}

const SITE_FILES = '\\.(html?|css|scss|jsx?|tsx?|vue|svelte|astro)$';

export function installKiro(root, pc = plumbCommand()) {
  const written = [];
  const hooks = join(root, '.kiro', 'hooks', 'plumb.json');
  mkdirSync(dirname(hooks), { recursive: true });
  writeJson(hooks, {
    version: 'v1',
    hooks: [
      { name: 'Plumb: show design-rule status', trigger: 'UserPromptSubmit', action: { type: 'command', command: line(pc, ['status', '--hook']) } },
      { name: 'Plumb: check the site when the agent stops', trigger: 'Stop', action: { type: 'command', command: line(pc, ['gate']) } },
      { name: 'Plumb: remind the agent about the rules after a UI file changes', trigger: 'PostFileSave', matcher: SITE_FILES, action: { type: 'agent', prompt: 'You changed UI source. Before you finish, call the plumb_check tool and fix any blocking rule it reports. Never edit rules/, tests/ or policy/.' } },
    ],
  });
  written.push(hooks);

  const mcp = join(root, '.kiro', 'settings', 'mcp.json');
  const cur = readJson(mcp, { mcpServers: {} });
  cur.mcpServers ??= {};
  cur.mcpServers.plumb = { command: pc.cmd, args: [...pc.args, 'mcp'], timeout: 900000, autoApprove: ['plumb_status', 'plumb_brief', 'plumb_rules'] };
  writeJson(mcp, cur);
  written.push(mcp);

  const steer = join(root, '.kiro', 'steering', 'plumb.md');
  mkdirSync(dirname(steer), { recursive: true });
  writeFileSync(steer, `---\ninclusion: always\n---\n\n${AGENT_SECTION.replace(START, '').replace(END, '').trim()}\n`);
  written.push(steer);
  return written;
}

export function installClaude(root, pc = plumbCommand()) {
  const written = [];
  const settings = join(root, '.claude', 'settings.json');
  const cur = readJson(settings, {});
  cur.hooks ??= {};
  const upsert = (event, command, timeout) => {
    const group = (cur.hooks[event] ??= []);
    const existing = group.flatMap((g) => g.hooks ?? []).find((h) => /plumb/.test(h.command ?? '') && (h.command ?? '').includes(command.split(' ').slice(-1)[0]));
    if (existing) {
      existing.command = command;
      existing.timeout = timeout;
    } else group.push({ hooks: [{ type: 'command', command, timeout }] });
  };
  upsert('Stop', line(pc, ['gate']), 900);
  upsert('UserPromptSubmit', line(pc, ['status', '--hook']), 30);
  mkdirSync(dirname(settings), { recursive: true });
  writeJson(settings, cur);
  written.push(settings);

  const mcp = join(root, '.mcp.json');
  const m = readJson(mcp, { mcpServers: {} });
  m.mcpServers ??= {};
  m.mcpServers.plumb = { command: pc.cmd, args: [...pc.args, 'mcp'] };
  writeJson(mcp, m);
  written.push(mcp);
  return written;
}

export function installHooks(root, targets) {
  const out = {};
  const pc = plumbCommand();
  for (const t of targets) {
    if (t === 'kiro') out.kiro = installKiro(root, pc);
    else if (t === 'claude') out.claude = installClaude(root, pc);
    else if (t === 'agents') out.agents = [writeAgentSection(root)];
    else throw new Error(`unknown hook target "${t}". Use kiro, claude or agents.`);
  }
  if (!out.agents) out.agents = [writeAgentSection(root)];
  return out;
}
