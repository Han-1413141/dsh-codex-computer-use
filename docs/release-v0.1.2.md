首次 GitHub 发布：DSH Codex Computer Use 0.1.2。

- 为 DSH 的“＋”菜单添加 Computer Use，支持 `/computer`。
- 提供读取窗口、截图、点击、输入、按键、滚动、拖动等工具，由 DSH 当前模型调用。
- 修复独立启动 DSH 时的 `failed to launch codex app-server: program not found`：自动定位 Codex CLI，仅配置插件自己的工作进程。
- 状态接口区分接口加载与原生调用验证，首次应用授权通过 DSH 请求人工批准。

安装：下载本 Release 的 `.tgz` 文件，执行 `dsh plugin --profile desktop add "安装包绝对路径" --ignore-scripts`，然后重启 DSH。

需要 Windows、DSH 0.2.0-rc.2，以及已初始化 Computer Use 的 Codex 桌面版。日常使用无需手动打开 Codex 主窗口。

验证：20 项测试、JavaScript 语法检查通过；使用 DSH 桌面端 Electron，在清除 Codex 环境变量和 PATH 条目后，自动定位 CLI 并成功完成原生窗口枚举。本次修复没有重复执行截图与输入测试。

完整说明见仓库的 README 和 `docs/使用说明.md`。未发布到 npm；未包含 OpenAI 的实现、原生程序、本机配置或会话日志。
