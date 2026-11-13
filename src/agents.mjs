import { spawn } from 'node:child_process';

export const AGENT_NAMES = ['claude', 'codex', 'kiro', 'opencode', 'cmd'];

/**
 * How to run each coding agent headless with one prompt. The agent edits files in `cwd`.
 * Permissions are limited to reading and editing files where the CLI allows it.
 */
export function agentCommand(name, { prompt, cwd, cmd = null, model = process.env.PLUMB_AGENT_MODEL || null }) {
  const m = (flag) => (model ? [flag, model] : []);
  switch (name) {
    case 'claude':
      return { bin: 'claude', args: ['-p', prompt, ...m('--model'), '--permission-mode', 'acceptEdits', '--allowedTools', 'Read,Edit,Write,Glob,Grep'] };
    case 'codex':
      return { bin: 'codex', args: ['exec', ...m('-m'), '-s', 'workspace-write', '-C', cwd, prompt] };
    case 'kiro':
      return { bin: 'kiro-cli', args: ['chat', '--no-interactive', ...m('--model'), '--trust-tools=fs_read,fs_write', prompt] };
    case 'opencode':
      return { bin: 'opencode', args: ['run', ...m('-m'), prompt] };
    case 'cmd': {
      if (!cmd) throw new Error('agent "cmd" needs agent.cmd in plumb.config.json, for example "my-agent --prompt-file $PLUMB_BRIEF"');
      return { bin: '/bin/sh', args: ['-c', cmd] };
    }
    default:
      throw new Error(`unknown agent "${name}". Use one of: ${AGENT_NAMES.join(', ')}`);
  }
}

export function buildPrompt({ report, briefPath, siteDir, protect, previous = null }) {
  const failing = report.rules.filter((r) => r.status === 'fail' || r.status === 'broken');
  const lines = [
    `Plumb checked ${report.site.url} in a real browser and ${failing.length} design rule${failing.length === 1 ? '' : 's'} failed: ${failing.map((r) => r.id).join(', ')}.`,
    `Read ${briefPath} and change the site source${siteDir ? ` under ${siteDir}` : ''} so those rules pass.`,
    '',
    'Constraints:',
    `- Edit site source only. Never edit ${protect.join(', ')} or the .plumb folder. Plumb rejects a run where those changed and restores them.`,
    '- Do not run kane-cli. Plumb reruns the rules after you finish.',
    '- Keep each change small and in the existing code style. Do not delete content to dodge a rule.',
    '- When you finish, reply with one line per rule saying what you changed.',
  ];
  if (previous?.tampered?.length) lines.push('', `Your previous attempt changed protected files (${previous.tampered.join(', ')}). They were restored. Fix the site instead.`);
  if (previous?.stillFailing?.length) lines.push('', `Still failing after your last attempt: ${previous.stillFailing.join(', ')}.`);
  return lines.join('\n');
}

/** Run an agent to completion. Output is captured for the loop record, never trusted as data. */
export function runAgent(name, { prompt, cwd, cmd = null, model = null, timeoutS = 900, env = {}, onOutput }) {
  const { bin, args } = agentCommand(name, { prompt, cwd, cmd, ...(model ? { model } : {}) });
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(bin, args, { cwd, env: { ...process.env, PLUMB_PROMPT: prompt, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutS * 1000);
    const take = (d) => {
      out += d;
      if (out.length > 200_000) out = out.slice(-200_000);
      onOutput?.(String(d));
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ exit: 127, durationS: 0, output: e.code === 'ENOENT' ? `${bin} is not installed` : e.message, timedOut: false, missing: e.code === 'ENOENT' });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ exit: code ?? 1, durationS: Math.round((Date.now() - t0) / 100) / 10, output: out.trim().slice(-4000), timedOut, missing: false });
    });
  });
}
