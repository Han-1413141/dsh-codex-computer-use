# DSH Codex Computer Use

让 DSH 直接调用本机 Codex 的 Windows Computer Use：读取窗口和控件、获取截图、点击、输入、按键、滚动、拖动、启动应用。由 DSH 当前使用的模型决定操作，不需要额外调用 OpenAI 模型。

插件调用本机安装的 `@oai/sky`，通过 DSH 原生工具返回文字和图片。首次访问应用的授权请求会显示在 DSH 中；批准后，仅在本次 DSH 会话中记住该应用。

**不需要先打开 Codex 主窗口，也不需要保持 Codex 聊天运行。** 首次调用工具时，插件自动启动后台工作进程。本机 Computer Use 辅助程序内部会启动 `codex app-server`；从 **0.1.2** 起，插件自动查找已安装的 `codex.exe`，并将路径传给自己的工作进程，无需手工设置系统 PATH。后续调用复用工作进程，插件卸载或 DSH 退出时结束。此过程不会打开 Codex 主界面；本机仍需安装 Codex 并完成 Computer Use 运行时初始化。

详细步骤见 [使用说明](docs/使用说明.md)。这是社区插件，使用本机 Codex 运行时，不是 OpenAI 官方第三方接口。

## 安装

需要 Windows、DSH **0.2.0-rc.2**、已安装并初始化 Computer Use 的 Codex 桌面版。当前实测 Codex 提供的 `@oai/sky` 为 **0.7.5**。若 DSH 的模型不支持图片，仍可读取控件树，但无法让模型直接看截图。

