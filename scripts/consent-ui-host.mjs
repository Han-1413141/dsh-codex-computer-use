// Real DSH web UI, local deterministic model, fictional app: no native access.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'dsh-consent-ui-'));
const results = [];
const server = createServer(async (request, response) => {
  try {
    let body = ''; for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    // The web host also asks its model for titles. Those requests must not
    // advance the tool scenario, which is reconstructed from tool result ids.
    const scenario = data.tools?.some(tool => tool.name === 'computer_consent_fixture');
    const previous = data.messages.flatMap(x => Array.isArray(x.content) ? x.content : []).filter(x => x.type === 'tool_result').at(-1);
    const completedStep = scenario && previous ? Number(previous.tool_use_id?.replace('consent-', '')) : 0;
    if (scenario && previous) {
      assert(!previous.is_error, JSON.stringify(previous));
      const content = typeof previous.content === 'string' ? previous.content : previous.content.filter(x => x.type === 'text').map(x => x.text).join('');
      const value = JSON.parse(content);
      assert.equal(value.mode, 'danger-full-access'); assert.equal(value.policy, 'never');
      assert.equal(value.accepted, completedStep !== 1); results[completedStep - 1] = value;
      await writeFile(join(root, 'results.json'), JSON.stringify(results, null, 2));
    }
    const step = completedStep + 1;
    const done = !scenario || step > 4;
    const block = done ? { type: 'text', text: scenario ? '授权界面验证通过：拒绝、允许、同一会话复用、当次确认和连续确认；完全权限和 never 均保持不变。' : 'Computer Use 授权验证' }
      : { type: 'tool_use', id: `consent-${step}`, name: 'computer_consent_fixture', input: { operation: step === 4 ? 'action' : 'app' } };
    const events = [
      { type: 'message_start', message: { id: `ui-${step}`, model: 'deepseek-v4-flash', usage: { input_tokens: 10, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: block }, { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: done ? 'end_turn' : 'tool_use' }, usage: { output_tokens: 3 } }, { type: 'message_stop' },
    ];
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
    if (done && scenario) {
      await writeFile(new URL('../docs/consent-ui-validation.json', import.meta.url), JSON.stringify({ passed: true, plugin_version: '0.1.3', dsh_version: '0.2.0-rc.2', native_access: false, model: 'local HTTP fixture', results }, null, 2) + '\n');
      console.log('UI verification passed');
    }
  } catch (error) { console.error(error); response.writeHead(400); response.end(JSON.stringify({ error: { message: error.message } })); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const patch = join(root, 'fixture.patch.yml');
await writeFile(patch, JSON.stringify([{ insert: [{ id: 'consent-ui-fixture', name: fileURLToPath(new URL('../test/consent-ui-fixture.mjs', import.meta.url)) }] }]));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '', DSH_TELEMETRY_DISABLED: '1',
  DSH_PERMISSION_MODE: 'danger-full-access', DEEPSEEK_API_KEY: 'local-fixture', DEEPSEEK_BASE_URL: `http://127.0.0.1:${server.address().port}` };
const child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', patch, '--no-open', '--port', '0'], { env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', x => process.stdout.write(x)); child.stderr.on('data', x => process.stderr.write(x));
await mkdir(new URL('../.test-output/', import.meta.url), { recursive: true });
await writeFile(new URL('../.test-output/consent-session.json', import.meta.url), JSON.stringify({ root, pid: child.pid }, null, 2));
console.log(`Consent fixture: ${root}`);
try { await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => { process.once('SIGINT', done); process.once('SIGTERM', done); })]); }
finally {
  server.closeAllConnections(); server.close();
  if (child.exitCode === null) await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
}
