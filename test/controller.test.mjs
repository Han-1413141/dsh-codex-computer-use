import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputerController } from '../src/controller.mjs';
import { renderResult, storeScreenshots, authorize } from '../src/index.mjs';
import { discoverSky } from '../src/runtime.mjs';

function setup(options = {}) {
  const calls = [];
  const window = { id: 1, app: 'test.exe', title: '测试' };
  let sequence = 0;
  const sky = {
    list_windows: async () => [window], list_apps: async () => [{ id: window.app, windows: [window] }],
    get_window_state: async () => ({ window, accessibility: { tree: '1: edit\n2: button', focused_element: '1: edit' }, screenshots: [{ id: `shot-${++sequence}`, width: 300, height: 200, url: 'data:image/png;base64,aGVsbG8=', zIndex: 0 }] }),
  };
  for (const action of ['click', 'type_text', 'set_value', 'press_key', 'drag', 'scroll', 'activate_window', 'launch_app', 'perform_secondary_action']) sky[action] = async input => { calls.push({ action, input }); };
  const controller = new ComputerController(sky, options);
  const observe = () => controller.execute('get_window_state', { window_id: 1 }, 'session-a');
  return { sky, controller, observe, calls, window };
}

test('控件点击使用返回窗口并立即刷新；旧观察不能重放', async () => {
  const f = setup(); const state = await f.observe();
  const next = await f.controller.execute('click', { observation_id: state.observation_id, element_index: 2 }, 'session-a');
  assert.equal(f.calls[0].input.window, f.window); assert.notEqual(next.observation_id, state.observation_id);
  await assert.rejects(f.controller.execute('click', { observation_id: state.observation_id, element_index: 2 }, 'session-a'), /失效/);
  assert.equal(f.calls.length, 1);
});
test('跨会话观察不能用于操作', async () => {
  const f = setup(); const state = await f.observe();
  await assert.rejects(f.controller.execute('press_key', { observation_id: state.observation_id, key: 'Return' }, 'session-b'), /其他会话/);
  assert.equal(f.calls.length, 0);
});
test('其他会话的新截图使旧观察失效', async () => {
  const f = setup(); const state = await f.observe();
  await f.controller.execute('get_window_state', { window_id: 1 }, 'session-b');
  await assert.rejects(f.controller.execute('activate_window', { observation_id: state.observation_id }, 'session-a'), /失效/);
});
test('截图编号和坐标范围在输入前检查', async () => {
  const f = setup(); const state = await f.observe();
  const args = { observation_id: state.observation_id, x: 10, y: 20, screenshot_id: 'old' };
  await assert.rejects(f.controller.execute('click', args, 'session-a'), /screenshot_id/);
  args.screenshot_id = state.screenshots[0].id; args.x = 301;
  await assert.rejects(f.controller.execute('click', args, 'session-a'), /超出/);
  args.x = 10; await f.controller.execute('click', args, 'session-a');
  assert.equal(f.calls[0].input.screenshotId, state.screenshots[0].id);
});
test('未知操作结果不会保留可重放的观察', async () => {
  const f = setup(); const state = await f.observe();
  f.sky.click = async () => { throw new Error('timeout'); };
  const args = { observation_id: state.observation_id, element_index: 2 };
  await assert.rejects(f.controller.execute('click', args, 'session-a'), /结果未知/);
  await assert.rejects(f.controller.execute('click', args, 'session-a'), /失效/);
});
test('操作成功但截图失败明确返回已执行，不允许重放', async () => {
  const f = setup(); const state = await f.observe();
  f.sky.get_window_state = async () => { throw new Error('capture failed'); };
  await assert.rejects(f.controller.execute('click', { observation_id: state.observation_id, element_index: 2 }, 'session-a'), /已执行，但刷新失败/);
  assert.equal(f.controller.observation, null);
});
test('过期观察、失去焦点、Windows 键都在动作前拒绝', async () => {
  let now = 0; const f = setup({ now: () => now, observationTtlMs: 1000 });
  let state = await f.observe(); now = 1001;
  await assert.rejects(f.controller.execute('activate_window', { observation_id: state.observation_id }, 'session-a'), /过期/);
  state = await f.observe();
  await assert.rejects(f.controller.execute('press_key', { observation_id: state.observation_id, key: 'Win+r' }, 'session-a'), /Windows/);
  f.controller.observation.state.accessibility.focused_element = undefined;
  await assert.rejects(f.controller.execute('type_text', { observation_id: state.observation_id, text: 'hello' }, 'session-a'), /焦点/);
  assert.equal(f.calls.length, 0);
});
test('应用允许列表同时限制枚举、读取和启动', async () => {
  const f = setup({ allowedApps: ['other.exe'] });
  assert.deepEqual(await f.controller.execute('list_windows', {}, 'a'), { windows: [] });
  await assert.rejects(f.observe(), /allowedApps/);
  await assert.rejects(f.controller.execute('launch_app', { app: 'test.exe' }, 'a'), /allowedApps/);
  assert.equal(f.calls.length, 0);
});
test('不支持的环境有可操作的报错', async () => {
  await assert.rejects(discoverSky({ platform: 'linux' }), /Windows/);
  await assert.rejects(discoverSky({ platform: 'win32', localAppData: 'Z:/does-not-exist' }), /未找到/);
});
test('截图通过附件服务保存，文本结果不含 base64', async () => {
  const f = setup(); const state = await f.observe();
  const saved = await storeScreenshots(state, { saveImages: async images => {
    assert.equal(images[0].data.toString(), 'hello');
    return [{ attachmentId: 'fixture', mediaType: 'image/png', width: 150, height: 100, bytes: 5 }];
  } });
  const content = renderResult({}, saved);
  assert.equal(content.filter(x => x.type === 'image').length, 1);
  assert(!JSON.stringify(content).includes('aGVsbG8='));
  assert(content[0].text.includes('displayed_width'));
});
test('全访问模式也必须执行显式的当次确认', async () => {
  let asked = 0;
  const ctx = { sandboxPolicy: { resolve: () => ({ mode: 'danger-full-access' }) }, get: key => key === 'userQuestions' ? { ask: async input => { asked++; return { answers: [{ id: input.questions[0].id, selected: ['拒绝'] }] }; } } : { request: () => assert.fail('完全权限下不应请求普通工具审批') } };
  const exec = { agent: { session: { id: 'a' } }, signal: new AbortController().signal, callId: 'x', name: 'tool' };
  await assert.rejects(authorize(ctx, exec, { confirm: true, reason: '确认操作' }, 'click', { approvalUi: 'dsh' }), /未批准/);
  assert.equal(asked, 1);
});
test('原生停止错误不再要求重新观察或重复调用', async () => {
  const f = setup(); const state = await f.observe();
  f.sky.click = async () => { throw new Error('Computer Use has been stopped for this turn because it could not determine the current browser URL on Windows with enough confidence to enforce policy.'); };
  await assert.rejects(f.controller.execute('click', { observation_id: state.observation_id, element_index: 2 }, 'session-a'), error => {
    assert(error.message.includes('已停止本轮')); assert(!error.message.includes('请重新观察')); return true;
  });
  assert.equal(f.controller.observation, null);
});
test('只读沙箱不会在缺少审批入口时执行桌面操作', async () => {
  const ctx = { sandboxPolicy: { resolve: () => ({ mode: 'read-only' }) }, get: () => undefined };
  await assert.rejects(authorize(ctx, { signal: new AbortController().signal }, {}, 'list_windows'));
});
