# Kevin v1.5 UAT 改进实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 [`uat_improvement_plan_2026-05-07.md`](../../specs/kevin1.5/UAT/uat_improvement_plan_2026-05-07.md) 与 [`uat_walkthrough_live_log_2026-05-07.md`](../../specs/kevin1.5/UAT/uat_walkthrough_live_log_2026-05-07.md) 将 P0 缺陷与专题依赖项落地；每步可测试、可合并；走查条目状态最终推进到 `verified`。

**Architecture:** 以 **Sidecar HTTP API + React 三栏（`app/src`）** 为边界：先收敛 **Space / 会话语义** 与 **qsSpace 作用域**，再交付侧栏/中栏/右栏功能；大型 IA（文档库树 Obsidian 向、Header 迁移、右栏套件）在专题会议拍板后开独立 PR 链。

**Tech Stack:** Bun（根目录 `npm test`）、Vite + React 19（`app/`）、Vitest + Testing Library（`app`）、Sidecar（`src-sidecar/index.ts`）、可选 Tauri（`open_and_focus_space_window`）。

**前置阅读：**

- 退化修复规格（接线意图）：[`2026-05-07-kevin15-regression-fix-and-header-design.md`](../specs/2026-05-07-kevin15-regression-fix-and-header-design.md)  
- 当前树已与该规格 **部分对齐**（例如 `App.tsx` 已有 `ConfigProvider`/`KevinGate`，`AppShell` 已有 `centerView`、灵动岛事件）；实施前先执行 **Task 0** 做差异表，避免重复劳动。

---

## 文件结构（实施期会改动的核心路径）

| 区域 | 路径 | 职责 |
|------|------|------|
| 入口 | `app/src/App.tsx` | Config / Onboarding / SessionProvider |
| 壳层 | `app/src/components/layout/AppShell.tsx` | 三栏、`centerView`、通知、`AppHeader`/`LeftSidebar` props |
| 会话与 Space | `app/src/contexts/SessionContext.tsx` | `spaceId`、`sessions`、`switchToSessionSpace`（当前误用于会话→窗口） |
| 侧栏 | `app/src/components/layout/LeftSidebar.tsx` | 底部「Space」菜单当前遍历 **sessions**（UAT-009 根因） |
| 右栏 | `app/src/components/layout/RightPanel.tsx` | 对话流、`qsSpace`、岛事件 |
| 中栏 | `app/src/components/layout/CenterPanel.tsx` | 制品展示 |
| Sidecar | `src-sidecar/index.ts` | `/sessions` 等；**待增** Space 列表类路由（Task 2） |
| Tauri | `app/src/lib/tauriSpace.ts` | `open_and_focus_space_window` |
| 测试 | `app/src/**/*.test.tsx`、`app/src/**/*.test.ts` | Vitest |

---

## Phase 0 — 基线与规格对齐

### Task 0: 退化规格 vs 当前代码差异表

**Files:**

- Read: `app/src/App.tsx`, `app/src/components/layout/AppShell.tsx`, `app/src/components/layout/AppHeader.tsx`, `app/src/components/layout/RightPanel.tsx`, `docs/superpowers/specs/2026-05-07-kevin15-regression-fix-and-header-design.md` §4

- [ ] **Step 1:** 建一张 Markdown 表（可追加到本计划末尾或 `docs/specs/kevin1.5/UAT/uat_remediation_2026-05-06.md`）：逐条规格 **已实现 / 部分 / 未实现**，附文件与行级备注。

- [ ] **Step 2:** 对 **RightPanel** 运行 `rg 'qsSpace\\(spaceId\\)' app/src/components/layout/RightPanel.tsx`（或读文件），确认所有需带 Space 的 fetch 已带 query。

- [ ] **Step 3:** 对 **AppHeader** 确认设置/通知按钮已接线（点击有 handler）；若 Nav Tabs 仍存在则删（W-01）。

- [ ] **Step 4:** Commit（若仅有文档）：`docs: UAT implementation baseline audit`

**验收：** 团队确认 Phase 0 表；未闭合项进入 Phase 1 对应 Task。

---

## Phase 1 — 地基：Space 语义（UAT-009）与 Sidecar

### Task 1: 定义「Space 列表」数据源

**背景：** `LeftSidebar.tsx` 底部菜单使用 `sessions.map` 作为 Space 行（见约 408–452 行），`switchToSessionSpace` 把 **session id** 传给 `openAndFocusSpace`（`SessionContext.tsx` 99–104），与 PRD §7.E 不符。

**Files:**

