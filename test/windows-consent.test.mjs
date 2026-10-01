import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { requestWindowsConsent } from '../src/windows-consent.mjs';

function fixture() {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit('close', 1)); };
  const signal = new AbortController();
  const result = requestWindowsConsent({ question: '测试：允许吗？', detail: '文本 $(not code)', allow: '允许', deny: '拒绝' }, signal.signal, {
    spawnProcess: (_exe, args) => { assert(args.includes('-WindowStyle')); assert(!args.some(x => x.includes('$(not code)'))); return child; },
  });
  const send = message => child.stdout.write(JSON.stringify(message) + '\n');
  return { child, signal, result, send };
}
test('独立窗口只接受单一明确布尔结果，关闭而未回答表示拒绝', async () => {
  for (const accepted of [true, false, undefined]) {
    const f = fixture(); f.send({ type: 'ready' });
    if (accepted !== undefined) f.send({ type: 'result', accepted });
    f.child.emit('close', 0); assert.equal(await f.result, accepted === true);
  }
});
test('独立窗口的重复或无效结果不能授权', async () => {
  for (const messages of [
    [{ type: 'result', accepted: 'true' }],
    [{ type: 'result', accepted: false }, { type: 'result', accepted: true }],
    [{ type: 'unknown' }],
  ]) {
    const f = fixture(); for (const message of messages) f.send(message);
    await assert.rejects(f.result, /无效/);
  }
});
test('取消或授权进程崩溃后，不接受迟到的允许结果', async () => {
  const f = fixture(); f.signal.abort(); f.send({ type: 'result', accepted: true });
  await assert.rejects(f.result, /abort/i);
  const g = fixture(); g.send({ type: 'result', accepted: true }); g.child.emit('close', 1);
  await assert.rejects(g.result, /未完成/);
});
