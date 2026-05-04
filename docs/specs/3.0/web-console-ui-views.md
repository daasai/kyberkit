# Web Console — 逐视图规格 (3.0 P1-C)

状态: Draft  
范围: Web Console UI 的逐视图定义（不含 API 协议细节、不含部署）  
目标读者: 产品 / 前端实现者

---

## 0. 使用说明

本文件与 `web-console-ui.md`、`web-console-ui-system.md` 配套：

- `web-console-ui.md`: 总览、IA、边界、验收总表
- `web-console-ui-views.md`（本文）: 每个页面/面板的字段、交互、状态与验收细则
- `web-console-ui-system.md`: 组件/token/可访问性/性能/Future 系统化约束

约定：

- `P1-C`: 当前必须实现
- `Future`: 允许写入正文，但不纳入 P1-C 必验

---

## 1. 主工作区 Sessions（`/c`、`/c/:sessionId`）

### 1.1 目标

让用户在单屏完成三件事：查看会话流、理解当前运行状态、审阅制成品预览。

### 1.2 布局示意

```
┌─ Sidebar ─┬─ Stream (main) ───────────────────┬─ Preview/Run ─────┐
│ 新会话     │ 会话标题 + 菜单                    │ 默认: 运行上下文   │
│ 搜索       │ 运行摘要条                          │ 点击制成品后: 预览 │
│ 技能/插件  │ 消息流(User/Assistant/Tool/...)    │ md/html/csv        │
│ 自动化     │ 输入条(可占位)                      │                    │
│ 历史对话   │                                     │                    │
│ 设置       │                                     │                    │
└────────────┴─────────────────────────────────────┴───────────────────┘
```

### 1.3 消息类型目录（渲染契约）

| 类型 | 关键字段 | 显示规则 | 默认行为 |
|------|----------|----------|----------|
| `user` | `content`, `createdAt` | 右侧气泡，短宽布局 | 支持复制 |
| `assistant` | `content`, `createdAt` | 左侧块，Markdown 渲染 | 链接新窗打开 |
| `tool_call` | `toolName`, `args`, `status` | 折叠行，标题含状态点 | 点击展开参数与结果 |
| `audit_row` | `effectivePermission`, `policyDecision`, `reason` | 出现在 tool 展开区 | 可跳转审计页筛选 |
| `approval_banner` | `approvalStatus`, `riskLevel`, `toolName` | 黄色高亮条 | 显示“等待审批” |
| `artifact_card` | `artifactId`, `path`, `mimeType`, `size` | 卡片样式，含类型图标 | 点击在右栏打开 |
| `system_note` | `eventType`, `payload` | 浅色系统行 | 默认折叠 |
| `run_summary` | `phase`, `nextStep` | 消息流顶部固定一行 | 随流实时更新 |

### 1.4 运行摘要条（`run_summary`）派生规则

阶段枚举：

- `planning`
- `tooling`
- `awaiting_approval`
- `responding`
- `completed`
- `error`

优先级（从高到低）：

1. 后端聚合字段（若 API 返回 `phase` / `nextStep`）
2. 前端基于最近事件推导：
   - 最近事件是审批挂起 -> `awaiting_approval`
   - 最近事件是工具执行中 -> `tooling`
   - 最近事件是 assistant 输出中 -> `responding`
   - 会话结束且无错误 -> `completed`
   - 最近事件含 error -> `error`
   - 其他 -> `planning`

### 1.5 交互

- 点击历史会话：中栏切换对应消息流；右栏重置到“运行上下文”。
- 点击制成品卡片：右栏切到“预览”并加载内容。
- 点击工具行：展开显示参数、结果、审计字段。
- 快捷键：
  - `/` 聚焦搜索
  - `g c` 回主会话
  - `Esc` 关闭抽屉/Sheet（若有）

### 1.6 状态

| 状态 | 中栏表现 | 右栏表现 | CTA |
|------|----------|----------|-----|
| loading | 骨架屏消息块 | 骨架屏摘要块 | 无 |
| empty | 空态文案“还没有会话” | 空态“选择会话查看详情” | “新会话” |
| error | 顶部错误条 + 已加载消息保留 | 错误态组件 | “重试” |
| partial | 仅渲染已到达事件 | 提示“部分数据加载中” | “继续加载” |

### 1.7 数据来源映射

- 轨迹与消息：`TrajectoryRecorder`
- 实时增量：`bus.on('agent.*')`
- 审计字段：事件中的 `audit` 区
- Token/Middleware 摘要：会话元信息（由 API 聚合或前端推导）

### 1.8 验收要点

1. `run_summary` 在每个会话顶部可见。
2. 工具行展开后可读到 `effectivePermission` 与 `policyDecision`。
3. 至少支持 `.md`、`.html`、`.csv` 三类制成品卡片点击预览。

---

## 2. 工作区概览 Modal（首次打开）

### 2.1 目标

