import { randomUUID } from 'node:crypto';
import { isNativeStop, describeNativeError } from './errors.mjs';

export const READ_ACTIONS = ['list_windows', 'list_apps', 'get_window_state'];
export const INPUT_ACTIONS = ['launch_app', 'click', 'press_key', 'type_text', 'scroll', 'set_value', 'drag', 'perform_secondary_action', 'activate_window'];
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const number = (x, label) => { assert(Number.isFinite(x), `${label} 必须是有限数值。`); return x; };
const integer = (x, label) => { assert(Number.isSafeInteger(x) && x >= 0, `${label} 必须是非负整数。`); return x; };
const text = (x, label, allowEmpty = false) => {
  assert(typeof x === 'string' && (allowEmpty || x.trim().length > 0) && x.length <= 100000, `${label} 必须是有效文本，最长 100000 字符。`); return x;
};

/** One native desktop, one current observation. Owner and token prevent cross-session replay. */
export class ComputerController {
  constructor(sky, { allowedApps = [], observationTtlMs = 120000, now = Date.now } = {}) {
    assert(Array.isArray(allowedApps) && allowedApps.every(x => typeof x === 'string'), 'allowedApps 必须是应用标识数组。');
    assert(Number.isFinite(observationTtlMs) && observationTtlMs >= 1000 && observationTtlMs <= 600000, 'observationTtlMs 应在 1000–600000 毫秒之间。');
    this.sky = sky; this.allowedApps = new Set(allowedApps); this.ttl = observationTtlMs; this.now = now;
    this.observation = null;
  }
  allowed(app) { return !this.allowedApps.size || this.allowedApps.has(app); }
  checkWindow(window) {
    assert(this.allowed(window.app), '目标应用不在插件配置的 allowedApps 中。');
    assert(!/LockApp\.exe/i.test(window.app), 'Windows 桌面已锁定，请先解锁。');
    return window;
  }
  async window(id) {
    integer(id, 'window_id');
    const candidates = (await this.sky.list_windows()).filter(w => w.id === id);
    assert(candidates.length === 1, '目标窗口已关闭或无法唯一确定，请重新 list_windows。');
    return this.checkWindow(candidates[0]);
  }
  async capture(owner, window, options = {}) {
    this.observation = null;
    const state = await this.sky.get_window_state({ window, include_screenshot: options.include_screenshot !== false, include_text: options.include_text !== false });
    this.checkWindow(state.window);
    const id = randomUUID();
    this.observation = { id, owner, state, time: this.now() };
    return { ...state, observation_id: id, expires_in_ms: this.ttl };
  }
  async execute(action, args, owner) {
    text(owner, '会话标识');
    assert(args && typeof args === 'object' && !Array.isArray(args), '参数必须是对象。');
    if (action === 'list_windows') return { windows: (await this.sky.list_windows()).filter(w => this.allowed(w.app)) };
    if (action === 'list_apps') return { apps: (await this.sky.list_apps()).filter(a => this.allowed(a.id)) };
    if (action === 'get_window_state') return this.capture(owner, await this.window(args.window_id), args);
    assert(INPUT_ACTIONS.includes(action), '不支持的 computer use 操作。');
    if (action === 'launch_app') {
      const app = text(args.app, 'app');
      assert(this.allowed(app), '目标应用不在 allowedApps 中。');
      assert(!/LockApp\.exe/i.test(app), '不能启动锁屏应用。');
      this.observation = null;
      await this.sky.launch_app({ app });
      return { action, windows: (await this.sky.list_windows()).filter(w => this.allowed(w.app)), next: '从返回窗口中选择目标，再调用 get_window_state。' };
    }
    const observation = this.observation;
    assert(observation && observation.owner === owner && observation.id === args.observation_id, '观察已失效或属于其他会话，请先 get_window_state。');
    assert(this.now() - observation.time <= this.ttl, '观察已过期，请先 get_window_state。');
    const window = observation.state.window;
    const current = await this.window(window.id);
    assert(current.app === window.app, '窗口所属应用已经改变，请重新观察。');
    const input = { window };
    const element = () => {
      assert(observation.state.accessibility, '当前观察没有控件信息，请使用 include_text=true 重新观察。');
      return integer(args.element_index, 'element_index');
    };
    const screenshot = () => {
      const shot = observation.state.screenshots?.find(s => s.id === args.screenshot_id);
      assert(shot, '坐标操作必须使用本次观察返回的 screenshot_id。');
      input.screenshotId = shot.id;
      return shot;
    };
    const point = (x, y, shot) => {
      number(x, 'x'); number(y, 'y');
      assert(x >= 0 && y >= 0 && (shot.width == null || x < shot.width) && (shot.height == null || y < shot.height), '坐标超出截图范围；请使用原始截图尺寸的逻辑坐标。');
    };
    switch (action) {
      case 'click': {
        const indexed = args.element_index !== undefined;
        assert(!(indexed && (args.x !== undefined || args.y !== undefined)), 'element_index 与坐标不能同时传入。');
        if (indexed) input.element_index = element();
        else { point(args.x, args.y, screenshot()); input.x = args.x; input.y = args.y; }
        const button = args.mouse_button ?? 'left';
        assert(['left', 'right', 'middle'].includes(button), 'mouse_button 无效。');
        const count = args.click_count ?? 1;
        assert([1, 2, 3].includes(count), 'click_count 只能是 1、2 或 3。');
        Object.assign(input, { mouse_button: button, click_count: count }); break;
      }
      case 'press_key':
        input.key = text(args.key, 'key');
        assert(!input.key.split('+').some(k => /^(meta|windows|win|cmd|command|super|os)(_[lr])?$/i.test(k.trim())), '不支持 Windows / Meta 快捷键。'); break;
      case 'type_text':
        assert(observation.state.accessibility?.focused_element, '请先观察并确认输入焦点，或使用 set_value 指定可编辑控件。');
        input.text = text(args.text, 'text', true); break;
      case 'set_value': input.element_index = element(); input.value = text(args.value, 'value', true); break;
      case 'perform_secondary_action': input.element_index = element(); input.action = text(args.secondary_action, 'secondary_action'); break;
      case 'scroll':
        point(args.x, args.y, screenshot());
        Object.assign(input, { x: args.x, y: args.y, scrollX: number(args.scroll_x ?? 0, 'scroll_x'), scrollY: number(args.scroll_y ?? 0, 'scroll_y') }); break;
      case 'drag': {
        const shot = screenshot(); point(args.from_x, args.from_y, shot); point(args.to_x, args.to_y, shot);
        Object.assign(input, { from_x: args.from_x, from_y: args.from_y, to_x: args.to_x, to_y: args.to_y }); break;
      }
    }
    // Consume before dispatch. Neither an unknown result nor a refresh failure permits replay.
    this.observation = null;
    let applied = false;
    try {
      await this.sky[action](input); applied = true;
      return { action, ...(await this.capture(owner, window, args)) };
    } catch (error) {
      this.observation = null;
      if (isNativeStop(error)) throw describeNativeError(error);
      throw new Error(`${applied ? '操作已执行，但刷新失败' : '操作结果未知'}；请重新观察，禁止直接重试。${error.message}`);
    }
  }
}
