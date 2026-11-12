import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.mjs';
import { loadRulePack } from './rules.mjs';
import { runCheck } from './check.mjs';
import { latestRun } from './store.mjs';
import { statusLine, failingRules } from './brief.mjs';

const TOOLS = [
  {
    name: 'plumb_check',
    description:
      'Run the design rules against the site in a real browser (Kane CLI) and return the verdict. Call this after you change UI code. It reuses results for rules whose inputs did not change, so repeat calls are cheap. If blocking rules fail, read the returned brief, fix the site source (never the rules), and call this again.',
    inputSchema: {
      type: 'object',
      properties: {
        rules: { type: 'array', items: { type: 'string' }, description: 'Optional rule ids to run, for example ["PL-THEME"]. Default: all.' },
        fresh: { type: 'boolean', description: 'Ignore the cache and re-run every selected rule. Costs credits.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'plumb_status',
    description: 'Return the newest Plumb verdict without running anything. Free.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'plumb_brief',
    description: 'Return the current fix brief: which rules fail, the step that failed, what the browser saw and the suggested change. Free.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'plumb_rules',
    description: 'List the design rules in force: id, title, severity and the browser steps each one runs. Free.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });

export function summaryText(report) {
  const lines = [statusLine(report)];
  for (const r of report.rules) lines.push(`${r.status === 'pass' ? 'PASS' : r.status.toUpperCase()}  ${r.id}  ${r.title}${r.source === 'cache' ? '  (cached)' : ''}`);
  if (report.credits.used != null) lines.push(`Credits used: ${report.credits.used}. Left: ${report.credits.after}.`);
  return lines.join('\n');
}

export async function callTool(name, args, { root, cfg }) {
  switch (name) {
    case 'plumb_check': {
      const { report, brief } = await runCheck({ root, cfg, flags: { rules: args?.rules, fresh: !!args?.fresh, mode: 'mcp' } });
      return text(report.gate.passed ? summaryText(report) : `${summaryText(report)}\n\n${brief}`);
    }
    case 'plumb_status': {
      const r = latestRun(root);
      return text(r ? summaryText(r) : 'No Plumb report yet. Call plumb_check.');
    }
    case 'plumb_brief': {
      const r = latestRun(root);
      if (!r) return text('No Plumb report yet. Call plumb_check.');
      try {
        return text(readFileSync(join(root, '.plumb', 'brief.md'), 'utf8'));
      } catch {
        return text(failingRules(r).length ? 'Brief file missing; call plumb_check again.' : 'Nothing to fix.');
      }
    }
    case 'plumb_rules': {
      const pack = loadRulePack({ root, dirs: cfg.rules.dirs, exclude: cfg.rules.exclude, only: cfg.rules.only });
      return text(pack.rules.map((r) => `${r.id} [${r.severity}] ${r.title}\n${r.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`).join('\n\n'));
    }
    default:
      return text(`Unknown tool ${name}`, true);
  }
}

/** A small MCP server over stdio: newline-delimited JSON-RPC 2.0. No SDK, no dependencies. */
export async function serveMcp({ cwd = process.cwd(), input = process.stdin, output = process.stdout } = {}) {
  const send = (msg) => output.write(`${JSON.stringify(msg)}\n`);
  let ctx = null;
  const getCtx = () => {
    ctx ??= (() => {
      const { root, cfg } = loadConfig({ cwd });
      return { root, cfg };
    })();
    return ctx;
  };
  let buf = '';
  const queue = [];
  let busy = false;
  const handle = async (msg) => {
    const { id, method, params } = msg;
    const reply = (result) => id !== undefined && send({ jsonrpc: '2.0', id, result });
    const fail = (code, message) => id !== undefined && send({ jsonrpc: '2.0', id, error: { code, message } });
    try {
      if (method === 'initialize') {
        return reply({ protocolVersion: params?.protocolVersion ?? '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'plumb', version: '0.1.0' } });
      }
      if (method === 'ping') return reply({});
      if (method === 'tools/list') return reply({ tools: TOOLS });
      if (method === 'tools/call') return reply(await callTool(params?.name, params?.arguments ?? {}, getCtx()));
      if (method?.startsWith('notifications/')) return;
      return fail(-32601, `Method not found: ${method}`);
    } catch (e) {
      if (method === 'tools/call') return reply(text(`${e.message}${e.hint ? `\nHint: ${e.hint}` : ''}`, true));
      return fail(-32603, e.message);
    }
  };
  const pump = async () => {
    if (busy) return;
    busy = true;
    while (queue.length) await handle(queue.shift());
    busy = false;
  };
  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        queue.push(JSON.parse(line));
      } catch {
        send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      }
    }
    pump();
  });
  await new Promise((resolve) => input.on('end', resolve));
  while (busy || queue.length) await new Promise((r) => setTimeout(r, 50));
}
