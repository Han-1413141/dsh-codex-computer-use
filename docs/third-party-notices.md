# 第三方组件说明

本插件源码使用 MIT 许可证。DeepSeek Harness 的包由宿主提供，遵循其自身许可证。

`@oai/sky` 及原生 Computer Use 运行时由用户的 Codex 安装提供，属于 OpenAI。此安装包不含该 SDK、原生程序或账户凭据；本插件的 MIT 许可证不适用于这些外部组件。本插件不是 OpenAI 或 DeepSeek 的官方插件。

实现依据包括本机 Computer Use 插件的 `docs/api.md`、本机 `@oai/sky 0.7.5` 的公开入口与授权回调，以及 DSH 0.2.0-rc.2 的工具、附件和审批接口。

[OpenAI Computer Use 文档](https://developers.openai.com/api/docs/guides/tools-computer-use)说明了由客户端执行界面操作并返回图像的工作方式；此项目使用的是本机 Codex 运行时，并未连接 Responses API。