本包未发布到 npm。从 [GitHub Releases](https://github.com/Han-1413141/dsh-codex-computer-use/releases) 下载安装包，再执行：

```powershell
dsh plugin --profile desktop add "C:\路径\dsh-codex-computer-use-0.1.2.tgz" --ignore-scripts
```

从源码目录安装前，先在源码目录执行 `npm install` 和 `npm run build`，再安装：

```powershell
dsh plugin --profile desktop add "C:\路径\dsh-codex-computer-use" --ignore-scripts
```

重新启动 DSH 后，点击输入框左下角的 **＋**，在列表中选择 **Computer Use**，或输入 **`/computer`** 后选择该项。入口位于“指令”列表末尾，窗口较小时向下滚动即可看到。插件会在草稿前填入电脑操作提示；补充任务后发送即可。原生菜单会替换当前选中的文字，因此需要保留草稿时，将光标放到文字末尾再选择。选择菜单本身不会启动后台进程或提交消息，模型首次调用工具时才启动。

也可以直接在聊天中输入：

> 使用 codex_computer_read 检查 Computer Use 状态，列出窗口，然后读取我指定的窗口。需要首次授权时在 DSH 中请求我确认。

操作示例：

> 使用 Codex Computer Use，在记事本的新文档里输入“你好，DSH”。先检查窗口和输入焦点，每步操作后检查结果。

## 两个工具

| 工具 | 操作 |
| --- | --- |
| `codex_computer_read` | `status`、`list_windows`、`list_apps`、`get_window_state` |
| `codex_computer_action` | `launch_app`、`click`、`type_text`、`press_key`、`set_value`、`scroll`、`drag`、`perform_secondary_action`、`activate_window` |

典型调用顺序：

1. `list_windows` 获取实际窗口编号。
2. `get_window_state` 传入 `window_id`，获取截图、控件树、`observation_id`。
3. 阅读结果，然后执行一个动作。动作须携带最近的 `observation_id`；坐标操作还要携带该截图的 `screenshot_id`。
4. 动作会自动返回新观察。下一次操作使用新编号。

`status` 只确认接口已加载并定位 CLI，返回 `runtime_loaded: true` 和 `native_call_verified: false`。成功执行 `list_windows` 才能证明原生进程可以启动；`doctor` 会完成这一步并报告 `native_call_verified: true`。

控件点击示例：

```json
{"action":"click","observation_id":"上次返回的标识","element_index":2}
```

截图默认开启。只读控件树时传 `include_screenshot: false`。坐标使用截图元数据中的原始逻辑尺寸；图片在模型端缩小时，需要按返回的显示尺寸换算。优先使用控件编号。

操作已发出但刷新失败、超时或取消时，返回结果会说明状态。此时先重新观察，不能直接重试输入，以免重复点击或重复输入。

## 授权与配置

插件遵守 DSH 的会话权限。桌面访问不受工作区目录限制，因此处于 `read-only` / `workspace-write` 的会话会请求本次桌面操作授权。Codex 的首次应用授权还会通过 DSH 单独确认；该授权按 DSH 会话和原生应用标识保存于内存，重启或卸载后清除。

发送、提交、删除、付款、共享等要求当次确认的操作，使用 `confirm: true` 和具体 `reason`。这一参数由调用方按任务选择；插件不能仅从一个鼠标坐标判断所有业务后果。

DSH 的 `danger-full-access` 预设通常把审批策略设为 `never`，这会拒绝首次应用授权，而不是自动同意。若看到拒绝或没有审批入口，请使用能够弹出审批的 DSH 界面和权限模式。插件不会改写你的全局权限策略。

插件条目支持以下配置；均可省略：

```yaml
- id: dsh-codex-computer-use
  config:
    timeoutMs: 30000
    observationTtlMs: 120000
    # skyDir: 'C:\...\node_modules\@oai\sky'
    # codexPath: 'C:\...\codex.exe'
    # allowedApps:
    #   - 'process:C:\Windows\System32\notepad.exe'
```

`skyDir` 指向 `@oai/sky` 的包目录，也可设置环境变量 `DSH_CODEX_SKY_DIR`。默认从 `%LOCALAPPDATA%\OpenAI\Codex\runtimes\cua_node` 查找最新安装目录。`allowedApps` 使用 `list_windows` 或 `list_apps` 返回的完整应用标识；空数组表示不额外限制应用列表。

`codexPath` 或 `DSH_CODEX_CLI_PATH` 可指定 CLI 的绝对路径。默认优先使用有效的 `CODEX_CLI_PATH`，然后查找 `%LOCALAPPDATA%\OpenAI\Codex\bin\<版本目录>\codex.exe`，最后检查进程 PATH；自动查找会跳过不完整安装。路径只写入插件的独立工作进程。

若旧版出现 `failed to launch codex app-server: program not found`，更新到 0.1.2 并重启 DSH。该错误不要求你手动打开 Codex，也不能通过改成“免批准”解决。

## 检查与卸载

源码目录中执行：

```powershell
npm run doctor
npm test
npm run check
npm run test:startup
```

`doctor` 只加载运行时和枚举窗口，输出版本与窗口数量，不点击或输入。卸载：

```powershell
dsh plugin --profile desktop remove dsh-codex-computer-use
```

## 实现与验证范围

工具在独立 Node.js 工作进程中调用 `@oai/sky` 的公开方法，通过父子进程 IPC 与 DSH 通信，不开放 HTTP 端口，也不接受任意 JavaScript。插件只依赖本机运行时，没有复制或分发 OpenAI 的实现和原生程序。

独立进程中的应用授权使用 `@oai/sky 0.7.5` 已有的 elicitation 回调接入 DSH。这个宿主回调不是稳定的第三方扩展规范；Codex 更新后若改变回调或 API，需要更新适配代码。所有授权均由 DSH 的审批服务作出，缺少审批入口或拒绝时停止调用。

已验证真实 DSH 宿主加载、原生窗口枚举、测试应用截图、控件点击、文字输入和 DSH 图片附件回传。模型回复由本地 HTTP 测试程序提供，没有调用付费模型；这证明工具调用链可用，不代表已经测试任意模型对任意应用的操作效果。

0.1.2 另外使用 DSH 桌面端自带的 Electron 可执行程序验证启动：清除子进程继承的 `CODEX_*`、`SKY_*` 变量和 Codex 的 PATH 条目后，仍能自动找到 CLI 并完成原生窗口枚举。此检查没有截图、点击或输入。

见 [验证记录](docs/validation.md)、[实际宿主结果](docs/host-validation.json) 和 [第三方说明](docs/third-party-notices.md)。