- Modify: `src-sidecar/index.ts`（新增 `GET /spaces` 或等价）
- Read: `src/runtime/paths/PathResolver.ts`（或项目中枚举 Space 目录的现有工具）
- Modify: `app/src/contexts/SessionContext.tsx`
- Modify: `app/src/components/layout/LeftSidebar.tsx`
- Modify: `app/src/lib/tauriSpace.ts`（若需区分「切换当前窗口 Space」与「新开 Space 窗口」）
- Test: `app/src/components/layout/LeftSidebar.space.test.tsx`（需更新 mock 含 `spaceId`/`setSpaceId`/spaces 列表）

- [ ] **Step 1:** Sidecar 实现 `GET /spaces` → 返回 `{ id: string, label?: string }[]`，来源为「用户 workspace 下已知 Space 目录」（与 `kevin-v1.5-prd-rev2` 三层路径一致）。若无目录枚举工具，最小实现：返回至少 `default` + `localStorage`/配置中的额外 id。

- [ ] **Step 2:** `SessionContext`：区分 **`setSpaceId`**（当前窗口切换 Space：刷新 sessions、清/换 activeSession、更新文档库作用域）与 **`openSpaceInNewWindow(spaceId)`**（调用 `openAndFocusSpace`，仅用于 PRD「多 Space 多窗口」显式动作）。删除或重命名误导性的 `switchToSessionSpace`（当前名实不符）。

- [ ] **Step 3:** `LeftSidebar` 底部菜单改为遍历 **`spaces`**（来自新 API 或 Context），当前选中项对比 **`spaceId`**；选中另一 Space 时 **`setSpaceId`** + `refreshSessions`，**不**默认 `window.open`。保留「新开窗口」为二级菜单项（可选）并调用 Tauri。

- [ ] **Step 4:** 更新 `LeftSidebar.space.test.tsx`：mock `spaceId`、`spaces` 数组；断言菜单项为 Space id，而非 session title。

**Run tests:**

```bash
cd /Users/shawn/Data/Kyberkit && npm run test:vitest --prefix app -- --run src/components/layout/LeftSidebar.space.test.tsx
```

Expected: PASS。

- [ ] **Step 5:** Commit：`fix(sidebar): space switcher lists spaces and updates spaceId`

**Maps to UAT:** `UAT-20260507-009`

---

### Task 2: 历史会话 in-place（UAT-008 / UAT-010）

**Files:**

- Modify: `app/src/components/layout/LeftSidebar.tsx`（历史会话点击处理）
- Grep: `handleSelectSession`, `scrollIntoView`, `window.open`, `openAndFocusSpace`

- [x] **Step 1:** 定位历史会话列表项 `onClick`：确保仅 `setActiveSessionId(sessionId)` +（如需）滚动右栏；**移除** 会触发 `openAndFocusSpace(sessionId)` 或新开标签的逻辑。

- [x] **Step 2:** 若存在 `?space=` 深链仅用于 Space 窗口，勿与会话 id 混用（见 `SessionContext.tsx` 106–117）。

- [x] **Step 3:** 新增或扩展 Vitest：`LeftSidebar.test.tsx` 中断言点击历史项 **不会** 调用 `window.open`（mock `window.open`）。

**Run tests:**

```bash
npm run test:vitest --prefix app -- --run src/components/layout/LeftSidebar.test.tsx
```

- [x] **Step 4:** 产出「历史会话 PRD 对照清单」小节（可贴在 `uat_walkthrough_live_log` 对应条目备注）：Must：列表、切换会话、中栏制品、右栏流。

**Maps to UAT:** `008`, `010`

---

### Task 3: 全局搜索可用（UAT-003）

**Files:**

- Modify: `app/src/components/layout/AppShell.tsx`（`centerView` 类型扩展）
- Create or Modify: `app/src/components/search/`（新建 `GlobalSearchView.tsx` 或嵌入 `CenterPanel`）
- Modify: `app/src/components/layout/LeftSidebar.tsx`（搜索按钮已有 `onOpenSearch`）

- [x] **Step 1:** 将 `centerView` 扩展为包含 `'search'`（或等价命名）。实际采用 Task 3 设计规格中的等价方案：`searchOpen` 中栏覆盖层，避免替换底层制品主视图。

- [x] **Step 2:** `onOpenSearch` 打开搜索视图，渲染沉浸式搜索 UI（最低限度：可聚焦搜索框；若无 Sidecar 搜索 API，则前端过滤 session 标题 / artifactPreview + 文档库/Sensor 占位说明）。实际为 `() => setSearchOpen(true)`。

- [x] **Step 3:** 手动验收：点击侧栏「搜索」→ 中栏变化且可输入。

**Maps to UAT:** `003`

---

## Phase 2 — Skill Store、连接器、文档库映射

### Task 4: Skill Store CTA（UAT-004）

**Files:**

