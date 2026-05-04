# Kevin MVP — Sprint 2 技术设计规范 (Context & MCP)

> **Sprint**: Sprint 2 — Context & MCP
> **目标**: 废弃 Sidecar 的 Mock 数据，全面接入工程核心的 `KyberRuntime` 引擎；激活 `filesystem` MCP 让 Agent 能读取本地文件作为 Context；并在右侧面板展示 `KyberKit` 原生的真实思考轨迹 (Trajectory)。
> **核心选型**: KyberKit `KyberRuntime` / `AgentSession` + 官方 `@modelcontextprotocol/server-filesystem`
>
> **⚠️ 修订说明 (2026-05-03)**: 根据 `agent-network-architecture.md` 的 Review，Task 2.4 需重新设计；同时增补 Task 2.5（修复架构偏差）。最新状态见各任务标注。
>
> **实现态与设计总览 (2026-05-04)**：Sidecar、SSE、Artifact 管道、环境变量与 Tauri 行为见 [kevin-system-design.md](kevin-system-design.md)；Filesystem MCP 验收步骤见 [mcp-filesystem-runbook.md](mcp-filesystem-runbook.md)；路线图见 [sprint-plan-v2.md](sprint-plan-v2.md)。

---

## 1. 微任务分解 (Execution Plan)

### Task 2.1 — KyberKit 核心引擎接入 (KyberRuntime & Event Stream) ✅ [已完成]
- **目标**: 将 Sidecar 转型为 KyberKit 的标准客户端，直接挂载 `KyberRuntime`。
- **具体动作**:
  1. 重写 `src-sidecar/index.ts`，引入 `KyberRuntime` 并调用 `bootstrap()`。
  2. 建立 `inmemory` 或 `real` 模式的 `AgentSession`。
  3. 将前端的用户消息通过 `session.send(userMessage)` 发送，并将生成的 `AsyncGenerator<AgentEvent>` 流（如 `text_delta`, `tool_use_start`, `task_narration` 等）以 JSON 格式包装在 SSE 中直接推给前端。
- **验收**: 右侧聊天框可获得基于 `.env` 配置的真实大模型回复。

### Task 2.2 — 激活官方本地文件 MCP (Filesystem MCP) ⬜ [待验证]
- **目标**: 无需造轮子，直接利用 KyberKit 对 MCP 的原生支持，赋予 Agent 读写本地文件的能力。
- **具体动作**:
  1. 在根目录的 `.env` 中解开 `MCP Servers` 的注释配置。
  2. 配置 `KYBER_MCP_SERVER_1_COMMAND=npx` 和 `ARGS=-y,@modelcontextprotocol/server-filesystem,<项目绝对路径>`。
  3. 重启 Sidecar。
- **验收**: 向 Agent 提问本地 `docs/` 下的某个文件内容，Agent 能够自主调用 `read_file` 工具读取并准确回答。

### Task 2.3 — 轨迹面板 (Trajectory UI) 动态化 ✅ [已完成]
- **目标**: 前端需能精确解析并展示 KyberKit 引擎吐出的标准事件栈。
- **具体动作**:
  1. 修改 `RightPanel.tsx`，监听 SSE 中的 `text_delta` 进行文字追加。
  2. 监听 `tool_use_start` 和 `task_narration` 事件，并在气泡内上方渲染轨迹胶囊（Tool Calls Trajectory）。
  3. 解决 React StrictMode 导致的 State 状态突变（Mutation）与文字重复渲染问题（引入浅拷贝防污染）。
- **验收**: Agent 调用工具时，用户能清晰看到 `🛠️ Using tool: read_file` 等状态。

### Task 2.4 — 产物更新协议（Artifact SSE Event Protocol）⚠️ [需重新设计]

> **原设计问题**: 旧设计方案"分析 KyberKit 是否内置 `edit_file` 工具"方向错误。`<artifact>` 协议已通过 `agents/kevin/directives.md` 正式确立，且已验证可工作。但当前 Terminal 侧的实现是 hack：`RightPanel.tsx` 在客户端通过字符串扫描识别 `<artifact>` 边界，然后用 `window.dispatchEvent` 跨组件广播，存在非流式、脆弱、违背 React 单向数据流等问题。

**修正后的目标**: Sidecar 在 SSE 流中主动发射结构化 Artifact 事件；前端通过状态管理（React Context）传递，CenterPanel 订阅渲染。

**修正后的具体动作**:

1. **Sidecar 端 (`src-sidecar/index.ts`)**：
   在流式输出处理逻辑中，增加 `ArtifactStreamParser`：
   - 检测 `<artifact>` 开始标记 → 发射 `{ type: 'artifact_start' }` SSE 事件
   - 将 `<artifact>...</artifact>` 内的文字增量 → 发射 `{ type: 'artifact_delta', text: '...' }` 事件
   - 检测 `</artifact>` 闭合 → 发射 `{ type: 'artifact_end' }` 事件
   - `<artifact>` 内容不再放入 `text_delta` 流（避免在聊天气泡中重复显示）

2. **前端状态管理**：
   新增 `ArtifactContext`（或 Zustand store），持有当前活跃 Artifact 的内容：
   ```ts
   interface ArtifactState {
     sessionId: string
     content: string
     streaming: boolean
   }
   ```
   `RightPanel.tsx` 在收到 `artifact_start/delta/end` 事件时 dispatch 更新，而非直接操控 DOM。

3. **CenterPanel 订阅**：
   `CenterPanel.tsx` 订阅 `ArtifactContext`，当 `content` 变化时调用 Milkdown 的 `editor.action(replaceAll(content))`，取代 `window.addEventListener('kyber:artifact_update', ...)`。

**验收**: 
- Agent 开始写 Artifact 时，`CenterPanel` 随流式输出逐步更新内容（不再等 `</artifact>` 闭合才刷新）。
- 聊天气泡中显示"📄 正在更新主画布文档..."占位符，而非原始 `<artifact>` 文本。

---

### Task 2.5 — **[新增]** 修复 Sidecar 硬编码 Workspace 路径 ⬜ [待修复]

> **触发**: `agent-network-architecture.md` Review 发现的架构偏差 1。

**目标**: 移除 `src-sidecar/index.ts` 中的 `process.chdir(...)` 硬编码，改由 env 变量配置，保证 Tauri 打包后 Workspace 路径仍有效。

**具体动作**:

1. 删除 `src-sidecar/index.ts` 第 11 行：`process.chdir('/Users/shawn/Data/Kyberkit/spaces/default/data')`
2. 在 `.env` 中新增（或确认已有）以下配置项，供 Runtime 的 `resolveWorkspacePaths` 使用：
   ```
   KYBER_WORKSPACE_ROOT=/Users/shawn/Data/Kyberkit/spaces
   KYBER_USER_NAME=default
   KYBER_WORKSPACE_ID=default
   ```
3. 更新 `.env.example` 中对应注释，说明各变量含义。
4. 在 Tauri 的 `tauri.conf.json`（Sprint 4）中，通过 `sidecar.env` 传入正确的路径（基于 `$HOME` 或应用数据目录）。

**验收**: 删除 `process.chdir` 后，`bun src-sidecar/index.ts` 能正常启动，Agent 能访问 Workspace（记忆、知识库等读写正常）。
