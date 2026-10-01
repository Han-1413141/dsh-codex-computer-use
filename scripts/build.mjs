import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/browser.mjs'],
  write: false, bundle: true, platform: 'browser', format: 'cjs',
  target: 'es2022', minify: true, external: ['react'],
  tsconfigRaw: { compilerOptions: { alwaysStrict: true } },
});
const output = `window.__ModuleLoader__.load({id:"dsh-codex-computer-use",factory(require){const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;}});\n`;
await mkdir(new URL('../lib/', import.meta.url), { recursive: true });
await writeFile(new URL('../lib/client.js', import.meta.url), output, 'utf8');
console.log(`Computer Use 菜单已构建：${Buffer.byteLength(output)} 字节。`);
