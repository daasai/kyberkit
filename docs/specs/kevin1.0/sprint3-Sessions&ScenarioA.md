# Kevin MVP — Sprint 3 技术设计规范 (Sessions & Scenario A)

> **Sprint**: Sprint 3 — Sessions & Scenario A
> **目标**: 完成多会话生命周期管理 + SQLite 持久化，让左侧面板和中间面板从静态 Mock 变为真实数据驱动；同时端到端打通 Scenario A（站会数据 → 产品升级 Spec）。
> **前置条件**: Sprint 2 全部 5 个任务完成（含 Task 2.5 架构修复）
>
> **实现态与设计总览 (2026-05-04)**：多会话、SQLite、UI 数据流与 Tauri 侧说明见 [kevin-system-design.md](kevin-system-design.md)；任务完成度见 [sprint-plan-v2.md](sprint-plan-v2.md) §4；演示与打包见 [demo-and-packaging.md](demo-and-packaging.md)。

---

## 1. 背景：为什么 Sessions 比 Scenario A 优先

旧 Sprint 3（`sprint-plan.md`）原本直接攻 Scenario A，但 Agent Network Architecture Review 揭示了一个根本问题：**左侧面板仍是硬编码 Mock 数据，CenterPanel 只有单实例编辑器**。在这个基础上跑 Scenario A，虽然技术可行，但：

1. 演示时无法"切换会话、恢复产物"，无法体现产品价值。
2. SQLite 持久化如果留到 Sprint 4，则 Scenario A 的演示结果无法在重启后保留（影响种子用户使用）。
3. 多会话 API 是连接 Terminal 层与 Runtime/Workspace 层的关键接口，早建立早受益。

因此，本 Sprint 将 Sessions/持久化 + Scenario A 合并完成。

---

## 2. Sidecar API 重设计（多会话）

### 2.1 新增端点规范

| 方法 | 路径 | 描述 |
|---|---|---|
| `GET` | `/sessions` | 列举所有会话（从 SQLite 读取），返回 `[{ id, title, createdAt, artifactPreview }]` |
| `POST` | `/sessions` | 创建新会话，返回 `{ id, title, createdAt }` |
| `DELETE` | `/sessions/:id` | 删除会话及其 Artifact 记录 |
| `GET` | `/sessions/:id` | 获取单个会话详情（含完整 Artifact 内容） |
| `POST` | `/sessions/:id/messages` | 向指定会话发送消息，SSE 流式返回（替代旧 `/chat`） |

> **向后兼容**: 旧 `/chat` 端点保留但 deprecated，内部重定向到 `POST /sessions/default/messages`。

### 2.2 Session 对象结构

```ts
interface Session {
  id: string           // UUID
  title: string        // 自动生成（用户首条消息前5个字）或手动命名
  createdAt: string    // ISO 8601
  updatedAt: string
  artifactContent?: string  // 最新 Artifact 的 Markdown 内容（可为空）
}
```

### 2.3 SSE 事件规范（完整版）

所有 SSE 事件均为 JSON，`POST /sessions/:id/messages` 返回以下类型：

```ts
// 已有（Sprint 2 沿用）
{ type: 'text_delta', text: string }
{ type: 'tool_use_start', toolName: string }
{ type: 'tool_result', toolName: string, success: boolean }
{ type: 'task_narration', text: string }
{ type: 'turn_complete', turnNumber: number }
{ type: 'error', error: { message: string } }

// Sprint 3 新增（Artifact 协议）
{ type: 'artifact_start', sessionId: string }
{ type: 'artifact_delta', text: string }
{ type: 'artifact_end', sessionId: string }

// Sprint 3 新增（会话元数据更新）
{ type: 'session_updated', session: Session }  // Artifact 保存完成后触发，左侧面板据此刷新
```

---

## 3. 微任务分解 (Execution Plan)

### Task 3.1 — 多会话 Sidecar API

**目标**: 实现 Session CRUD，Sidecar 从单例 Session 演进为多 Session 管理器。

**具体动作**:

