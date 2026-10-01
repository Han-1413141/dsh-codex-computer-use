import { randomUUID } from 'node:crypto';
import { requestWindowsConsent } from './windows-consent.mjs';

/** Human consent is independent of sandbox escalation (whose policy may be never). */
export async function requestConsent(ctx, exec, { question, detail, allow, header }, { approvalUi = 'window' } = {}) {
  exec.signal.throwIfAborted();
  if (!exec.agent?.session.id) throw new Error('人工确认需要 DSH 会话。');
  if (!['window', 'dsh'].includes(approvalUi)) throw new Error('approvalUi 只能是 window 或 dsh。');
  if (approvalUi === 'window') {
    const agents = ctx.get('agents');
    if (!agents || agents.get(exec.agent.id) !== exec.agent || !agents.roots().includes(exec.agent)) {
      throw new Error('应用授权只能由当前 DSH 根会话请求；子代理需将请求交回主会话。');
    }
    const accepted = await requestWindowsConsent({ question, detail, allow, deny: '拒绝', header }, exec.signal);
    exec.signal.throwIfAborted();
    return accepted;
  }
  const questions = ctx.get('userQuestions');
  if (!questions?.ask) throw new Error('当前 DSH 没有人工确认入口。请连接支持用户问答的 DSH 桌面或 Web 界面；无需切换完全权限模式。');
  const id = `computer-use-consent-${randomUUID()}`;
  let result;
  try {
    result = await questions.ask({
      // Use an independent blocking card. One tool call can ask for action
      // confirmation and app consent in sequence; reusing its callId reuses
      // the first question card in DSH 0.2.0-rc.2.
      agent: exec.agent, signal: exec.signal,
      questions: [{ id, header, question, detail, multiSelect: false,
        options: [{ label: allow }, { label: '拒绝' }] }],
    });
  } catch (error) {
    exec.signal.throwIfAborted();
    throw new Error(`应用确认未完成，操作未获授权。请连接 DSH 桌面或 Web 问答界面。${error.message}`, { cause: error });
  }
  exec.signal.throwIfAborted();
  const answer = result?.answers?.length === 1 ? result.answers[0] : null;
  return answer?.id === id && !answer.custom && answer.selected?.length === 1 && answer.selected[0] === allow;
}

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
export function createAppApprover(ctx, config = {}) {
  const accepted = new Map();
  return async (exec, { app, displayName }) => {
    exec.signal.throwIfAborted();
    const owner = exec.agent?.session.id;
    if (!owner) throw new Error('应用授权需要 DSH 会话。');
    if (accepted.get(owner)?.has(app)) return true;
    const allowed = await requestConsent(ctx, exec, {
      header: '应用授权', allow: '允许本次会话',
      question: `允许本次 DSH 会话通过 Codex Computer Use 读取和操作应用“${displayName}”吗？`,
      detail: `应用标识：${app}。包括窗口截图、读取控件、鼠标和键盘操作；发送、删除、付款等仍需按任务另行确认。此确认独立于普通工具审批，完全权限模式也会显示。`,
    }, config);
    exec.signal.throwIfAborted();
    if (!allowed) return false;
    if (!accepted.has(owner)) {
      if (accepted.size >= 256) accepted.delete(accepted.keys().next().value);
      accepted.set(owner, new Set());
    }
    accepted.get(owner).add(app);
    return true;
  };
}
