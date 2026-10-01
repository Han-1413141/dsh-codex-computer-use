export const isNativeStop = error => /Computer Use has been stopped for this turn|Computer Use.*(?:turn ended|user stopped)/i.test(error?.message ?? '');

export function describeNativeError(error) {
  if (error?.code === 'CODEX_COMPUTER_USE_STOPPED') return error;
  if (!isNativeStop(error)) return error;
  const urlFailure = /could not determine the current browser URL on Windows/i.test(error.message);
  const explanation = urlFailure
    ? 'Codex 原生运行时未能核验浏览器当前 URL，已停止本轮 Computer Use。这与 DSH 完全权限、应用授权和 CLI 路径无关；改变审批模式或重复调用不能修复。请停止本轮桌面操作；等待支持此浏览器的运行时修复。上游记录：https://github.com/openai/codex/issues/25271。'
    : 'Codex 原生运行时已停止本轮 Computer Use。请停止本轮桌面操作，不要重新观察、重启工作进程或重复输入来继续本轮操作。';
  return Object.assign(new Error(`${explanation}\n原始错误：${error.message}`, { cause: error }), { code: 'CODEX_COMPUTER_USE_STOPPED' });
}
