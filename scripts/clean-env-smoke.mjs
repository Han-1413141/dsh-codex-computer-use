// Reproduce a DSH launch outside Codex, without inherited Codex paths or request metadata.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(CODEX_|SKY_|NODE_REPL_REQUEST_META$)/.test(key)) delete env[key];
  else if (key.toLowerCase() === 'path') env[key] = env[key].split(';').filter(p => !/[\\/]OpenAI[\\/]Codex[\\/]bin(?:[\\/]|$)/i.test(p)).join(';');
}
env.ELECTRON_RUN_AS_NODE = '1';
const executable = process.argv[2] || process.execPath;
const args = [...(process.argv[2] ? ['--expose-internals'] : []), fileURLToPath(new URL('../bin/cli.mjs', import.meta.url)), 'doctor'];
const { stdout } = await promisify(execFile)(executable, args, { env, windowsHide: true, timeout: 45000 });
const result = JSON.parse(stdout);
assert.equal(result.available, true);
assert.equal(result.runtime_loaded, true);
assert.equal(result.native_call_verified, true);
assert(result.codex_cli_path.endsWith('codex.exe'));
const report = {
  date: '2026-10-01', version: '0.1.2',
  host: process.argv[2] ? 'DSH desktop Electron executable in Node mode' : 'Node.js',
  codex_environment_removed: true, codex_path_entries_removed: true,
  runtime_version: result.runtime_version, cli_auto_discovered: true,
  native_window_enumeration: 'passed',
  screenshots_or_input_performed: false, model_requests: 0,
};
await writeFile(new URL('../docs/startup-validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
