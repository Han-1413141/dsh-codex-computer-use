#!/usr/bin/env node
import { ComputerClient } from '../src/client.mjs';

const command = process.argv[2] || 'doctor';
if (command !== 'doctor') {
  console.error('用法：dsh-codex-computer-use doctor [@oai/sky 包目录]'); process.exitCode = 2;
} else {
  const client = new ComputerClient({ skyDir: process.argv[3] });
  try {
    const status = await client.call('status');
    const { windows } = await client.call('list_windows');
    console.log(JSON.stringify({ ...status, available: true, native_call_verified: true, window_count: windows.length, note: '已成功完成原生窗口枚举；应用截图和输入仍按 DSH 权限申请授权。' }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await client.dispose(); }
}
