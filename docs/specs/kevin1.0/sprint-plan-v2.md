# Kevin MVP — Sprint 计划 v2（架构审查修正版）

> **文档状态**: 生效中 (Active)
> **更新日期**: 2026-05-03
> **取代**: `sprint-plan.md`（旧版 Sprint 1-4 规划）
> **触发原因**: Agent Network Architecture（`agent-network-architecture.md`）落地后，对现有代码和设计的系统性 Review，发现若干需纠正的架构偏差。

---

## 1. 架构回顾：四层模型与当前实现的对比

`agent-network-architecture.md` 确立的四层职责边界：

```
Layer 1: Runtime    (KyberKit 引擎) — AgentLoop、PromptAssembler、Memory...
Layer 2: Agent Def  (agents/kevin/) — 产品人格、<artifact> 协议、权限策略
Layer 3: Workspace  (spaces/default/) — 用户记忆、知识库、技能库
Layer 4: Terminal   (app/)           — Kevin 桌面端，终端之一，非 Runtime 本体
```

### 1.1 已正确落地的架构决策 ✅

| 架构约束 | 落地状态 | 代码位置 |
|---|---|---|
| Agent 产品定义移出 `.env` | ✅ 已完成 | `agents/kevin/kevin.agent.ts` |
| `<artifact>` 协议放入 `directives.md` | ✅ 已完成 | `agents/kevin/directives.md` |
| `AgentProductDef` 类型契约 | ✅ 已完成 | `src/types/agent-product.ts` |
| `PlatformDirectiveProvider` 注入 | ✅ 已完成 | `src/prompt/providers/PlatformDirectiveProvider.ts` |
| `KYBER_AGENT_DEF` 指向 Agent 定义 | ✅ 已完成 | `.env` |
| Sidecar 接入 KyberRuntime | ✅ 已完成 | `src-sidecar/index.ts` |
| 三面板 UI Shell | ✅ 已完成 | `app/src/components/layout/` |

### 1.2 发现的架构偏差（需纠正）⚠️

#### 偏差 1 — Sidecar 硬编码 Workspace 路径 [**严重**]

**现状**：

```ts
// src-sidecar/index.ts line 11
process.chdir('/Users/shawn/Data/Kyberkit/spaces/default/data')
```

**问题**：
1. 与 `KyberRuntime.bootstrap()` 内部的 `resolveWorkspacePaths({ cwd: process.cwd(), ... })` 产生竞争 — `chdir` 改变了 cwd，进而影响 Runtime 的 workspace 路径推导，但两者实际上是分离推导逻辑，极易不一致。
2. Tauri 打包后，此绝对路径不存在于用户机器，必然 crash。
3. 违背了四层架构中 Workspace 层由 Runtime 统一管理的原则（Sidecar 不应直接操控 Workspace 路径）。

**修正方向**：移除 `process.chdir`，改由 `.env` 的 `KYBER_WORKSPACE_ROOT` 或 Tauri 的 sidecar 启动参数传入工作目录。

---

#### 偏差 2 — 单例 Session（Singleton Session）[**中等**]

**现状**：

```ts
// src-sidecar/index.ts
const session = await runtime.createSession({ reliability: 'inmemory' })
// 所有 /chat 请求打到同一个 session
```

**问题**：
1. 左侧面板设计（"Recent Artifacts"）要求每次 "New" 触发一个新会话，这在单例下无法实现。
2. 没有 `sessionId` 隔离，不同对话上下文互相干扰。
3. `inmemory` 模式下，Sidecar 重启后会话全部丢失，与 Sprint 4 的持久化目标矛盾。

**修正方向**：Sidecar 实现多会话 API（`POST /sessions`, `GET /sessions`, `POST /sessions/:id/messages`），使左侧面板能列举并切换会话。

---

#### 偏差 3 — Artifact 事件桥接是 DOM 侧 Hack [**中等**]

**现状**：  
`RightPanel.tsx` 通过字符串 regex 扫描 AI 输出，当检测到完整的 `<artifact>...</artifact>` 后，调用 `window.dispatchEvent(new CustomEvent('kyber:artifact_update', ...))` 跨组件通信。

**问题**：
1. **非流式**：必须等到 `</artifact>` 闭合后才触发，用户看不到 Artifact 渐进构建的过程。
2. **脆弱**：内容分片（SSE chunk split）可能使 `</artifact>` 落在不同 chunk，导致正则误判。
3. **组件耦合**：`RightPanel` ↔ `CenterPanel` 通过 DOM 事件隐式耦合，违背 React 数据流单向性。

**修正方向**：Sidecar 在解析 SSE 流时检测 `<artifact>` 边界，主动发射结构化事件（`artifact_start`, `artifact_delta`, `artifact_end`）；前端通过 React Context 或 Zustand 管理 artifact 状态，CenterPanel 订阅该状态。

