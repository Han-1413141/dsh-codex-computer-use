import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverCodexCli } from '../src/runtime.mjs';

test('独立 DSH 无 Codex 环境变量或 PATH 时自动查找本机 CLI，忽略不完整安装', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-runtime-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = join(root, 'OpenAI', 'Codex', 'bin');
  for (const name of ['old', 'new', 'incomplete']) await mkdir(join(bin, name), { recursive: true });
  const older = join(bin, 'old', 'codex.exe'), newer = join(bin, 'new', 'codex.exe');
  await writeFile(older, 'fixture'); await writeFile(newer, 'fixture');
  await utimes(older, 100, 100); await utimes(newer, 200, 200);
  assert.equal(await discoverCodexCli({ localAppData: root, env: {} }), newer);
  assert.equal(await discoverCodexCli({ localAppData: root, env: { CODEX_CLI_PATH: join(root, 'deleted.exe') } }), newer);
  assert.equal(await discoverCodexCli({ localAppData: root, codexPath: older, env: {} }), older);
  assert.equal(await discoverCodexCli({ localAppData: root, env: { CODEX_CLI_PATH: older } }), older);
  await assert.rejects(discoverCodexCli({ localAppData: root, codexPath: join(root, 'missing.exe'), env: {} }), /必须指向/);
});

test('支持 Windows Path 名称和带引号的目录；未安装时给出配置建议', async t => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codex-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = join(root, 'codex.exe'); await writeFile(file, 'fixture');
  assert.equal(await discoverCodexCli({ localAppData: join(root, 'empty'), env: { Path: `"${root}"` } }), file);
  await assert.rejects(discoverCodexCli({ localAppData: join(root, 'empty'), env: {} }), /未找到 codex.exe/);
});
