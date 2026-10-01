import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppApprover, installAppApprovalHook } from '../src/approval.mjs';

const exec = id => ({ agent: { session: { id } }, signal: new AbortController().signal, callId: 'call', name: 'codex_computer_read' });
test('应用许可只在人工批准后缓存，且按会话和应用隔离', async () => {
  let requests = 0, outcome = 'rejected';
  const approve = createAppApprover({ get: () => ({ request: async input => { assert(input.reason.includes('本次 DSH 会话')); requests++; return outcome; } }) });
  const app = { app: 'test.exe', displayName: 'Test' };
  assert.equal(await approve(exec('a'), app), false);
  outcome = 'allowed-once'; assert.equal(await approve(exec('a'), app), true);
  assert.equal(await approve(exec('a'), app), true); assert.equal(requests, 2);
  assert.equal(await approve(exec('b'), app), true); assert.equal(requests, 3);
  assert.equal(await approve(exec('a'), { ...app, app: 'other.exe' }), true); assert.equal(requests, 4);
});
test('不存在人工审批入口时不会自动批准原生请求', async () => {
  const approve = createAppApprover({ get: () => undefined });
  await assert.rejects(approve(exec('a'), { app: 'test.exe', displayName: 'Test' }), /人工确认入口/);
});
test('原生授权钩子只转发应用请求，并保留拒绝结果', async () => {
  const restore = installAppApprovalHook(async request => { assert.equal(request.app, 'test.exe'); return false; });
  try {
    assert.deepEqual(await globalThis.nodeRepl.createElicitation({ meta: { connector_id: 'computer-use', tool_params: { app: 'test.exe' } } }), { action: 'decline' });
    await assert.rejects(globalThis.nodeRepl.createElicitation({ meta: { connector_id: 'other', tool_params: { app: 'test.exe' } } }), /只支持/);
    assert.throws(() => installAppApprovalHook(() => true), /覆盖/);
  } finally { restore(); }
});
