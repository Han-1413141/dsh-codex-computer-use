import { readdir, readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, resolve, dirname, isAbsolute, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

async function inspect(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@oai/sky') throw new Error('skyDir 必须指向 @oai/sky 包目录。');
  const require = createRequire(join(root, 'package.json'));
  const entry = require.resolve('@oai/sky');
  return { root, entry, version: manifest.version };
}

/** Resolve the public package entry; the SDK owns the native helper protocol. */
export async function discoverSky({ skyDir, localAppData = process.env.LOCALAPPDATA, platform = process.platform } = {}) {
  if (platform !== 'win32') throw new Error('此版本需要 Windows 宿主；请在 Windows 侧的 DSH 安装。');
  const explicit = skyDir || process.env.DSH_CODEX_SKY_DIR;
  if (explicit) return inspect(explicit);
  const runtimeRoot = join(localAppData || join(homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'runtimes', 'cua_node');
  let versions;
  try { versions = await readdir(runtimeRoot, { withFileTypes: true }); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    throw new Error('未找到 Codex computer use 运行时。请安装 Codex 桌面版并启用 Computer Use，或设置 skyDir / DSH_CODEX_SKY_DIR。');
  }
  const candidates = await Promise.all(versions.filter(x => x.isDirectory()).map(async x => {
    const root = join(runtimeRoot, x.name, 'bin', 'node_modules', '@oai', 'sky');
    try { return { ...(await inspect(root)), modified: (await stat(dirname(dirname(root)))).mtimeMs }; }
    catch { return null; }
  }));
  const found = candidates.filter(Boolean).sort((a, b) => b.modified - a.modified || a.root.localeCompare(b.root));
  if (!found.length) throw new Error('Codex 目录中没有可加载的 @oai/sky。请在 Codex 中初始化一次 Computer Use 后重试。');
  return found[0];
}

/** The native SDK helper needs codex.exe even when the Codex desktop UI is closed. */
export async function discoverCodexCli({ codexPath, localAppData = process.env.LOCALAPPDATA, env = process.env } = {}) {
  const exists = async path => {
    if (typeof path !== 'string' || !isAbsolute(path) || extname(path).toLowerCase() !== '.exe') return false;
    try { return (await stat(path)).isFile(); } catch { return false; }
  };
  const explicit = codexPath || env.DSH_CODEX_CLI_PATH;
  if (explicit) {
    if (!await exists(explicit)) throw new Error('codexPath / DSH_CODEX_CLI_PATH 必须指向存在的 codex.exe 绝对路径。');
    return resolve(explicit);
  }
  if (await exists(env.CODEX_CLI_PATH)) return resolve(env.CODEX_CLI_PATH);
  const root = join(localAppData || join(homedir(), 'AppData', 'Local'), 'OpenAI', 'Codex', 'bin');
  let directories = [];
  try { directories = await readdir(root, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const paths = [join(root, 'codex.exe'), ...directories.filter(x => x.isDirectory()).map(x => join(root, x.name, 'codex.exe'))];
  const installed = (await Promise.all(paths.map(async path => {
    if (!await exists(path)) return null;
    return { path, modified: (await stat(path)).mtimeMs };
  }))).filter(Boolean).sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
  if (installed.length) return installed[0].path;
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  for (const directory of pathValue.split(';')) {
    const clean = directory.trim().replace(/^"(.*)"$/, '$1');
    if (!isAbsolute(clean)) continue;
    const path = join(clean, 'codex.exe');
    if (await exists(path)) return path;
  }
  throw new Error('未找到 codex.exe。请安装或更新 Codex 桌面版，或设置 codexPath / DSH_CODEX_CLI_PATH；无需修改系统 PATH。');
}

export async function loadSky(options = {}) {
  const runtime = await discoverSky(options);
  const codexCliPath = await discoverCodexCli(options);
  // This module is loaded in our isolated worker; never write user/system environment settings.
  process.env.CODEX_CLI_PATH = codexCliPath;
  const { sky } = await import(pathToFileURL(runtime.entry).href);
  const methods = ['list_windows', 'list_apps', 'get_window_state', 'click', 'type_text', 'press_key', 'scroll', 'drag', 'set_value', 'perform_secondary_action', 'activate_window', 'launch_app'];
  if (sky?.target !== 'windows' || methods.some(method => typeof sky[method] !== 'function')) {
    throw new Error(`@oai/sky ${runtime.version} 与所需 Windows API 不兼容。`);
  }
  return { sky, runtime: { ...runtime, codexCliPath } };
}