首次进入时让用户快速建立工作区运行心智，不占用常驻导航空间。

### 2.2 布局示意

```
┌──────────────────────────── 概览 Modal ────────────────────────────┐
│ 标题 + 关闭                                                        │
│ KPI cards                                                          │
│ 实时事件流（SSE）                                                  │
│ 7d 趋势                                                            │
│ [开始使用] [关闭]                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 交互与生命周期

- 首次触发：读取 `kyberkit.console.overview.dismissed[:workspaceId]`。
- 关闭行为：写入 dismiss 键；同 workspace 不再自动弹出。
- 手动打开：设置壳顶部“工作区概览”按钮。
- 键盘与可访问性：
  - `Esc` 关闭
  - focus trap 启用
  - `role=dialog`、`aria-modal=true`

### 2.4 数据来源

- KPI：`ContractRegistry.list()`、`WorkspaceGrowthStore.aggregateSince()`
- 实时流：`bus.on('*')`（Modal 打开时订阅，关闭时取消）

### 2.5 状态

- loading：KPI/趋势骨架
- empty：提示“暂无运行数据”
- error：可重试，不阻塞进入主界面

### 2.6 验收要点

1. 首次打开自动弹出，关闭后不再自动弹出。
2. 设置壳按钮可再次打开同一 Modal。
3. `Esc` 可关闭且焦点返回触发按钮。

---

## 3. 侧栏面板

### 3.1 技能/插件面板

#### 字段

| 字段 | 说明 |
|------|------|
| `name` | 技能名称 |
| `description` | 一行摘要 |
| `path` | 技能路径 |
| `source` | LearningLoop / 用户手动 |

#### 交互

- 插入提示前缀（Future: 写入输入框）
- 复制路径
- “管理…”跳 `settings/skills`

### 3.2 自动化面板

#### 字段

| 字段 | 说明 |
|------|------|
| `contractId` | 合约 ID |
| `nextRunAt` | 下次运行 |
| `status` | running/paused/... |
| `lastEvent` | 最近 `contract.*` 事件 |

#### 交互

- 点击“管理合约” -> `/settings/contracts`
- 点击合约项 -> `/settings/contracts?contractId=<id>`

### 3.3 历史对话/搜索

- 历史按“项目（工作区）”折叠显示，其下按时间排序线程。
- 搜索匹配：标题 / sessionId / 首条用户摘要。
- 结果点击后切换 `/:sessionId`。

---

## 4. 设置子页：合约（`/settings/contracts`）

### 4.1 目标

集中管理合约生命周期与运行状态。

### 4.2 视图与字段

Tabs：

- 运行中
- 已暂停
- 草稿
- 历史

合约卡片字段：

- `contractId`
- `type`（ad-hoc/recurring/triggered）
- `cron` / `trigger`
- `nextRunAt`
- `tools[]`（含风险等级）
- `status`
- `drift` / token 摘要（若有）

### 4.3 交互

- 从草稿激活
- 暂停 / 恢复 / 撤销（均二次确认）
- 详情 Drawer：显示完整 JSON、最近触发历史

### 4.4 状态

- loading：卡片骨架
- empty：空态 + “从草稿激活”
- error：页内错误条 + 重试

### 4.5 数据来源

- `ContractRegistry.list()`
- `ContractDraftStore.listAll()`
- `CronParser.nextRunAfter()`

### 4.6 验收要点

1. 可在 UI 完成 activate/pause/revoke。
2. 详情 Drawer 可读完整结构与历史触发。

---

## 5. 设置子页：进化记录（`/settings/evolution`）

### 5.1 目标

展示 LearningLoop 进化轨迹，并可追溯回会话上下文。

### 5.2 字段

- `timestamp`
- `taskId`
- `mission`
- `toolCallsSummary`
- `skillSuggestion`
- `rollbackCheckpoint`（显示，不执行 rollback）

### 5.3 交互

- 点击 task 行 -> `/c/:sessionId`
- 点击建议 skill -> `/settings/skills`

### 5.4 数据来源与回退

- 首选：解析 `.kyberkit/evolution-changelog.md`
- 回退：`bus.on('learning_loop.evolved')` 本地累计

### 5.5 状态与验收

- changelog 解析失败时仍可显示 bus 累计项。
- 进化项可回链对应会话。

---

## 6. 设置子页：记忆库（`/settings/memory`）

### 6.1 目标

帮助用户检索长期记忆与会话摘要来源。

### 6.2 字段

- `memoryId`
- `category`（preference/fact/decision/pattern）
- `content`
- `createdAt`
- `sourceSessionId`

### 6.3 交互

- 搜索（内容模糊匹配）
- 类别筛选
- 来源跳转会话

### 6.4 Future

- 编辑、标签、合并（仅定义，不纳入 P1-C）

### 6.5 数据来源

- `LongTermMemory.list()`
- `SessionMemory.list()`

---

## 7. 设置子页：技能库（`/settings/skills`）

### 7.1 目标

管理持久技能文件，区分于侧栏的“会话可用技能面板”。

### 7.2 侧栏 vs 设置分工

| 维度 | 侧栏 技能/插件 | 设置 技能库 |
|------|-----------------|-------------|
| 场景 | 当前会话快速使用 | 全局管理 |
| 操作 | 插入提示、复制路径 | 查看、删除 |
| 数据焦点 | 可用性 | 资产治理 |

### 7.3 字段与交互

- `name`、`description`、`path`、`createdAt`、`createdBy`
- 查看（Drawer 渲染 markdown）
- 删除（二次确认）

### 7.4 数据来源

- `SkillRegistry.listMetas()`
- 文件系统读取

---

## 8. 设置子页：审计日志（`/settings/audit`）

### 8.1 目标

提供策略决策可追溯视图，并支持导出审计证据。

### 8.2 表格列

- 时间
- 工具
- 决策（allow/deny/block/approval）
- policy
- taskId
- actorUserId（可选展示）

### 8.3 筛选与导出

- 筛选：全部 / deny / approval / OutputGuard 拦截
- 时间：1h / 24h / 7d / 30d
- 导出：CSV（遵循当前筛选）

### 8.4 详情面板字段

- `effectivePermission`
- `policyDecision`
- `approvalStatus`
- `reason`
- `toolInputRedacted`

### 8.5 数据来源

- `TrajectoryRecorder`（`event.audit`）
- 字段对齐 `audit-and-outputguard.md`

---

## 9. 设置子页：偏好与合规（`/settings/preferences`）

### 9.1 目标

集中管理 Policy 与 Permit，直接映射会话执行策略。

### 9.2 字段

- Policy Pack（development/balanced/conservative）
- 持久授权列表：
  - `toolName`
  - `riskLevel`
  - `scope`
  - `expiresAt`
- 工作区根路径（只读）

### 9.3 交互

- 切换 Policy Pack：即时生效 + 持久化
- 撤销 Permit：即时生效

### 9.4 数据来源

- `KyberConfig`
- `PermitStore.listPersistent()`
- 语义对齐 `task-permission-contract.md`

---

## 10. Future 视图能力（正文定义，不纳入 P1-C 必验）

### 10.1 对话内改稿

- 在 assistant markdown 区块提供“建议修改”入口。
- 生成 patch 后仍经工具调用与审批链。
- 不允许绕过审计。

### 10.2 命令面板（`Cmd/Ctrl+K`）

- 全局命令检索：跳转页面、切换会话、打开设置子页、打开概览 Modal。
- 每个视图可注册局部命令。

### 10.3 Splitter 拖拽

- 中栏/右栏可拖拽调整宽度。
- 双击分隔条恢复默认宽度。

### 10.4 主题切换

- `system` / `light` / `dark`。
- 遵循 `web-console-ui-system.md` token 映射。

---

## 11. 跨视图深链清单

| 来源 | 深链格式 | 结果 |
|------|----------|------|
| 审计行 | `/c/:sessionId#tool=<eventId>` | 定位到工具行 |
| 进化项 | `/c/:sessionId#task=<taskId>` | 定位任务片段 |
| 自动化项 | `/settings/contracts?contractId=<id>` | 高亮目标合约 |
| 技能管理 | `/settings/skills?skill=<name>` | 高亮目标技能 |
| 来源会话 | `/c/:sessionId` | 切会话并保留滚动锚点（若存在） |

