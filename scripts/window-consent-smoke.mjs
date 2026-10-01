import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { requestWindowsConsent } from '../src/windows-consent.mjs';

await mkdir(new URL('../.test-output/', import.meta.url), { recursive: true });
const preview = fileURLToPath(new URL('../.test-output/window-consent.png', import.meta.url));
const payload = { question: '允许本次 DSH 会话通过 Codex Computer Use 读取和操作应用“DSH 授权窗口测试（模拟应用）”吗？', detail: '应用标识：dsh-consent-fixture。包括窗口截图、读取控件、鼠标和键盘操作；发送、删除、付款等仍需按任务另行确认。此确认独立于普通工具审批，完全权限模式也会显示。\r\n\r\n这是独立授权窗口的界面测试，不会授予真实应用权限。', allow: '允许本次会话', deny: '拒绝', header: '应用授权' };
const choices = JSON.parse(execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-WindowStyle', 'Hidden', '-File', fileURLToPath(new URL('../test/consent-form-preview.ps1', import.meta.url)), '-OutputPath', preview], { windowsHide: true, encoding: 'utf8', input: JSON.stringify(payload) }));
assert.deepEqual(choices, ['Cancel', 'OK']);
const cancel = new AbortController(); let ready = false, popup;
await assert.rejects(requestWindowsConsent(payload, cancel.signal, { spawnProcess: (...args) => {
  popup = spawn(...args);
  popup.stdout.on('data', chunk => { if (chunk.toString().includes('"ready"')) { ready = true; setTimeout(() => cancel.abort(), 500); } });
  return popup;
} }), /abort/i);
assert(ready, '真实授权窗口未显示'); assert(popup.exitCode !== null || popup.signalCode !== null);
const result = { plugin_version: '0.1.4', passed: true, form_choices: choices, production_dialog_shown: ready, cancelled_dialog_exited: true, real_app_permission_granted: false, note: 'Presentation fixture checks buttons and rendering; real production dialog checks startup and cancellation.' };
await writeFile(new URL('../docs/window-consent-validation.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, preview }, null, 2));