---

#### 偏差 4 — 左侧面板 / 中间面板全为 Mock 数据 [**中等**]

**现状**：
- `LeftSidebar.tsx`：`RECENT_ARTIFACTS`、`CONTEXT_SOURCES` 全为硬编码常量。
- `CenterPanel.tsx`：固定 3 个 Tab（`PRD文档`/`数据图表`/`RCA报告`），单个 Milkdown 实例。

**问题**：无法反映真实会话状态；多产物并行工作无法实现。

**修正方向**：Sprint 3 中将两者对接 Sidecar 的会话 API，实现动态数据驱动。

---

## 2. Sprint 完成状态总览

| Sprint | 主题 | 状态 | 说明 |
|---|---|---|---|
| Sprint 1 | Foundation & UI Shell | ✅ **完成** | 三面板、Milkdown、SSE 通信全部交付 |
| Sprint 2 | Context & MCP | 🔄 **进行中** | Task 2.1/2.3 已完成；Task 2.2/2.4 待收尾；3 个架构偏差待修正 |
| Sprint 3 | Sessions & Scenario A | 📋 **待启动** | 见 `sprint3-Sessions&ScenarioA.md` |
| Sprint 4 | Polish & Tauri | 📋 **待启动** | Demo 封版 + 桌面端打包 |

---

## 3. Sprint 2 — 收尾任务清单（当前迭代）

> 详见 `sprint2-Context&MCP.md`（更新版）。

| 任务 | 优先级 | 状态 |
|---|---|---|
| Task 2.1 — KyberRuntime 接入 | P0 | ✅ Done |
| Task 2.2 — Filesystem MCP 验证 | P0 | ⬜ Pending |
| Task 2.3 — 轨迹面板动态化 | P0 | ✅ Done |
| Task 2.4 — Artifact SSE 事件协议（重新设计） | P0 | ⬜ Rewrite needed |
| Task 2.5 — **[新增]** 修复 Sidecar 硬编码路径 | P0 | ⬜ Pending |

---

## 4. Sprint 3 — Sessions & Scenario A（下一迭代）

> 详见 `sprint3-Sessions&ScenarioA.md`。

**目标**：实现多会话生命周期管理 + SQLite 持久化 + 端到端打通 Scenario A。

核心任务概览：

| 任务 | 优先级 |
|---|---|
| Task 3.1 — 多会话 Sidecar API | P0 |
| Task 3.2 — SQLite 会话 & Artifact 持久化 | P0 |
| Task 3.3 — 左侧面板动态化（会话列表） | P0 |
| Task 3.4 — CenterPanel 多 Artifact Tab 管理 | P0 |
| Task 3.5 — Filesystem MCP 端到端验证（从 Sprint 2 延续） | P0 |
| Task 3.6 — Scenario A 编排（站会数据 → Spec 生成） | P1 |
| Task 3.7 — 快速启动指令区（Onboarding） | P1 |

---

## 5. Sprint 4 — Polish & Tauri（封版迭代）

**目标**：CTO 演示准备，Tauri 桌面端打包，种子用户分发。

| 任务 | 优先级 |
|---|---|
| Task 4.1 — Tauri 2.0 壳集成（Sidecar 自动启停） | P0 |
| Task 4.2 — `.dmg` / `.app` 生产打包验证 | P0 |
| Task 4.3 — Feishu Doc MCP（MVP 只读版） | P1 |
| Task 4.4 — Demo 剧本 & 种子用户 Onboarding | P0 |
| Task 4.5 — 高优 Bug 修复 & 体验打磨 | P0 |

---

## 6. 关键设计约束（全局生效）

以下约束由 `agent-network-architecture.md` 确立，所有 Sprint 任务必须遵守：

1. **Runtime 层不感知 Agent 产品定义**：`KyberRuntime` 只负责执行，Agent 的名称/协议/权限策略均从 `agents/<id>/` 加载，不硬编码在 Runtime 代码中。
2. **Workspace 路径由 Runtime 统一解析**：任何地方（Sidecar、Terminal）均不得 `chdir` 或硬编码 Workspace 绝对路径，统一通过 `KYBER_WORKSPACE_ROOT`/`KYBER_WORKSPACE_ID` 等 env 变量配置。
3. **Terminal 层（app/）不持有业务状态**：会话列表、Artifact 内容均从 Sidecar API 读取，Terminal 只渲染状态，不成为数据源。
4. **SSE 事件规范**：Sidecar 输出的 SSE 事件必须包含 `artifact_start` / `artifact_delta` / `artifact_end` 类型，不依赖 Terminal 侧 regex 解析来识别 Artifact 边界。

---

## 7. 修订记录

| 日期 | 修订内容 |
|---|---|
| 2026-05-03 | 初版：基于 Agent Network Architecture Review 创建，取代旧 `sprint-plan.md` |