---

## 12. 状态矩阵（页面级）

| 视图 | loading | empty | error | partial |
|------|---------|-------|-------|---------|
| Sessions | 消息骨架 | 无会话空态 | 流加载失败可重试 | 仅到达部分事件 |
| 概览 Modal | KPI/趋势骨架 | 暂无运行数据 | 可重试，不阻塞主界面 | SSE 暂时断线提示 |
| 合约 | 卡片骨架 | 无合约/草稿引导 | 查询失败重试 | 仅部分字段可得 |
| 进化 | 卡片骨架 | 暂无进化记录 | changelog 失败 | bus 回退列表 |
| 记忆 | 列表骨架 | 暂无记忆 | 查询失败重试 | 分页未加载完 |
| 技能库 | 列表骨架 | 暂无技能 | 读取失败重试 | 文件内容延迟加载 |
| 审计 | 表格骨架 | 暂无审计 | 查询失败重试 | 导出进行中 |
| 偏好与合规 | 表单骨架 | 无持久授权 | 保存失败回滚 | 仅部分配置可读 |

---

## 13. 视图级 DoD（P1-C）

1. 主工作区支持消息流 + 运行摘要 + 制成品预览切换。
2. 设置 6 子页均有明确字段、交互、状态定义且可达。
3. 概览采用首次 Modal，不占独立设置路由。
4. 深链规则至少覆盖审计->会话、进化->会话、自动化->合约三条链路。
