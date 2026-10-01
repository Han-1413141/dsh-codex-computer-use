// Test-only responder for the human-authorized, self-created fixture. Not shipped.
import { appendFileSync } from 'node:fs';
import { win32 } from 'node:path';
export const inject = ['approval'];
export function apply(ctx, config) {
  ctx.on('approval/request', (request, next) => {
    appendFileSync(config.log, JSON.stringify({ tool: request.toolName, reason: request.reason, expectedApp: config.app }) + '\n');
    if (!['codex_computer_read', 'codex_computer_action'].includes(request.toolName)) return next();
    if (request.reason?.includes('应用标识：')) {
      const ids = [config.app, win32.basename(config.app).toLowerCase()];
      return Promise.resolve(ids.some(app => request.reason.includes(`应用标识：${app}。`)) ? 'allowed-once' : 'rejected');
    }
    // Escalation is confined to this scripted run in a temporary DSH_HOME.
    if (request.reason?.startsWith('escalate sandbox to danger-full-access: 通过 Codex Computer Use')) return Promise.resolve('allowed-once');
    return next();
  });
}
