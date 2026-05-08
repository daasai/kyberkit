# Kevin v1.5 — 实施基线审计（Task 0）

**日期：** 2026-05-07  
**对照规格：** [`docs/superpowers/specs/2026-05-07-kevin15-regression-fix-and-header-design.md`](../../../superpowers/specs/2026-05-07-kevin15-regression-fix-and-header-design.md)  
**代码快照：** 仓库当前 `app/src`、`src-sidecar/index.ts`

---

## 1. 退化规格 §4 逐条对照

| ID | 规格要求 | 当前实现 | 状态 |
|----|-----------|-----------|------|
| **4.1 SessionContext** | `spaceId` / `setSpaceId`、`refreshSessions` 带 `qsSpace(spaceId)` | 已有 `spaceId`/`setSpaceId`；`refreshSessions` URL 含 `qsSpace(spaceId)` | **部分**：`refreshSessions` 的 `useCallback` 依赖曾为 `[]`，存在 **陈旧 `spaceId` 闭包**（已修复为依赖 `spaceId`） |
| **4.2 RightPanel** | 全部 fetch 加 `qsSpace(spaceId)` | `sessions/:id`、`messages` 已带 | **已实现**（`rg` 已核对） |
| **4.3 App.tsx** | ConfigProvider、KevinGate、SettingsPanel | `App.tsx` 已具备 | **已实现** |
| **4.4 AppShell** | centerView、通知、灵动岛事件、LeftSidebar props | 已具备 `centerView`、`NotificationCenter`、岛事件、`LeftSidebar` 三 prop | **已实现** |
| **4.5 AppHeader** | 无 Draft Nav Tabs；通知/设置接线；AccountMenu | 无 Tabs；按钮有 `onClick`；头像 + `AccountMenu` | **已实现** |
| **4.6 LeftSidebar** | 三导航 props、`spaceId`、`pendingSignoff` 带 `qsSpace`、连接器拉取 | props 已传；签批轮询带 `qsSpace(spaceId)`；`/connectors` 拉取 + fallback | **已实现** |
| **4.6 延伸** | 底部 Space 切换语义 | **`GET /spaces` + `listDiscoveredSpaces`，菜单遍历 Space；当前窗口内 `setSpaceId`**；`openSpaceInNewWindow` 保留供「新开窗口」场景（UI 未默认绑定） | **已实现（2026-05-07 Task 1）** |
| **4.6 历史会话** | （走查 UAT-010） | 历史列表曾共用 `handleSelectSession` → 新开窗口 | **已修复**：历史行改为 `setActiveSessionId` in-place |

---

## 2. Sidecar 与客户端约定

| 项目 | 说明 |
|------|------|
| `GET /sessions` | 当前 **未解析** `space_id` query（`src-sidecar/index.ts` 直接 `manager.list()`）。客户端 `qsSpace` 对列表 **暂不生效**，多 Space 会话隔离需在 Sidecar 扩展（实施计划 Task 1/6）。 |
| `POST /sessions` | 未带 Space；多 Space 创建后续对齐。 |

---

## 3. 走查相关缺口（不在 Task 0 闭合）

| UAT | 说明 |
|-----|------|
| 003 | `onOpenSearch` 仍仅 `setCenterView('editor')`，无独立搜索视图 |
| 004 | Skill Store CTA |
| 006-B | 文档库 Obsidian 向 UI |
| 011～015 | Toolbar、Input Toolbar、过程追踪等 — 按实施计划后续 Task |

---

## Phase 0 检查点

- [x] 差异表落库（本文档）
- [x] RightPanel `qsSpace` 抽样核对
- [x] AppHeader 无无关 Tabs、按钮接线存在
- [x] **可靠性**：`refreshSessions` 随 `spaceId` 更新
- [x] **UAT-010**：历史会话 in-place 切换会话
