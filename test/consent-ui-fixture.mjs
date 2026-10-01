// No native access: exercises the real DSH question UI with a fictional app.
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createAppApprover } from '../src/approval.mjs';
import { authorize } from '../src/index.mjs';
export const inject = ['tools', 'userQuestions', 'sandboxPolicy', 'approval'];
export function apply(ctx) {
  const approve = createAppApprover(ctx);
  ctx.tools.register(defineTool({
    name: 'computer_consent_fixture', description: 'Local test of the human consent dialog; never accesses the desktop.',
    parameters: { operation: { type: 'string', enum: ['app', 'action'], required: true } },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }, isConcurrencySafe: () => false,
    async execute(args, exec) {
      let accepted;
      if (args.operation === 'app') accepted = await approve(exec, { app: 'dsh-consent-fixture', displayName: 'DSH 授权界面测试（模拟应用）' });
      else {
        await authorize(ctx, exec, { confirm: true, reason: '验证完全权限下的单次操作确认。这里只返回测试结果，不执行任何桌面操作。' }, 'fixture');
        accepted = await approve(exec, { app: 'dsh-consent-fixture-second', displayName: 'DSH 同一次调用中的第二个确认（模拟应用）' });
      }
      return { accepted, mode: ctx.sandboxPolicy.resolve({ session: exec.agent.session }).mode, policy: ctx.approval.overrideOf(exec.agent.session) };
    },
  }));
}