- Modify: `app/src/components/skill-store/SkillStore.tsx`（或实际渲染「+ 新建私有 Skill」的文件）

- [x] **Step 1:** 若 Forge 落盘流程未就绪：**移除或禁用** CTA，Tooltip「将通过 Forge 蒸馏后确认落盘」（§9）。

- [x] **Step 2:** 若已有创建路由：接通单一入口按钮。当前未发现已接通创建路由，采用禁用 CTA + 说明文案，不新增假入口。

**Maps to UAT:** `004`

---

### Task 5: 连接器真实态（UAT-007）

**Files:**

- Modify: `app/src/components/layout/LeftSidebar.tsx`（`/connectors` fetch 已有则验证）
- Modify: `src-sidecar/index.ts`（若无 `GET /connectors` 则实现聚合状态）

- [ ] **Step 1:** 确认 Sidecar 返回 JSON 与 UI 字段一致；失败时 **非** 静默 fallback 为全绿（可选：标注「演示数据」）。

**Maps to UAT:** `007`

---

### Task 6: 文档库树 — 映射正确性优先（UAT-006-A）

**Files:**

- Grep: `docs`, `library`, `CenterPanel`, Sidecar routes for files

- [ ] **Step 1:** 追踪当前文档库文件树 API（若有）；确保请求带 `qsSpace(spaceId)`。

- [ ] **Step 2:** 修正根路径与 Space 目录不一致的 bug；补 Vitest 或 bun 测试 **mock Sidecar**。

- [ ] **Step 3:** **006-B（Obsidian UI）** 仅在专题会议后单独立项，避免本 Task 膨胀。

**Maps to UAT:** `006`

---

## Phase 3 — 中栏与右栏 PRD 能力

### Task 7: Artifact Toolbar（UAT-011）

**Files:**

- Modify: `app/src/components/layout/CenterPanel.tsx` 或制品子组件

- [ ] **Step 1:** Export / Share / 编辑·预览：接上最小行为（Export MD 到剪贴板或下载；Share 未接飞书则禁用 + 文案）。

**Maps to UAT:** `011`

---

### Task 8: Input Toolbar + Slash（UAT-012）与拖贴（UAT-015）

**Files:**

- Modify: `app/src/components/layout/RightPanel.tsx`

- [ ] **Step 1:** 📎：打开文件选择器 + 上传到 Sidecar 临时附件端点（若无则 base64 贴 message payload，与 runtime 约定）。

- [ ] **Step 2:** `@`：弹出 MentionPopover（文档库 path / skill id 列表）。

- [ ] **Step 3:** `/`：列出已安装 Skill（来自 Skill Store 状态或 Sidecar）。

- [ ] **Step 4:** `paste` / `drop` 监听，统一进附件管线。

**Maps to UAT:** `012`, `015`

---

### Task 9: 过程追踪去重 + 产物链接（UAT-013）

**Files:**

- Modify: `app/src/components/layout/RightPanel.tsx`

- [ ] **Step 1:** 移除与主 chat stream 重复的「原始模型 token 流」渲染；保留结构化步骤列表（tool name、status、耗时）。

- [ ] **Step 2:** 中栏「x 项产物」→ 链接列表，`onClick` 滚动到 `artifact-primary-view` 或切换 `ArtifactProvider` 焦点。

**Maps to UAT:** `013`

---

### Task 10: 快速启动（UAT-014）

- [ ] **Step 1:** 专题会议前：**隐藏或折叠**快速启动，避免占位误导。

- [ ] **Step 2:** 专题会后按决议实现。

**Maps to UAT:** `014`

---

## Phase 4 — 体验增补（UAT-001 / 002 / 005）

### Task 11: 灵动岛非输入框化 + 文案（UAT-001）

- Modify: `app/src/components/layout/DynamicIsland.tsx`、`app/src/hooks/useDynamicIslandState.ts`

### Task 12: Header IA（UAT-002）

- 依赖专题会议；迁移 Search/Skills/自动化至 `AppHeader`，竖线分隔。

### Task 13: 侧栏会话分组（UAT-005）

- Modify: `LeftSidebar.tsx` 区块顺序与 `<hr>` / 标题。

---

## 验证闸门（每 Phase 结束）

- [ ] 根目录：`npm test`（bun + app vitest，按仓库惯例）。
- [ ] 走查冒烟：`uat_improvement_plan` §5 — Space 切换 → 文档库根 → 历史会话单窗口 → 输入区能力。
- [ ] 更新 [`uat_walkthrough_live_log_2026-05-07.md`](../../specs/kevin1.5/UAT/uat_walkthrough_live_log_2026-05-07.md) 对应条目 `fixed` / `verified`。

---

## Plan self-review