1. 新建 `src-sidecar/SessionManager.ts`：
   ```ts
   class SessionManager {
     private sessions = new Map<string, AgentSession>()
     
     async create(runtime: KyberRuntime): Promise<{ id: string; session: AgentSession }>
     async get(id: string): AgentSession | undefined
     async list(): SessionMeta[]
     async delete(id: string): Promise<void>
   }
   ```

2. 重写 `src-sidecar/index.ts`，注册新路由：
   - `GET /sessions` → `sessionManager.list()`
   - `POST /sessions` → `sessionManager.create(runtime)` → 返回新 Session 元数据
   - `DELETE /sessions/:id` → `sessionManager.delete(id)`
   - `POST /sessions/:id/messages` → 通过 `sessionManager.get(id)` 取 session，发消息，SSE 流

3. 会话标题自动生成：收到第一条用户消息后，取前 20 字作为 `title`。

**验收**:
- `curl -X POST http://localhost:3001/sessions` 返回新 session id。
- `curl http://localhost:3001/sessions` 列出所有 sessions。
- `curl -X POST http://localhost:3001/sessions/:id/messages -d '{"message":"你好"}'` 返回 SSE 流。

---

### Task 3.2 — SQLite 会话 & Artifact 持久化

**目标**: 会话列表和 Artifact 内容在 Sidecar 重启后仍然保留。

**具体动作**:

1. 安装 `bun:sqlite`（Bun 内置，无需额外安装）。

2. 新建 `src-sidecar/db.ts`，初始化 SQLite（路径从 `KYBER_WORKSPACE_ROOT` 推导）：
   ```sql
   CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL DEFAULT 'New Session',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   
   CREATE TABLE IF NOT EXISTS artifacts (
     session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
     content TEXT NOT NULL DEFAULT '',
     updated_at TEXT NOT NULL
   );
   ```

3. `SessionManager` 集成 DB：
   - `create()` → INSERT sessions
   - `list()` → SELECT + LEFT JOIN artifacts（返回 artifact 前 100 字作 preview）
   - `delete()` → DELETE（CASCADE 自动删 artifacts）
   - Artifact 更新：收到 `artifact_end` 事件后，UPSERT artifacts 表

4. Sidecar 启动时，从 DB 读取已有 sessions，为每个 session 重建 `AgentSession`（`inmemory` 模式下消息历史不会持久化，但至少 Artifact 内容可恢复）。

**验收**:
- 创建会话、发送消息生成 Artifact 后，重启 Sidecar，`GET /sessions` 仍能返回该会话及其 Artifact 内容。

---

### Task 3.3 — 左侧面板动态化（会话列表）

**目标**: 移除 `LeftSidebar.tsx` 中硬编码的 `RECENT_ARTIFACTS`，从 Sidecar `/sessions` API 实时读取。

**具体动作**:

1. 新建 `app/src/hooks/useSessions.ts`：
   ```ts
   function useSessions() {
     const [sessions, setSessions] = useState<Session[]>([])
     // GET /sessions polling (or WebSocket in future)
     // ...
     return { sessions, createSession, deleteSession, refresh }
   }
   ```

2. 修改 `LeftSidebar.tsx`：
   - "New" 按钮调用 `createSession()` → 触发左侧列表刷新 + 通知 CenterPanel/RightPanel 切换到新 session
   - 会话列表按 `updatedAt` 倒序排列
   - 每个会话项展示 `title` + `updatedAt` 相对时间
   - 激活态（当前打开的 session）高亮 + 左侧 primary 色竖条（已有 CSS 样式）

3. 新增 `SessionContext`（React Context）：
   ```ts
   interface SessionContextType {
     activeSessionId: string | null
     setActiveSessionId: (id: string) => void
   }
   ```
   传递给 `RightPanel`（发送消息用）和 `CenterPanel`（渲染 Artifact）。

**验收**:
- 点击 "New" 创建会话后，左侧列表出现新条目。
- 点击左侧某个历史会话，`CenterPanel` 加载其 Artifact 内容，`RightPanel` 切换到对应会话的消息目标（发送消息走 `POST /sessions/:newId/messages`）。

---

### Task 3.4 — CenterPanel 多 Artifact Tab 管理

