/**
 * Compatibility hook used by @oai/sky 0.7.5 when its public API is used outside
 * Codex's REPL. Only app-consent elicitation is adapted; no RPC/native-pipe API
 * or native helper protocol is implemented here. Install after loading sky.
 */
export function installAppApprovalHook(approveApp) {
  if (globalThis.nodeRepl !== undefined) throw new Error('拒绝覆盖已有 Codex node_repl 环境。');
  globalThis.nodeRepl = {
    config: {},
    async createElicitation(request) {
      const app = request?.meta?.tool_params?.app;
      if (request?.meta?.connector_id !== 'computer-use' || typeof app !== 'string' || !app || app === 'computer-audio') {
        throw new Error('此版本只支持 Computer Use 的应用授权，不能处理该授权请求。');
      }
      const displayName = request.meta.tool_params_display?.find(x => x.name === 'app')?.value || app;
      const accepted = await approveApp({ app, displayName: String(displayName) });
      return { action: accepted === true ? 'accept' : 'decline' };
    },
  };
  return () => { delete globalThis.nodeRepl; };
}

/** Session consent is scoped to the exact app id and only cached after a real approval. */
export function createAppApprover(ctx) {
  const accepted = new Map();
  return async (exec, { app, displayName }) => {
    exec.signal.throwIfAborted();
    const owner = exec.agent?.session.id;
    if (!owner) throw new Error('应用授权需要 DSH 会话。');
    if (accepted.get(owner)?.has(app)) return true;
    const approval = ctx.get('approval');
    if (!approval) throw new Error('Codex 要求应用授权，当前 DSH 没有人工确认入口。请在桌面版或支持审批的界面运行。');
    const reason = `允许本次 DSH 会话通过 Codex Computer Use 读取和操作应用“${displayName}”吗？应用标识：${app}。包括窗口截图、读取控件、鼠标和键盘操作；发送、删除、付款等仍需按任务另行确认。`;
    const outcome = await approval.request({ agent: exec.agent, toolName: exec.name, callId: exec.callId, reason, signal: exec.signal });
    exec.signal.throwIfAborted();
    if (outcome !== 'allowed-once') return false;
    if (!accepted.has(owner)) {
      if (accepted.size >= 256) accepted.delete(accepted.keys().next().value);
      accepted.set(owner, new Set());
    }
    accepted.get(owner).add(app);
    return true;
  };
}
