# Kevin v1.5 — 退化修复 + AppHeader 功能层设计

**日期：** 2026-05-07  
**状态：** 已审批，待实施  
**范围：** 基于人工走查（2026-05-07）识别的退化问题（R 类）与新增 UX 缺陷（W 类）  
**策略：** 方案 A — 外科手术（以当前代码为基准，精确补回被删接线层，保留整改 UX 成果）

---

## 1. 问题背景

整改提交 `2fc80e8`（Kevin v1.5 UAT 全量整改）在完成 UX 架构改进的同时，过度简化了
`App.tsx → AppShell → AppHeader / LeftSidebar` 的 prop 传递链，导致以下系统性退化：

### 1.1 走查发现问题（W 类）

| ID | 区域 | 描述 | 严重度 |
|----|------|------|--------|
| W-01 | 顶部导航 | Drafts / Published / Reviews / Archive 标签冗余，与产品信息架构无关，应移除 | P1 |
| W-02 | 灵动岛 | 视觉像输入框，缺少状态指示器语义（当前组件结构已正确，接线修复后即可）| P0 |
| W-03 | 顶部工具栏 | 设置、通知、Export、Share 按钮全部无响应 | P0 |
| W-04 | 用户头像 | 不可点击；需设计账户菜单（方向：账户与身份，含用户名/邮箱/退出登录）| P1 |
| W-05 | 左栏导航 | Skill Store、自动化、搜索按钮点击无响应 | P0 |

### 1.2 代码退化（R 类）

| ID | 层级 | 退化内容 | 影响范围 |
|----|------|----------|----------|
| R-01 | `App.tsx` | `ConfigProvider` / `KevinGate` / `OnboardingWizard` / `SettingsPanel` 全部从渲染树移除 | 设置面板消失；配置加载丢失；onboarding 断裂 |
| R-02 | `AppShell.tsx` | `centerView` 路由状态、`notifOpen`、所有 prop 向下传递删除 | SkillStore、AutomationCenter 打不开；通知面板无法触发 |
| R-03 | `AppHeader.tsx` | 增加无关 Nav Tabs；移除全部 `onClick` handler 和 props | 所有顶部按钮哑火 |
| R-04 | `LeftSidebar.tsx` | 移除三个导航 props；连接器数据改为硬编码静态值 | 左栏导航按钮全部无响应；连接器状态不真实 |
| R-05 | `SessionContext.tsx` | `spaceId` / `setSpaceId` 从 Context 移除 | 所有 sidecar API 调用失去 space 作用域，多空间隔离失效 |
| R-06 | `useDynamicIslandState.ts` | API 从 `(spaceId, activeTitle)` 改为 `(events[])`，且 AppShell 未正确接线 | 灵动岛永远显示 idle 态 |
| R-07 | `RightPanel.tsx` | 失去 `spaceId` 引用，`qsSpace()` 调用消失 | 多 space 下聊天记录跨 space 污染 |

---

## 2. 设计原则

- **不动 UX 结构**：Space 底部锚点、LeftSidebar 文档库/连接器 IA 拆分、DynamicIsland 组件、Space 切换逻辑全部保留。
- **只补接线层**：恢复 prop 传递链和状态管理，不引入新的架构模式。
- **保留整改测试**：所有整改已有测试（Space、Island、RightPanel）不改接口，不破坏测试覆盖。
- **YAGNI**：Export / Share 保留视觉占位但不实现业务逻辑（v1.5 范围外）。

---

## 3. 架构设计

### 3.1 状态层级

```
App.tsx                          ← 配置层
  ConfigProvider
  └── KevinGate
        ├── OnboardingWizard     （未完成配置时）
        └── SessionProvider
              └── ArtifactProvider
                    └── AppShell  ← 路由层
                          ├── settingsOpen state → SettingsPanel
                          ├── notifOpen state   → NotificationCenter
                          ├── centerView state  → CenterPanel / SkillStore / AutomationCenter
                          │
                          ├── AppHeader（接收 5 个 props）
                          │     ├── onOpenSettings
                          │     ├── onOpenNotifications
                          │     ├── islandState（DynamicIslandState）
                          │     ├── notifyBadge（boolean）
                          │     └── Avatar → AccountMenu
                          │
                          └── LeftSidebar（接收 3 个 props）
                                ├── onOpenSkillStore
                                ├── onOpenAutomation
                                └── onOpenSearch
```

### 3.2 DynamicIsland 事件驱动模型

保留当前整改版 `events[]` 驱动模型。AppShell 监听 `kevin:island-event` 自定义事件，
聚合后传递给 `AppHeader`，再由 `AppHeader` 传入 `DynamicIsland`。事件来源保持不变
（RightPanel streaming 中 `emitIslandEvent` 已实现）。

```
RightPanel.emitIslandEvent(event)
  → window.dispatchEvent('kevin:island-event')
    → AppShell listener → events[] state
      → useDynamicIslandState(events) → DynamicIslandState
        → AppHeader props → DynamicIsland render
```

### 3.3 AccountMenu（新增，W-04）

轻量下拉，`<button>` 包裹头像，click-outside 关闭。

内容：
1. 用户名（从 ConfigContext 读取，fallback 显示"用户"）
2. 邮箱（若无则不显示）
3. 分隔线
4. **退出登录** — 语义为"清除本地配置并重启 onboarding 流程"（v1.5 无真实账户服务）

---

## 4. 逐文件改动说明

### 4.1 `app/src/contexts/SessionContext.tsx`

**变更：**
- 恢复 `spaceId: string` 和 `setSpaceId(id: string)` 到 Context 类型定义和 Provider state
- `refreshSessions` 的 fetch URL 恢复 `qsSpace(spaceId)` 作用域
- 保留 `switchToSessionSpace`（整改改进，不动）
- 恢复深链支持：`?space_id=` URL 参数覆盖持久化 vault

