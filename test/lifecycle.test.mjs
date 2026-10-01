import test from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/index.mjs';
import { ComputerClient } from '../src/client.mjs';

test('原生终止后关闭连接，同一轮不能借助 stop 或重建进程继续操作', async t => {
  const handlers = new Map(), registered = [], releases = [];
  let calls = 0;
  t.mock.method(ComputerClient.prototype, 'call', async () => { calls++; throw new Error('Computer Use has been stopped for this turn because it could not determine the current browser URL on Windows with enough confidence to enforce policy.'); });
  t.mock.method(ComputerClient.prototype, 'release', async owner => { releases.push(owner); });
  const ctx = { on: (name, callback) => handlers.set(name, callback), effect: () => {}, get: () => undefined,
    sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) }, tools: { register: tool => registered.push(tool) } };
  apply(ctx);
  const read = registered.find(tool => tool.name === 'codex_computer_read');
  const exec = { agent: { session: { id: 'a' } }, signal: new AbortController().signal };
  await assert.rejects(read.execute({ action: 'list_windows' }, exec), /stopped/);
  assert.deepEqual(releases, ['a']);
  await read.execute({ action: 'stop' }, exec);
  await assert.rejects(read.execute({ action: 'list_windows' }, exec), /stopped/);
  assert.equal(calls, 1);
  handlers.get('session/event')(exec.agent.session, { type: 'turn/end' });
  assert.equal(releases.length, 3);
  handlers.get('session/event')(exec.agent.session, { type: 'turn/start' });
  await assert.rejects(read.execute({ action: 'list_windows' }, exec), /stopped/);
  assert.equal(calls, 2);
});
