// Test-only responder for the human-authorized, self-created fixture. Not shipped.
import { appendFileSync } from 'node:fs';
import { win32 } from 'node:path';
import assert from 'node:assert/strict';
export const inject = ['approval', 'userQuestions', 'sandboxPolicy'];
export function apply(ctx, config) {
  ctx.on('user-questions/request', (request, next) => {
    const question = request.questions?.[0];
    if (request.questions?.length !== 1 || !question?.id.startsWith('computer-use-consent-')) return next();
    const ids = [config.app, win32.basename(config.app).toLowerCase()];
    if (!ids.some(app => question.detail?.includes(`应用标识：${app}。`))) return next();
    assert.equal(ctx.approval.overrideOf(request.agent.session), 'never');
    assert.equal(ctx.sandboxPolicy.resolve({ session: request.agent.session }).mode, 'danger-full-access');
    appendFileSync(config.log, JSON.stringify({ kind: 'fixture-app-consent', question: question.question, expectedApp: config.app }) + '\n');
    return Promise.resolve({ answers: [{ id: question.id, selected: ['允许本次会话'] }] });
  });
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
