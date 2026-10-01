import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

/** Private IPC to our own worker; the worker uses the public @oai/sky API. */
export class ComputerClient {
  constructor(config = {}, { workerUrl = new URL('./worker.mjs', import.meta.url) } = {}) {
    this.config = config; this.workerUrl = workerUrl; this.child = null; this.owner = null; this.pending = new Map();
    this.closed = false; this.queue = Promise.resolve(); this.stopping = Promise.resolve();
    this.timeoutMs = config.timeoutMs ?? 30000;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 120000) throw new Error('timeoutMs 应在 1000–120000 毫秒之间。');
  }
  start() {
    if (this.child) return this.child;
    const child = fork(fileURLToPath(this.workerUrl), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true, execArgv: [], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    this.child = child;
    child.on('message', async message => {
      const pending = this.pending.get(message?.id);
      if (!pending) return;
      if (message.type === 'approval') {
        pending.pause();
        let accepted = false;
        try { accepted = await pending.approveApp?.(message.request) === true; }
        catch (error) { if (this.child === child) this.stop(error); return; }
        if (this.child !== child || !this.pending.has(message.id)) return;
        pending.resume();
        child.send({ type: 'approval-result', approvalId: message.approvalId, accepted }, error => { if (error && this.child === child) this.stop(error); });
        return;
      }
      message.error ? pending.reject(new Error(message.error)) : pending.resolve(message.value);
    });
    child.on('error', error => { if (this.child === child) this.stop(error); });
    child.on('exit', () => {
      if (this.child === child) this.stop(new Error('computer use 工作进程已退出；请重新观察后再操作。'));
    });
    return child;
  }
  stop(error) {
    const child = this.child; this.child = null; this.owner = null;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    if (child && child.exitCode === null && child.signalCode === null) {
      this.stopping = new Promise(resolve => {
        const timer = setTimeout(() => child.kill(), 5000);
        const done = () => { clearTimeout(timer); resolve(); };
        child.once('exit', done); child.once('error', done);
        // The worker calls sky.close() so the native overlay is dismissed.
        // Killing Node immediately leaves no chance to close the SDK cleanly.
        if (child.connected) child.send({ type: 'shutdown' }, error => { if (error) child.kill(); });
        else child.kill();
      });
    }
  }
  call(action, args = {}, owner = 'cli', signal, approveApp) {
    const run = async () => {
      await this.stopping;
      if (this.closed) throw new Error('插件已卸载。');
      signal?.throwIfAborted();
      if (this.child && this.owner !== owner) {
        this.stop(new Error('Computer Use 已切换会话；请重新观察。'));
        await this.stopping;
      }
      this.owner = owner;
      return new Promise((resolve, reject) => {
        const id = randomUUID();
        let timer;
        const finish = (fn, value) => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort); this.pending.delete(id); fn(value);
        };
        const abort = () => this.stop(new Error('操作已取消，结果可能未完整返回。请重新观察，禁止自动重试输入。'));
        const resume = () => { timer = setTimeout(() => this.stop(new Error('computer use 调用超时；工作进程已停止。请重新观察，禁止自动重试输入。')), this.timeoutMs); };
        this.pending.set(id, { resolve: v => finish(resolve, v), reject: e => finish(reject, e), pause: () => clearTimeout(timer), resume, approveApp });
        resume();
        signal?.addEventListener('abort', abort, { once: true });
        try {
          this.start().send({ id, action, args, owner, config: this.config }, error => { if (error) this.stop(error); });
        } catch (error) { this.stop(error); }
      }).catch(async error => { await this.stopping; throw error; });
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  release(owner) {
    const result = this.queue.then(async () => {
      if (this.owner !== owner) return;
      this.stop(new Error('本轮 Computer Use 已结束。'));
      await this.stopping;
    });
    this.queue = result.catch(() => {});
    return result;
  }
  async dispose() { this.closed = true; this.stop(new Error('插件已卸载，computer use 已停止。')); await this.stopping; }
}
