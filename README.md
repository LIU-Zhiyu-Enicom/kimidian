# Kimidian

在 Obsidian 右侧边栏嵌入 Kimi Code CLI，让 Kimi 直接成为你的笔记仓库 AI 协作者。

通信协议：ACP（Agent Client Protocol，JSON-RPC over stdio），插件作为 ACP client spawn `kimi.exe acp` 子进程并驱动会话。

## 功能

- **侧边栏聊天**：用户 / 助手气泡、Markdown 流式渲染、思考内容折叠、工具调用折叠块（工具名 + 状态 + 目标文件）。
- **权限审批**：文件修改 / 命令执行前在聊天内联显示「允许一次 / 始终允许 / 拒绝」按钮；设置里可开启 YOLO 自动批准（默认关闭）。
- **历史会话**：顶部「历史」按钮列出当前 vault 的过往会话（基于 kimi acp 的 `session/list`），点击恢复并继续对话（`session/load`）。
- **知识库联动**：
  - 发送时自动附带当前活动笔记路径（可在设置关闭）。
  - 输入 `@` 触发笔记补全，选中的笔记内容以 `<file path="...">` 注入当条消息（超过 2 万字符自动截断）。
  - 命令「发送选中文本到 Kimi 聊天」+ 编辑器右键菜单。
- **底部状态栏**：当前模型（可下拉切换）、连接状态、YOLO 开关。
- **中断生成**：生成中点击「停止」触发 `session/cancel`。

## 安装（开发版）

1. 安装 [Kimi Code CLI](https://moonshotai.github.io/kimi-code/)，并在终端运行 `kimi login` 完成登录。
2. 构建：`npm install && npm run build`。
3. 把整个文件夹（含 `main.js`、`manifest.json`、`styles.css`）复制到 `<你的vault>/.obsidian/plugins/kimidian/`。
4. 在 Obsidian 设置 → 第三方插件中启用 Kimidian；在插件设置里确认 CLI 路径。

## 使用

- 点击左侧丝带图标，或命令面板执行「打开 Kimi 聊天侧边栏」。
- 输入问题回车发送；`@` 引用笔记；生成中点「停止」中断。
- 「新对话」开启全新会话；「历史」恢复过往会话。

## 冒烟测试

```bash
node scripts/smoke-acp.mjs            # 仅 initialize 握手
node scripts/smoke-acp.mjs --prompt   # 加测 session/new + 流式 prompt（需已登录）
```