| 规格 / UAT | Task 覆盖 |
|------------|-----------|
| WS-0 退化 | Task 0 |
| 009 Space | Task 1 |
| 008/010 | Task 2 |
| 003 搜索 | Task 3 |
| 004 | Task 4 |
| 007 | Task 5 |
| 006 | Task 6 |
| 011 | Task 7 |
| 012/015 | Task 8 |
| 013 | Task 9 |
| 014 | Task 10 |
| 001/002/005 | Task 11–13 |

**占位符扫描：** 无 TBD；006-B、Header、右栏专题明确依赖专题会议。

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-07-kevin15-uat-improvement-implementation-plan.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per Task (0 → 1 → …), review between tasks.
2. **Inline Execution** — Execute tasks in this session with checkpoints after each Phase.

Reply with **1** or **2** (or start with Task 0 in-thread).

---

## Appendix A — Task 0 完成记录（Inline）

- **基线审计文档**：[`docs/specs/kevin1.5/UAT/uat_baseline_audit_2026-05-07.md`](../../specs/kevin1.5/UAT/uat_baseline_audit_2026-05-07.md)
- **代码**：`SessionContext.refreshSessions` 已依赖 `[spaceId]`，并在 `spaceId` 变化时立即 `refreshSessions`；`LeftSidebar` 历史会话行改为 `setActiveSessionId(id)`（**UAT-010** in-place）。
- **Vitest**：`npm run test:vitest --prefix app -- --run` — 8 files / 17 tests passed。

### Appendix B — Task 1（UAT-009）完成记录（Inline）

- **Sidecar**：`GET /spaces` → `listDiscoveredSpaces()`（`src/runtime/paths/PathResolver.ts`）。
- **SessionContext**：`spaces`、`refreshSpaces`、`openSpaceInNewWindow`；移除误导性的 `switchToSessionSpace`。
- **LeftSidebar**：底部切换器绑定 **Space 列表** + **`selectSpaceInCurrentWindow` → `setSpaceId`**（同一窗口）。
- **测试**：`PathResolver.listSpaces.test.ts`（Bun）；`LeftSidebar.space.test.tsx` 覆盖锚点文案、`setSpaceId`。

### Appendix C — Task 2（UAT-008 / UAT-010）完成记录（Inline）

- **LeftSidebar**：历史会话行保持 **in-place**：点击仅 `setActiveSessionId(id)`；未调用 `openSpaceInNewWindow`、`openAndFocusSpace` 或 `window.open`。
- **深链边界**：`openAndFocusSpace` 仅在 Space 级动作中使用 `space_id` query，不与 session id 混用。
- **测试**：`LeftSidebar.test.tsx` 新增历史会话回归用例，覆盖点击 `Chat Two` 会切换 `s2` 且不会打开窗口。
- **UAT 文档**：`uat_walkthrough_live_log_2026-05-07.md` 已落库“历史会话 PRD 对照清单（Must / Should）”；`UAT-20260507-010` 更新为 `verified`，`UAT-20260507-008` 更新为 `fixed`。

### Appendix D — Task 3（UAT-003）完成记录（Inline）

- **AppShell**：采用 Task 3 设计规格中的 `searchOpen` 中栏覆盖层；`LeftSidebar.onOpenSearch` 打开 `GlobalSearchView`，不替换底层 `CenterPanel`。
- **GlobalSearchView**：搜索框自动聚焦；按历史会话 `title` 与 `artifactPreview` 做大小写不敏感过滤；点击结果 `setActiveSessionId(id)` 后关闭弹框。
- **范围控制**：文档库 / Sensor 深度检索仅显示后续索引接线文案，不在本 Task 引入 Sidecar 搜索 API。
- **测试**：`GlobalSearchView.test.tsx` 覆盖空态、过滤、结果点击、Esc 关闭；`AppShell.search.test.tsx` 覆盖侧栏入口打开弹框、输入聚焦、底层编辑视图保持。
- **UAT 文档**：`uat_walkthrough_live_log_2026-05-07.md` 中 `UAT-20260507-003` 更新为 `verified`。

### Appendix E — Task 4（UAT-004）完成记录（Inline）

- **Skill Store**：`我的 Skills` 底部的 `+ 新建私有 Skill` 改为禁用 CTA，`title` 为“将通过 Forge 蒸馏后确认落盘”，并显示同义说明文案。
- **范围控制**：未发现已接通的私有 Skill 创建路由；本 Task 不新增向导/表单，只消除“假可用”承诺。
- **测试**：`SkillStore.test.tsx` 覆盖禁用状态、提示 title 与 Forge 落盘说明。
- **UAT 文档**：`uat_walkthrough_live_log_2026-05-07.md` 中 `UAT-20260507-004` 更新为 `verified`。
