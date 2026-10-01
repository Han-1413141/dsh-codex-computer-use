import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One native dialog; close, Escape, process failure and cancellation deny access. */
export function requestWindowsConsent(payload, signal, { spawnProcess = spawn } = {}) {
  signal.throwIfAborted();
  if (process.platform !== 'win32') throw new Error('独立授权窗口需要 Windows。');
  const executable = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-File', fileURLToPath(new URL('./windows-consent.ps1', import.meta.url))], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '', stderr = '', answer = false, resultSeen = false, failure, settled = false;
    const startup = setTimeout(() => { failure = new Error('授权窗口未能启动。可将 approvalUi 设为 dsh 使用聊天内确认。'); child.kill(); }, 15000);
    const finish = error => {
      if (settled) return; settled = true;
      clearTimeout(startup); signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason);
      else if (error) reject(error);
      else resolve(answer);
    };
    const abort = () => { child.kill(); };
    signal.addEventListener('abort', abort, { once: true });
    child.on('error', finish);
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 16000) { failure = new Error('授权窗口返回了无效结果。'); child.kill(); return; }
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        try {
          const message = JSON.parse(line);
          if (message.type === 'ready') clearTimeout(startup);
          else if (message.type === 'result') {
            if (resultSeen || typeof message.accepted !== 'boolean') throw new Error('Invalid consent response');
            resultSeen = true; answer = message.accepted;
          }
          else if (message.type === 'error') failure = new Error(String(message.message));
          else throw new Error('Unknown consent response');
        } catch { failure = new Error('授权窗口返回了无效结果。'); child.kill(); }
      }
    });
    child.on('close', code => finish(failure || (code !== 0 ? new Error(`授权窗口未完成。${stderr}`) : undefined)));
    // User-facing text is data on stdin, never interpolated into shell code.
    child.stdin.on('error', error => { if (!settled) { failure = error; child.kill(); } });
    child.stdin.end(JSON.stringify(payload));
    if (signal.aborted) abort();
  });
}
