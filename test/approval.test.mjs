import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppApprover as makeAppApprover, installAppApprovalHook, requestConsent } from '../src/approval.mjs';
const createAppApprover = ctx => makeAppApprover(ctx, { approvalUi: 'dsh' });

const exec = id => ({ agent: { session: { id } }, signal: new AbortController().signal, callId: 'call', name: 'codex_computer_read' });
test('独立授权窗口不接受非注册根会话的请求', async () => {
  await assert.rejects(requestConsent({ get: () => undefined }, exec('a'), {}), /根会话/);
});
test('应用许可只在人工批准后缓存，且按会话和应用隔离', async () => {
  let requests = 0, outcome = '拒绝';
  const approve = createAppApprover({ get: key => {
    assert.equal(key, 'userQuestions', '不得进入 approval=never 的沙箱升级审批');
    return { ask: async input => { assert(input.questions[0].question.includes('本次 DSH 会话')); requests++; return { answers: [{ id: input.questions[0].id, selected: [outcome] }] }; } };
  } });
  const app = { app: 'test.exe', displayName: 'Test' };
  assert.equal(await approve(exec('a'), app), false);
  outcome = '允许本次会话'; assert.equal(await approve(exec('a'), app), true);
  assert.equal(await approve(exec('a'), app), true); assert.equal(requests, 2);
  assert.equal(await approve(exec('b'), app), true); assert.equal(requests, 3);
  assert.equal(await approve(exec('a'), { ...app, app: 'other.exe' }), true); assert.equal(requests, 4);
});
test('跳过、自由文本、错误标识和重复回答均不构成批准', async () => {
  const app = { app: 'test.exe', displayName: 'Test' };
  for (const answer of [
    id => ({ answers: [{ id, selected: [] }] }),
    id => ({ answers: [{ id, selected: ['允许本次会话'], custom: '拒绝' }] }),
    () => ({ answers: [{ id: 'wrong', selected: ['允许本次会话'] }] }),
    id => ({ answers: [{ id, selected: ['允许本次会话'] }, { id, selected: ['允许本次会话'] }] }),
  ]) {
    const approve = createAppApprover({ get: () => ({ ask: async request => answer(request.questions[0].id) }) });
    assert.equal(await approve(exec('a'), app), false);
  }
});
test('取消后到达的回答不缓存应用许可', async () => {
  let count = 0;
  const cancel = new AbortController();
  const approve = createAppApprover({ get: () => ({ ask: async request => {
    count++; if (count === 1) cancel.abort();
    return { answers: [{ id: request.questions[0].id, selected: ['允许本次会话'] }] };
  } }) });
  const app = { app: 'test.exe', displayName: 'Test' };
  await assert.rejects(approve({ ...exec('a'), signal: cancel.signal }, app), /abort/i);
  assert.equal(await approve(exec('a'), app), true); assert.equal(count, 2);
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