**目标**: CenterPanel 的 Tab Bar 改为动态化，每个打开的会话对应一个 Tab，点击左侧会话列表可在 Tab 中打开。

**具体动作**:

1. 修改 `CenterPanel.tsx`：
   - Tab 数组改为受控状态 `openTabs: Session[]`（由 `SessionContext` 驱动）
   - 每个 Tab 对应一个 `sessionId`，点击 Tab 切换活跃 Artifact
   - Tab 右侧有 `×` 关闭按钮（关闭 Tab 不删除会话，只从 UI 移除）
   - 当一个 Tab 对应的 session 是活跃 session 时，Milkdown 订阅 `ArtifactContext` 的流式更新

2. `ArtifactContext`（Sprint 2 Task 2.4 中已规划）：
   - `RightPanel` 消费 SSE 中的 `artifact_delta` 事件，写入 `ArtifactContext`
   - `CenterPanel` 订阅 `ArtifactContext`，仅当 `activeSessionId` 匹配时更新编辑器

3. 首次打开历史 session 时，从 `GET /sessions/:id` 获取 `artifactContent`，调用 `editor.action(replaceAll(content))` 初始化。

**验收**:
- 打开两个不同会话，CenterPanel 出现两个 Tab，切换 Tab 切换内容。
- Agent 流式生成 Artifact 时，Tab 对应的内容随流逐步更新。

---

### Task 3.5 — Filesystem MCP 端到端验证

> 从 Sprint 2 Task 2.2 延续（原 Sprint 2 仅描述配置步骤，未执行验证）。

**目标**: 确认 Agent 能通过 Filesystem MCP 读取 `spaces/default/data/` 下的本地 Markdown 文件。

**具体动作**:

1. 确认 `.env` 中 Filesystem MCP 配置已解注释：
   ```
   KYBER_MCP_SERVER_1_NAME=filesystem
   KYBER_MCP_SERVER_1_COMMAND=npx
   KYBER_MCP_SERVER_1_ARGS=-y,@modelcontextprotocol/server-filesystem,<KYBER_WORKSPACE_ROOT>/default/data
   ```

2. 在 `spaces/default/data/` 下放置一个测试文件（如 `commands/README.md`，已存在）。

3. 向 Agent 发送：`"请读取 commands/README.md 的内容并总结"`，观察轨迹面板是否出现 `read_file` 工具调用。

**验收**: Agent 正确调用 `read_file`，轨迹面板展示工具调用状态，回复内容来自实际文件。

---

### Task 3.6 — Scenario A 编排（站会数据 → 产品升级 Spec）

**目标**: 端到端跑通演示核心场景：Agent 读取本地模板 + 数据文件 → 在 CenterPanel 生成完整 Spec 文档。

**MVP 数据准备**（无需真实 BI 接口，用本地文件模拟）：

在 `spaces/default/data/` 下预置：
```
templates/
├── product-spec-template.md   ← 产品升级 Spec 模板
└── standup-data.md            ← 模拟昨日站会数据（含交易量、异常数、用户增长）
```

**具体动作**:

1. 创建以上两个模板文件（内容见设计文档 `kevin-product-plan-mvp.md` 的场景 A 描述）。
2. 准备一条"一键触发"的 Prompt：
   ```
   基于本地的 templates/standup-data.md 中的昨日站会数据，
   使用 templates/product-spec-template.md 模板，
   生成一份针对贝易转的产品功能升级 Spec 文档。
   ```
3. 在 `LeftSidebar.tsx` 的模板库区域，添加"📊 站会数据 → Spec"快捷按钮，点击后：
   - 自动创建新 session
   - 注入上述 Prompt
   - 开始 Agent 执行

4. 验证整个流程：Agent 调用 `read_file` 读取两个模板文件 → 生成 `<artifact>` 内容 → CenterPanel 流式渲染结果。

**验收**: 点击快捷按钮，30 秒内 CenterPanel 出现完整的 Markdown Spec 文档（含标题、背景、功能点列表、数据支撑）。

---

### Task 3.7 — 快速启动指令区（Onboarding）

