// Isolated real DSH web host for menu verification. Never contacts a model endpoint.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = await mkdtemp(join(tmpdir(), 'dsh-computer-menu-'));
const source = fileURLToPath(new URL('../', import.meta.url));
const cli = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'));
const env = { ...process.env, DSH_HOME: join(root, 'home'), DSH_PRIMARY_RUNTIME: '',
  DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'local-menu-fixture',
  DEEPSEEK_BASE_URL: 'http://127.0.0.1:9' };
await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add', source, '--ignore-scripts'], {
  env, cwd: root, windowsHide: true, timeout: 120000,
});
const child = spawn(process.execPath, [cli, '--profile', 'web', '--no-open', '--port', '0'], {
  env, cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', x => process.stdout.write(x));
child.stderr.on('data', x => process.stderr.write(x));
await mkdir(new URL('../.test-output/', import.meta.url), { recursive: true });
await writeFile(new URL('../.test-output/menu-session.json', import.meta.url), JSON.stringify({ root, pid: child.pid }, null, 2));
console.log(`Menu fixture: ${root}`);
try {
  await Promise.race([
    new Promise(done => child.once('exit', done)),
    new Promise(done => { process.once('SIGINT', done); process.once('SIGTERM', done); }),
  ]);
} finally {
  if (child.exitCode === null) await promisify(execFile)('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
}
