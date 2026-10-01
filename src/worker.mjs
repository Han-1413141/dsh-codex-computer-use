import { loadSky } from './runtime.mjs';
import { ComputerController } from './controller.mjs';
import { installAppApprovalHook } from './approval.mjs';
import { randomUUID } from 'node:crypto';
import { describeNativeError } from './errors.mjs';

let runtime, controller, initializing, activeRequest;
const approvals = new Map();
async function initialize(config) {
  if (!initializing) initializing = loadSky(config).then(loaded => {
    runtime = loaded.runtime;
    controller = new ComputerController(loaded.sky, config);
    installAppApprovalHook(request => new Promise((resolve, reject) => {
      if (!activeRequest || !process.connected) { reject(new Error('当前没有可接收应用授权的 DSH 调用。')); return; }
      const approvalId = randomUUID();
      approvals.set(approvalId, resolve);
      process.send({ type: 'approval', id: activeRequest.id, approvalId, request });
    }));
  }).catch(error => { initializing = null; throw error; });
  await initializing;
}
let queue = Promise.resolve();
process.on('message', request => {
  if (request?.type === 'approval-result') {
    approvals.get(request.approvalId)?.(request.accepted === true);
    approvals.delete(request.approvalId); return;
  }
  queue = queue.then(async () => {
    try {
      await initialize(request.config);
      activeRequest = request;
      const value = request.action === 'status'
        ? { runtime_loaded: true, native_call_verified: false, platform: 'windows', runtime_version: runtime.version, runtime_path: runtime.root, codex_cli_path: runtime.codexCliPath, connection: 'local-package', app_approval: 'dsh-session', next_action: 'list_windows', note: '接口已加载且已定位 codex.exe；尚未验证原生调用。请 list_windows 验证连接，成功后再继续操作；首次访问应用会请求 DSH 人工授权。' }
        : await controller.execute(request.action, request.args, request.owner);
      if (process.connected) process.send({ id: request.id, value });
    } catch (error) {
      if (process.connected) process.send({ id: request.id, error: describeNativeError(error).message });
    } finally { activeRequest = null; }
  });
});
process.on('disconnect', () => process.exit(0));