### 4.2 `app/src/components/layout/RightPanel.tsx`

**变更：**
- 从 `useSession()` 取回 `spaceId`
- 恢复所有 `fetch` 调用加 `qsSpace(spaceId)`（会话加载、任务轮询、签批队列）
- 保留 `emitIslandEvent`、过程追踪器、`processToolCalls` 等整改成果

### 4.3 `app/src/App.tsx`

**变更：**
- 恢复 `ConfigProvider` 包裹全树
- 恢复 `KevinGate` 函数组件（含 loading 状态、sidecar 连接失败提示、onboarding 跳转判断）
- 恢复 `settingsOpen` state + `SettingsPanel` 渲染
- `AppShell` 接收 `onOpenSettings={() => setSettingsOpen(true)}`

### 4.4 `app/src/components/layout/AppShell.tsx`

**变更：**
- 恢复 `onOpenSettings` prop
- 恢复 `centerView: 'editor' | 'skillstore' | 'automation'` state
- 恢复 `notifOpen` state + `<NotificationCenter>` 渲染
- 恢复 AppShell 内的 island event listener（`kevin:island-event`）→ `events[]` state
- `AppHeader` 接收完整 5 个 props
- `LeftSidebar` 接收 3 个导航 props
- 中栏三路切换渲染逻辑

### 4.5 `app/src/components/layout/AppHeader.tsx`

**变更：**
- 删除 Nav Tabs（Drafts / Published / Reviews / Archive）整块（W-01）
- 恢复 `onOpenSettings` / `onOpenNotifications` / `islandState` / `notifyBadge` props
- 恢复通知、设置按钮 `onClick` handler
- 头像 `<div>` 改为 `<button>`，接入 `<AccountMenu>`（W-04）
- Export / Share：**整块移除**，不保留视觉占位

### 4.6 `app/src/components/layout/LeftSidebar.tsx`

**变更：**
- 恢复 `onOpenSkillStore` / `onOpenAutomation` / `onOpenSearch` props
- 恢复 `spaceId` 从 `useSession()` 获取
- 恢复 `pendingSignoffSessionIds` 轮询，加回 `qsSpace(spaceId)` 作用域
- 连接器数据：尝试从 sidecar `/connectors` 拉取，404 或失败时 fallback 到硬编码静态数据
- 保留 Space 底部锚点、文档库/连接器 IA 拆分（整改成果，不动）

### 4.7 `app/src/components/layout/AccountMenu.tsx`（新增）

轻量下拉组件。接口：

```ts
type AccountMenuProps = {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement>
}
```

行为：click-outside 关闭，Escape 关闭，绝对定位于头像按钮右下方。

---

## 5. 验收标准

### 退化还原（R 类）

- [ ] 点击设置齿轮 → SettingsPanel 弹出，可修改模型/API Key 并保存
- [ ] 点击通知铃铛 → NotificationCenter 面板展开/收起
- [ ] 点击头像 → AccountMenu 下拉，显示用户名/邮箱，可触发退出登录（跳 onboarding）
- [ ] 左栏 Skill Store → 中栏切换为 SkillStore 视图
- [ ] 左栏自动化 → 中栏切换为 AutomationCenter 视图
- [ ] 切换 Space 后，聊天记录、任务列表不跨 space 混入
- [ ] 灵动岛在任务执行中显示 running 态，waiting signoff 显示红色告警态
- [ ] 应用启动未配置时跳 OnboardingWizard；已配置直接进入主界面

### 新增能力（W 类）

- [ ] 顶部无 Drafts / Published / Reviews / Archive 标签（W-01）
- [ ] 灵动岛是状态条，无 caret / placeholder（W-02）
- [ ] 头像菜单含用户信息 + 退出登录（W-04）

---

## 6. 风险与缓解

| 风险 | 可能性 | 缓解措施 |
|------|--------|----------|
| `qsSpace` 工具函数在当前版本被移除 | 中 | 实现时先检查 `sidecarUrl.ts`，缺失则补回 |
| NotificationCenter / SkillStore / AutomationCenter 依赖了被删的 Context 字段 | 中 | 每个组件接入前先运行 `tsc --noEmit` 检查类型错误 |
| 连接器 `/connectors` sidecar 端点不存在 | 高 | 直接 fallback 硬编码，不阻塞主链路 |
| AccountMenu 退出登录语义不清晰 | 中 | 实现为"清除配置 + 重启 onboarding"，按钮文案写"重置配置" |
| ConfigContext 接口与 OnboardingWizard 不兼容 | 低 | 实现前读文件确认 `onComplete` prop 接口 |

---

## 7. 执行顺序（依赖拓扑）

```
Step 1: SessionContext    — 加回 spaceId（其他所有文件依赖此）
Step 2: RightPanel        — 加回 qsSpace 作用域
Step 3: App.tsx           — 加回配置层
Step 4: AppShell          — 加回路由层 + 完整 prop 传递
Step 5: AppHeader         — 移除 Nav Tabs + 接线 + AccountMenu
Step 6: LeftSidebar       — 加回导航 props + 连接器动态化
Step 7: 全量冒烟测试       — 验收标准逐项核查
```

---

## 8. 超出范围

- Export / Share 按钮（已从 AppHeader 中移除，不在本次或后续 v1.5 范围内）
- 连接器 sidecar 端点的实现（后端未规划）
- 历史会话置顶/存档/折叠（已在前轮 UX 走查报告记录，下一 sprint）
- 中右视觉重心优化（下一 sprint）
