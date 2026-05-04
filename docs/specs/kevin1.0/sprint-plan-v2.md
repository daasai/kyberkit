# Kevin MVP — Sprint 计划 v2（架构审查修正版）

> **文档状态**: 生效中 (Active)
> **更新日期**: 2026-05-04
> **系统设计主文档**: [kevin-system-design.md](kevin-system-design.md)（进程、API、SSE、环境变量、Tauri 生命周期）
> **规格索引**: [README.md](README.md)
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

### 1.2 架构偏差（历史审计，已纠正）✅

以下条目来自 2026-05 架构 Review，**当前主干已实现纠正**；行为级说明、端口、Tauri 启停与代码边界见 **[kevin-system-design.md](kevin-system-design.md)**（文内第九节「历史架构偏差与纠正状态」）。

| 偏差 | 主题 | 纠正结果 |
|------|------|----------|
| 1 | Sidecar 硬编码 `chdir` | 已移除；Workspace 由 env / Runtime 解析 |
| 2 | 单例 Session | 多会话 API + `SessionManager` + SQLite |
| 3 | DOM 事件传 Artifact | `ArtifactParser` + SSE + `ArtifactContext` |
| 4 | 左/中面板 Mock | 对接 `/sessions`、动态 Tab、Milkdown 订阅 |

---

## 2. Sprint 完成状态总览

| Sprint | 主题 | 状态 | 说明 |
|---|---|---|---|
| Sprint 1 | Foundation & UI Shell | ✅ **完成** | 三面板、Milkdown、SSE 通信全部交付 |
| Sprint 2 | Context & MCP | ✅ **主体完成** | Runtime、Trajectory、Sidecar `ArtifactParser` + 前端 `ArtifactContext` 已落地；Task 2.2 MCP 需各环境自行验收 |
| Sprint 3 | Sessions & Scenario A | ✅ **完成** | 多会话、SQLite、动态会话列表、Center 多 Tab、`templates.ts`、快速启动、Tab 切换拉取 artifact；MCP 验收见 [mcp-filesystem-runbook.md](mcp-filesystem-runbook.md) |
| Sprint 4 | Polish & Tauri | ✅ **P0 完成** | Tauri 2 + `externalBin` Sidecar + 资源打包 + `kevin.env`；`npm run verify:kevin` 与 `tauri build` 已验证；DMG 为可选 target；飞书 MCP 仍为 P1 延期 |

---

## 3. Sprint 2 — 收尾任务清单（当前迭代）

> 详见 `sprint2-Context&MCP.md`（更新版）。

| 任务 | 优先级 | 状态 |
|---|---|---|
| Task 2.1 — KyberRuntime 接入 | P0 | ✅ Done |
| Task 2.2 — Filesystem MCP 验证 | P0 | ⬜ 各环境验收（配置见 `.env.example`） |
| Task 2.3 — 轨迹面板动态化 | P0 | ✅ Done |
| Task 2.4 — Artifact SSE 事件协议（重新设计） | P0 | ✅ Done（Sidecar `ArtifactParser` + SSE；前端 Context） |
| Task 2.5 — **[新增]** 修复 Sidecar 硬编码路径 | P0 | ✅ Done（已移除 `process.chdir`，依赖 env） |

---

## 4. Sprint 3 — Sessions & Scenario A

> 详见 [sprint3-Sessions&ScenarioA.md](sprint3-Sessions%26ScenarioA.md)。**实现态摘要**见 [kevin-system-design.md](kevin-system-design.md)。

**目标**（已达成主干）：多会话 + SQLite + 动态 UI + Scenario A / 快速启动。

| 任务 | 优先级 | 状态 |
|---|---|---|
| Task 3.1 — 多会话 Sidecar API | P0 | ✅ Done |
| Task 3.2 — SQLite 会话 & Artifact 持久化 | P0 | ✅ Done |
| Task 3.3 — 左侧面板动态化（会话列表） | P0 | ✅ Done |
| Task 3.4 — CenterPanel 多 Artifact Tab 管理 | P0 | ✅ Done |
| Task 3.5 — Filesystem MCP 端到端验证 | P0 | ⬜ 各环境按 [mcp-filesystem-runbook.md](mcp-filesystem-runbook.md) 执行 |
| Task 3.6 — Scenario A 编排（站会数据 → Spec 生成） | P1 | ✅ Done（模板 + 快速启动 Prompt） |
| Task 3.7 — 快速启动指令区（Onboarding） | P1 | ✅ Done（`app/src/data/templates.ts` + RightPanel） |

---

## 5. Sprint 4 — Polish & Tauri（封版迭代）

**目标**：CTO 演示准备，Tauri 桌面端打包，种子用户分发。

| 任务 | 优先级 | 状态 |
|---|---|---|
| Task 4.1 — Tauri 2.0 壳集成（Sidecar 自动启停） | P0 | ✅ Done（dev：`bun`+源码；release：`externalBin` + `KYBER_SPACES_ROOT` / `KYBERKIT_ENV_FILE`） |
| Task 4.2 — `.dmg` / `.app` 生产打包验证 | P0 | ✅ `.app` 已验证构建；`npm run verify:kevin` 验证 Sidecar 二进制；DMG 见 [demo-and-packaging.md §3.1](demo-and-packaging.md) |
| Task 4.3 — Feishu Doc MCP（MVP 只读版） | P1 | ⏸️ 延期（无凭据）— [feishu-mcp-roadmap.md](feishu-mcp-roadmap.md) |
| Task 4.4 — Demo 剧本 & 种子用户 Onboarding | P0 | ✅ [demo-and-packaging.md](demo-and-packaging.md) + `npm run verify:kevin` |
| Task 4.5 — 高优 Bug 修复 & 体验打磨 | P0 | 🔄 持续（非 blocking） |

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
| 2026-05-04 | 同步代码现状：Sprint 2/3 完成度、Task 2.4/2.5 状态；注明 Sprint 3 剩余（templates 抽取、Tab 切换 artifact、MCP 验收） |
| 2026-05-04 | 引入 `kevin-system-design.md`、runbook、demo 文档；§1.2 改为历史审计表；Sprint 3/4 任务表加状态列；Tauri 开发态 Sidecar 启停落地说明 |
| 2026-05-04 | Sprint 4：`externalBin` 编译 Sidecar、`bundle.resources`、release 启动路径、`verify:kevin`；`.app` 构建与冒烟通过；DMG target 暂关；飞书 MCP P1 明确延期 |