**目标**: 用户首次进入时，左侧面板展示预置模板，而不是空列表，降低上手门槛。

**具体动作**:

1. 在 `LeftSidebar.tsx` 顶部导航区新增"快速启动"区域，展示 3-5 个预置场景按钮：
   ```
   ⚡ 生成今日站会数据
   📋 起草产品升级 Spec
   🔍 发起异常 RCA 分析
   ```

2. 每个按钮对应一个 `TemplateConfig`（id、label、icon、prompt），数据写在 `app/src/data/templates.ts` 中：
   ```ts
   export const QUICK_TEMPLATES: TemplateConfig[] = [
     {
       id: 'standup',
       label: '生成今日站会数据',
       icon: 'bar_chart',
       prompt: '基于本地的 templates/standup-data.md...',
     },
     // ...
   ]
   ```

3. 仅在会话列表为空时，将 Quick Start 区域展示在 Recent Artifacts 上方（首次进入引导）；有会话时收起为折叠状态。

**验收**: 新用户首次打开，看到快速启动按钮；点击任意按钮，自动创建会话并触发 Agent 执行。

---

## 4. 数据流全景（Sprint 3 后的系统状态）

```
用户点击"快速启动"
    ↓
LeftSidebar → POST /sessions → SessionManager.create()
    ↓
SessionManager → AgentSession (runtime) → AgentLoop → LLM
    ↓
SSE 事件流:
  text_delta  →  RightPanel 消息气泡
  artifact_start → ArtifactContext.startStreaming()
  artifact_delta → ArtifactContext.appendDelta()
  artifact_end   → ArtifactContext.endStreaming() → DB UPSERT
  session_updated → LeftSidebar 列表刷新
    ↓
ArtifactContext → CenterPanel Milkdown (当前活跃 Tab 实时更新)
```

---

## 5. 文件结构变更

```
src-sidecar/
├── index.ts             ← 路由注册（重写）
├── SessionManager.ts    ← 新增：多会话管理
└── db.ts                ← 新增：SQLite CRUD

app/src/
├── contexts/
│   ├── SessionContext.tsx    ← 新增：活跃 session 状态
│   └── ArtifactContext.tsx   ← 新增（Sprint 2 Task 2.4 已规划）
├── hooks/
│   └── useSessions.ts        ← 新增：sessions API
├── data/
│   └── templates.ts          ← 新增：快速启动模板
└── components/layout/
    ├── LeftSidebar.tsx    ← 修改：动态会话列表 + 快速启动
    ├── CenterPanel.tsx    ← 修改：动态 Tab + Artifact 订阅
    └── RightPanel.tsx     ← 修改：发消息走 /sessions/:id/messages

spaces/default/data/
└── templates/
    ├── product-spec-template.md   ← 新增
    └── standup-data.md            ← 新增
```

---

## 6. 验收标准（Definition of Done）

| # | 验收项 | 验收方式 |
|---|---|---|
| 1 | 创建/删除会话 API 可用 | curl 验证 |
| 2 | 会话在 Sidecar 重启后持久化 | 重启后 `GET /sessions` 仍有记录 |
| 3 | 左侧面板展示真实会话列表 | UI 交互验证 |
| 4 | 点击左侧会话恢复 CenterPanel 内容 | UI 交互验证 |
| 5 | Agent 通过 Filesystem MCP 读取本地文件 | 轨迹面板展示 `read_file` 调用 |
| 6 | Artifact 流式更新（不等 `</artifact>` 闭合）| 观察 CenterPanel 渐进渲染 |
| 7 | 快速启动按钮端到端跑通 Scenario A | 生成完整 Spec 文档 |

---

## 7. 明确不做（Out of Scope — Sprint 3）

- ❌ Feishu Doc MCP（推迟到 Sprint 4）
- ❌ BI Data 真实接口（用本地文件模拟）
- ❌ Tauri 打包（推迟到 Sprint 4）
- ❌ `@` 提及自动完成 UI（推迟到 Sprint 4）
- ❌ 消息历史跨重启持久化（仅持久化 Artifact 内容，LLM 对话历史仍为 inmemory）
