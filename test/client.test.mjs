import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerClient } from '../src/client.mjs';
const client = () => new ComputerClient({ timeoutMs: 1000 }, { workerUrl: new URL('./worker-fixture.mjs', import.meta.url) });

test('同时发起的请求按顺序执行，卸载后不再启动进程', async () => {
  const c = client();
  try { assert.deepEqual(await Promise.all([c.call('a'), c.call('b')]), [{ sequence: 1 }, { sequence: 2 }]); }
  finally { await c.dispose(); }
  assert.equal(c.child, null); await assert.rejects(c.call('c'), /卸载/);
});
test('取消后等待工作进程退出，不在后台继续操作', async () => {
  const c = client(), cancellation = new AbortController();
  try {
    await c.call('ready'); const child = c.child;
    const operation = c.call('hang', {}, 'a', cancellation.signal);
    setTimeout(() => cancellation.abort(), 40);
    await assert.rejects(operation, /取消/);
    assert(child.exitCode !== null || child.signalCode !== null); assert.equal(c.child, null);
  } finally { await c.dispose(); }
});
test('原生应用授权转发给调用者，拒绝不被改成同意', async () => {
  const c = client(); let count = 0;
  try {
    assert.deepEqual(await c.call('approval', {}, 'a', undefined, async request => { count++; assert.equal(request.app, 'test.exe'); return false; }), { accepted: false });
    assert.equal(count, 1);
    assert.deepEqual(await c.call('approval'), { accepted: false });
  } finally { await c.dispose(); }
});
