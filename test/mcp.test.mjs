import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveMcp } from '../src/mcp.mjs';
import { tmp } from './helpers.mjs';

function talk(cwd, messages) {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.setEncoding('utf8').on('data', (d) => lines.push(...d.split('\n').filter(Boolean).map((l) => JSON.parse(l))));
  const done = serveMcp({ cwd, input, output });
  for (const m of messages) input.write(`${JSON.stringify(m)}\n`);
  input.end();
  return done.then(() => lines);
}

test('MCP: initialize, list tools, and answer the free tools without Kane', async () => {
  const root = tmp();
  writeFileSync(join(root, 'plumb.config.json'), JSON.stringify({ site: { url: 'http://127.0.0.1:1/' } }));
  const out = await talk(root, [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'plumb_status', arguments: {} } },
    { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'plumb_rules', arguments: {} } },
    { jsonrpc: '2.0', id: 5, method: 'nope' },
  ]);
  const by = (id) => out.find((m) => m.id === id);
  assert.equal(by(1).result.protocolVersion, '2025-03-26');
  assert.equal(by(1).result.serverInfo.name, 'plumb');
  assert.deepEqual(by(2).result.tools.map((t) => t.name), ['plumb_check', 'plumb_status', 'plumb_brief', 'plumb_rules']);
  assert.match(by(3).result.content[0].text, /No Plumb report yet/);
  assert.match(by(4).result.content[0].text, /PL-THEME \[blocking\]/);
  assert.equal(by(5).error.code, -32601);
  assert.equal(out.filter((m) => m.id === undefined).length, 0);
});

test('MCP: a failing check is returned as a tool error the agent can read, not a crash', async () => {
  const root = tmp();
  writeFileSync(join(root, 'plumb.config.json'), JSON.stringify({ site: { url: null } }));
  const out = await talk(root, [{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'plumb_check', arguments: {} } }]);
  assert.equal(out[0].result.isError, true);
  assert.match(out[0].result.content[0].text, /No site to check/);
});
