import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const directory of ['src', 'bin', 'scripts', 'test']) {
  const root = new URL(`../${directory}/`, import.meta.url);
  for (const name of await readdir(root)) {
    if (name.endsWith('.mjs')) execFileSync(process.execPath, ['--check', fileURLToPath(new URL(name, root))], { windowsHide: true, stdio: 'inherit' });
  }
}
console.log('JavaScript 语法检查通过。');
