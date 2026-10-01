import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { ComputerClient } from '../src/client.mjs';

if (!process.argv.includes('--approved-fixture')) throw new Error('此测试会操作自建窗口。取得用户授权后使用 npm run test:host -- --approved-fixture。');
const root = await mkdtemp(join(tmpdir(), 'dsh-codex-cu-'));
const title = `DSH Computer Use Test ${Date.now()}`;
const expected = 'DSH Codex native input 2026';
const outputPath = join(root, 'typed.txt'), stopPath = join(root, 'stop');
const fixtureExe = join(root, 'DshComputerUseFixture.exe');
execFileSync('powershell.exe', ['-NoProfile', '-File', fileURLToPath(new URL('../test/compile-fixture.ps1', import.meta.url)), '-SourcePath', fileURLToPath(new URL('../test/fixture.cs', import.meta.url)), '-OutputPath', fixtureExe], { windowsHide: true });
const gui = spawn(fixtureExe, [title, outputPath, stopPath], { windowsHide: false, stdio: ['ignore', 'ignore', 'pipe'] });
let guiError = ''; gui.stderr.on('data', chunk => { guiError += chunk.toString(); });
const probe = new ComputerClient();
let harness, server, step = 0, target, finalValue, imageCount = 0, serverError;
const trace = [];
function sse(content, stopReason) {
  return [
    { type: 'message_start', message: { id: `smoke-${step}`, model: 'deepseek-v4-flash', usage: { input_tokens: 10, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: content },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stopReason }, usage: { output_tokens: 3 } },
    { type: 'message_stop' },
  ].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}
function lastResult(body) {
  const blocks = body.messages.flatMap(m => Array.isArray(m.content) ? m.content : []);
  const results = blocks.filter(b => b.type === 'tool_result');
  const result = results.at(-1);
  if (!result) return null;
  assert(!result.is_error, JSON.stringify(result));
  const content = typeof result.content === 'string' ? [{ type: 'text', text: result.content }] : result.content;
  for (const block of content) {
    if (block.type !== 'text') continue;
    try { const value = JSON.parse(block.text); if (value && typeof value === 'object') return value; } catch {}
  }
  throw new Error(`找不到工具结构化结果：${JSON.stringify(result).slice(0, 1000)}`);
}
function indexOf(tree, label) {
  const line = tree.split('\n').find(line => line.includes(label));
  const index = line?.match(/^\s*(?:\[)?(\d+)(?:\]|:|\s)/)?.[1];
  assert(index !== undefined, `未找到 ${label} 的控件编号：${tree}`);
  return Number(index);
}
try {
  for (let attempt = 0; attempt < 50; attempt++) {
    target = (await probe.call('list_windows')).windows.find(w => w.title === title);
    if (target) break;
    if (gui.exitCode !== null) throw new Error(`测试窗口退出：${guiError}`);
    await delay(500);
  }
  assert(target, `测试窗口未出现：${guiError}`);
  await probe.dispose();
  server = createServer(async (request, response) => {
    try {
      let body = ''; for await (const chunk of request) body += chunk;
      const data = JSON.parse(body), previous = lastResult(data);
      step++;
      if (step === 1) {
        assert(data.tools.some(x => x.name === 'codex_computer_read'));
        assert(data.tools.some(x => x.name === 'codex_computer_action'));
      }
      let name = 'codex_computer_read', input;
      if (step === 1) input = { action: 'status' };
      else if (step === 2) { assert(previous.runtime_loaded); input = { action: 'list_windows' }; }
      else if (step === 3) {
        const window = previous.windows.find(w => w.title === title); assert(window);
        input = { action: 'get_window_state', window_id: window.id };
      } else if (step === 4) {
        assert(previous.screenshots?.length); assert(previous.accessibility?.tree);
        name = 'codex_computer_action'; input = { action: 'click', observation_id: previous.observation_id, element_index: indexOf(previous.accessibility.tree, 'Test input') };
      } else if (step === 5) {
        name = 'codex_computer_action'; input = { action: 'type_text', observation_id: previous.observation_id, text: expected };
      } else if (step === 6) {
        assert(JSON.stringify(previous.accessibility).includes(expected));
        name = 'codex_computer_action'; input = { action: 'click', observation_id: previous.observation_id, element_index: indexOf(previous.accessibility.tree, 'Verify input') };
      } else {
        assert.equal(await readFile(outputPath, 'utf8'), expected); finalValue = previous;
        response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end(sse({ type: 'text', text: 'native-computer-use-ok' }, 'end_turn')); return;
      }
      trace.push({ tool: name, action: input.action });
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end(sse({ type: 'tool_use', id: `call-${step}`, name, input }, 'tool_use'));
    } catch (error) {
      serverError = error.message;
      response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { message: error.stack, type: 'invalid_request_error' } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const patch = join(root, 'plugin.patch.yml');
  await writeFile(patch, JSON.stringify([{ insert: [
    { id: 'codex-computer-use', name: fileURLToPath(new URL('../src/index.mjs', import.meta.url)) },
    { id: 'approved-test-fixture', name: fileURLToPath(new URL('../test/approved-fixture.mjs', import.meta.url)), config: { app: target.app, log: join(root, 'approvals.jsonl') } },
  ] }]));
  harness = new DeepSeekHarness({ cwd: root, processCwd: root, dshHome: join(root, 'home'), patches: [patch], initializeTimeoutMs: 30000, requestTimeoutMs: 90000,
    env: { ...process.env, DSH_TELEMETRY_DISABLED: '1', DSH_PRIMARY_RUNTIME: '', DSH_PERMISSION_MODE: 'workspace-write', DEEPSEEK_API_KEY: 'local-fixture', DEEPSEEK_BASE_URL: `http://127.0.0.1:${server.address().port}` } });
  const result = await harness.run('Exercise Computer Use only on the dedicated local fixture window.');
  assert.equal(result.finalResponse, 'native-computer-use-ok', JSON.stringify({ step, serverError, events: result.events.filter(e => /error|failure|finish/.test(e.type)) }).slice(0, 8000));
  const toolResults = result.events.filter(event => event.type === 'tool/result');
  assert.equal(toolResults.length, 6);
  for (const event of toolResults) {
    assert(!event.data.message.isError, JSON.stringify(event));
    imageCount += event.data.message.content.filter(x => x.type === 'image' && x.attachment?.attachmentId).length;
  }
  assert(imageCount >= 4, '截图没有进入 DSH 原生附件。');
  const report = { passed: true, dsh_version: '0.2.0-rc.2', model: 'local HTTP fixture; no paid model request', trace, image_count: imageCount, typed_text_verified: true, final_accessibility: finalValue.accessibility?.tree };
  await writeFile(new URL('../docs/host-validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await harness?.close(); await probe.dispose();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await writeFile(stopPath, 'stop');
  if (gui.exitCode === null) {
    await Promise.race([new Promise(resolve => gui.once('exit', resolve)), delay(3000)]);
    if (gui.exitCode === null) gui.kill();
  }
  console.log(`验证资料目录：${root}`);
}
