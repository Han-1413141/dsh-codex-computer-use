import { createElement } from 'react';

export const name = 'dsh-codex-computer-use';
export const inject = ['commandUi', 'sessions', 'conversation'];

const prompt = '请使用 Codex Computer Use 帮我完成以下电脑操作：\n';

function ComputerIcon(props) {
  return createElement('svg', {
    width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
    'aria-hidden': true, ...props,
  },
  createElement('rect', { x: 3, y: 3, width: 18, height: 13, rx: 2 }),
  createElement('path', { d: 'M8 21h8M12 16v5' }));
}

export function apply(ctx) {
  ctx.effect(() => ctx.commandUi.register({
    name: 'computer',
    label: () => 'Computer Use',
    description: () => '使用 Codex 操作电脑',
    icon: ComputerIcon,
    available: () => true,
    ui: {
      kind: 'action',
      run({ sessionId }) {
        // Keyboard picks run inside Lexical's update; wait for trigger consumption to commit first.
        queueMicrotask(() => {
          const scope = ctx.sessions.scope(sessionId);
          if (!scope) return;
          const input = scope.get('conversation').input.for(scope);
          const state = input.state.getSnapshot();
          if (state.phase !== 'plain') {
            input.notify('info', '请等待输入框空闲后，再选择 Computer Use。');
            return;
          }
          if (!state.draft.startsWith(prompt)) {
            // Insert through the composer's revision-guarded API to preserve attachments and reference chips.
            const inserted = scope.bail(scope, 'slash/input-insert-text', {
              text: prompt,
              span: { start: 0, end: 0, draftRev: state.draftRev },
            });
            if (!inserted) input.notify('info', '请等待输入框空闲后，再选择 Computer Use。');
          }
          input.focus();
        });
      },
    },
  }), 'codex-computer-use: register input menu');
}
