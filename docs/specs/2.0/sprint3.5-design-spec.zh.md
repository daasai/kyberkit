# Sprint 3.5：用户感知契约 — 详细设计规范 (Detailed Design Spec)

> **版本**: 2.0-sprint3.5-proposed
> **状态**: 评审中（产品设计定稿，待工程拆解）
> **范围**: UAT 用户交互体验改进 — 进行中可读 / 结束时可核对 / 授权最小打扰 / 资产可感知
> **前置依赖**: Sprint 1（流式基础设施）+ Sprint 2（用户资产 / Prompt 组装 / Command）+ Sprint 3（TUI + AgentSession L3）
> **关键决策**: 三带 TUI 布局 / 三层授权策略 / 交付物仪表盘旁路渲染 / Memory 提取可撤销
> **上游引用**:
> - 用户反馈：[./product-experience-memo.md](./product-experience-memo.md)（UAT 备忘）
> - 产品定位：[./kyberkit-2.0.md](./kyberkit-2.0.md)（v2.0 架构总纲）
> - 工程路线：[./v2-upgrade-plan.md](./v2-upgrade-plan.md)（Sprint 1–6 实施计划）

---

## 0. 概述 (Overview)

### 0.1 问题陈述 (Problem Statement)

[./product-experience-memo.md](./product-experience-memo.md) 汇总的 UAT 反馈，翻译成用户视角后只有三条**裂缝**：

| 裂缝 | UAT 表征 | 用户真实心智 |
|------|---------|-------------|
| **进行中不可读** | StatusBar 重叠、MissionChip 文案弱、静默等待 | "它在干嘛？我能离开去喝水吗？" |
| **结束时不可核对** | 缺「交付物 + 过程」小结，用户需回滚找文件 | "我到底拿到了什么？敢不敢发给老板？" |
| **操作中被打断** | `bash`/`python`/写操作每次都弹窗 | "我是审批员，不是合作者" |

这三条裂缝的严重度排序 = **在场感 → 交付可信度 → 协作信任**，本文档所有设计决策的优先级都服从此序。

### 0.2 目标 (Goal)

让[./kyberkit-2.0.md](./kyberkit-2.0.md) §1.1 定义的"知识工作者"第一目标用户在使用 KyberKit 时同时获得：

1. **在场感**：任一时刻 2 秒内可回答"走到哪 / 还要多久 / 是否卡住"。
2. **交付可信度**：每轮结束并排拿到「交付物要点」「过程摘要」「可追溯入口」三件套。
3. **协作信任**：同类操作在同一会话最多打扰 1 次；无法"记住"的操作必须能事后审计。
4. **资产成长感**：Agent 自动沉淀的 Memory / Skill 在生成瞬间**被看见**且可一键撤销。

### 0.3 设计原则 (Design Principles)

- **感知优先**：UI 工程不是锦上添花，是目标用户的一级需求。宁可延后底层扩展能力，也要先闭合四条感知契约。
- **旁路不替代**：Turn Summary、授权卡等确定性渲染**不替代**模型自由表达，而是与模型正文**互补**。
- **全自动 + 可撤销**：记忆/资产保持 [./kyberkit-2.0.md](./kyberkit-2.0.md) Q2 的"全自动"路线，但每一次落盘都必须有 3 秒窗口 + `Ctrl+Z` 撤回能力，不靠弹窗加价。
- **单一数据源**：进度带、过程摘要、审计页面三者**必须共享** trajectory 事件流（`tool_events` / `fs_events` / `memory.extracted`），不得各自维护平行状态。
- **退化有保底**：窄屏、no-TUI、CI 脚本四档必须都能回答三问（信息密度降级，不能功能降级）。

### 0.4 决策摘要 (Decision Summary)

| # | 决策 | 影响 |
|---|------|------|
| **D1** | TUI 改为 **Identity / Narrative / Action 三带结构**，职责互斥 | 从根上消灭 StatusBar 重叠；MissionChip 变为 Identity Band 的任务名字段 |
| **D2** | 授权引入 **L0–L3 四级风险分级**，+ **plan 阶段批量授权卡** + `.kyberkit/permit.yaml` 白名单审计 | `bash`/`python`/写操作在同一任务内最多打扰 1 次 |
| **D3** | `turn_complete` 旁路生成 **TurnSummary 交付物仪表盘**，数据来自 trajectory 聚合 | 与模型收尾正文职责分工：仪表盘写"是什么"，模型写"如何用" |
| **D4** | Memory 自动提取时 TUI 弹 **3s 气泡 + `Ctrl+Z` 撤回**；新增 `/assets` 资产地图 | 保留全自动效率，补回用户"资产成长"的知情权 |
| **D5** | 本方案**不重排** [./v2-upgrade-plan.md](./v2-upgrade-plan.md) 的 Sprint 1–6 编排，作为 Sprint 3（TUI）与 Sprint 5（Hook）实现阶段的产品参考 | 零工程路线冲突，工程师可按节奏合入 |

---

## 1. 对 v2.0 架构的评估

### 1.1 七大变更对 UAT 裂缝的覆盖矩阵

对照 [./kyberkit-2.0.md](./kyberkit-2.0.md) §3 的七大变更：

| v2.0 变更 | 进行中可读 | 结束时可核对 | 操作中不被打断 | 资产成长感 |
|-----------|:--------:|:----------:|:------------:|:---------:|
| A. 用户资产注册表 | — | — | — | 基础设施 ✓ |
| B. 动态 Prompt 组装 | — | — | — | — |
| C. 流式 Agent Loop | 部分 ✓（token 流）| — | — | — |
| D. 记忆自动提取 | — | — | — | 后端 ✓ / 感知 ✗ |
| E. 上下文压缩 | — | — | — | — |
| F. Hook + Command | — | — | 前置依赖 ✓ / 策略 ✗ | — |
| G. LLM Gateway | — | — | — | — |

### 1.2 结论

**基础设施对齐，用户感知层缺位。** 七大变更没有任何一条直接回答"交付物仪表盘""授权分级"或"资产被看见"。把这三件事当成 TUI 细节会漏掉产品主线——它们应当作为**与七大变更并列的第八条**落在设计规范里，本文档即承担此角色。

---

## 2. 四条感知契约 (Perception Contracts)

在讨论具体界面前，先立四条契约。任何界面/流程决策必须满足其全部。

### C1 · 三问可答契约

> 用户在任一时刻 2 秒内能回答：走到哪 / 还要多久 / 是否卡住。

**验收可观察项**：

- [ ] Identity Band 持续显示 `Step N/M`、ETA、已耗时。
- [ ] 当前工具执行 > 10s 时，Narrative Band 显示心跳 spinner 且 ETA 字段不为空。
- [ ] 窄屏（< 80 cols）下任一信息都不被另一信息遮挡。

### C2 · 交付可核对契约

> 每轮结束，用户同时拿到「交付物」「过程」「入口」三件套。

**验收可观察项**：

- [ ] `task_complete` 事件后强制渲染 TurnSummary 卡片（TUI）或紧凑块（no-TUI）。
- [ ] 交付物列表 100% 来自 trajectory 的 `fs_events`，与模型正文口述不重复。
- [ ] 过程行数 = trajectory `steps` 表行数（单一数据源）。

### C3 · 授权最小打扰契约

> 同一会话内，对**同类**操作最多打扰用户 1 次；无法记住的，必须能事后审计。

**验收可观察项**：

- [ ] L0 只读工具永不弹窗。
- [ ] L1 工具在同一 **task** 内至多 1 次批量授权卡。
- [ ] `/permit review` 能列出本轮/本会话所有被默认放行或批量授权的操作，可一键回滚。

### C4 · 资产可感知契约

> Agent 自动沉淀的每一条资产，用户都有机会看见并选择撤回。

**验收可观察项**：

- [ ] 每次 `memory.extracted` 事件，TUI 3s 内出现"已记住"气泡。
- [ ] 3s 窗口内按 `Ctrl+Z` 可撤销，文件系统同步删除，trajectory 留 `asset.reverted` 审计记录。
- [ ] `/assets` 命令输出与 `.kyberkit/memories/` 目录计数精确一致。

---

## 3. 界面重设计：TUI 三带结构

### 3.1 整体布局

```
┌─────────────────────────────────────────────────────────────┐
│ IDENTITY BAND  (1 行, 始终可见)                              │
│   ◎ 省心租数据分析 · Step 3/6 · 02:14 · Sonnet-4 · ¥0.42    │
├─────────────────────────────────────────────────────────────┤
│ NARRATIVE BAND  (动态高度)                                   │
│   ▸ 读取 trade_data.csv (12.4k 行)           ✓ 1.2s         │
│   ▸ 清洗异常值 (IQR 法, 剔除 3.1%)            ✓ 4.8s         │
│   ▾ 正在: 按地区聚合收入 · python             ⠋ 6s / ~15s    │
│       └─ output: 华东区 ¥8.2M / 华南区 ¥5.1M ...            │
│                                                              │
│ ── Assistant ─────────────────────────────────────           │
│   根据清洗后数据, 华东区...（流式正文）                      │
├─────────────────────────────────────────────────────────────┤
│ ACTION BAND  (2 行, 上下文敏感)                              │
│   Ctrl+R 近期轨迹  /plan 改计划  /permit 调整授权  v 详略    │
│   ›                                                          │
└─────────────────────────────────────────────────────────────┘
```

三带**职责互斥**：Identity = "我是谁/我在哪"；Narrative = "我在做/我说了什么"；Action = "我可以做什么"。

### 3.2 Identity Band — 单行不重叠策略

直接回应 [./product-experience-memo.md](./product-experience-memo.md) §3 的两条 P0：

| UAT 问题 | 本方案 |
|---------|-------|
| 状态栏重叠（窄屏下长标题压指标） | 单行布局 + **居中截断** `…`；任务名最大宽度 = `cols - 指标区固定宽度`；超出即截断保留前缀（任务类型）与后缀（任务主题关键词） |
| MissionChip 文案弱 | 任务名来源从 `userInput` 改为 `plan_task.mission`；无 plan 时显示 `进行中 · 第 N 轮` |

Identity Band 字段（从左到右）：

1. 任务图示（`◎` 运行中 / `✓` 完成 / `!` 失败）
2. 任务名（来自 `plan_task.mission`，必要时居中截断）
3. `Step N/M`（来自 plan 步数）
4. 已耗时（`mm:ss`）
5. 模型标识
6. 累计成本

窄屏退化规则见 §3.5。

### 3.3 Narrative Band — 三段折叠式

**三段**：过去（默认折叠一行）/ 当前（心跳 + ETA，永远只一行）/ 正文（流式 Assistant 输出）。

- **过去段**：已完成步骤每行一条，显示 `▸ 标题 工具 ✓ 耗时`。用户按 `v` 展开详情（工具入参/输出摘要）。
- **当前段**：`▾ 正在: <标题> · <工具> ⠋ <已耗时> / ~<ETA>`。ETA 来自 plan 阶段预估，若无预估则显示 `预估中`。**这里是"是否卡住"的唯一锚点**——spinner 停止 = 卡住。
- **正文段**：流式拼装模型输出；工具块折叠为"过去段"的一行。

### 3.4 Action Band — 上下文敏感

默认状态显示快捷键提示行 + 输入提示符。

上下文切换（替换整个 Action Band）：

- **授权请求中** → 替换为批量授权卡（见 §4.2）
- **Turn 收尾** → 替换为交付物仪表盘摘要 + 快捷操作（见 §5.2）
- **资产沉淀瞬间** → 显示"已记住 · `Ctrl+Z` 撤回"气泡 3 秒（见 §6.1）

### 3.5 退化矩阵

| 终端宽度 | Identity Band | Narrative Band | Action Band |
|---------|--------------|---------------|-------------|
| ≥ 100 cols | 完整单行 | 三段折叠 | 完整快捷 |
| 80–99 cols | 隐藏「成本」与「模型」 | 三段折叠 | 仅保留 `v`/`\permit` |
| < 80 cols | 两行：第 1 行任务名；第 2 行 Step/ETA/cost | 过去不展开，仅显示"当前"一行 | 仅输入提示符 |
| no-TUI | 每 30s 心跳：`[3/6 · 02:14 · python] 按地区聚合收入...` | 工具完成时打 1 行 | — |

四档全部必须满足 C1（三问可答）。

---

## 4. 授权流程重设计

### 4.1 风险分级表（默认，可在 `KK.md` 覆盖）

对应 [./product-experience-memo.md](./product-experience-memo.md) §4 的授权频次问题。

| 等级 | 识别规则 | 典型工具 | 默认策略 |
|------|---------|---------|---------|
| **L0 只读** | 无副作用；不写文件、不访问网络 | `read_file`, `list_dir`, `rg`, `bash` 白名单子集（`ls`/`cat`/`pwd`/`git status`） | **永不询问** |
| **L1 项目写** | 仅写工作区内、非 `.kyberkit/` 外的路径 | `write_file`(./**), `edit_file`(./**), 项目内 `python` 脚本 | **任务级一次确认**（批量授权卡） |
| **L2 副作用** | 产生不可逆或跨系统影响 | `bash` 含 `rm`/`mv`/`curl -X POST`/`git push`；MCP 写类工具 | **任务级一次确认**（独立勾选） |
| **L3 危险** | 可能影响用户系统或跨用户数据 | `sudo`, 删除 `.kyberkit/`, 跨用户目录写，系统级配置修改 | **每次确认 + 二次键入** |

### 4.2 批量授权卡（替代逐次弹窗）

当 Agent 在 plan 阶段已知要连续使用多个工具时，**进入执行前一次性出卡**：

```
┌─ 授权请求 ──────────────────────────────────────────┐
│ 为完成「省心租数据分析」, 我将需要:                    │
│                                                      │
│  [L1] python · 预计 3 次    数据清洗与聚合           │
│  [L1] write_file · 2 次     ./reports/*.md           │
│  [L2] bash · 1 次           git add reports/         │
│                                                      │
│  ▸ 全部许可 (本次任务)   [Enter]                     │
│  ▸ 全部许可 (本会话)     [Shift+Enter]               │
│  ▸ 只许可 L1，L2 单独问   [Tab]                      │
│  ▸ 逐条审查               [e]                        │
│  ▸ 查看详细参数           [d]                        │
└──────────────────────────────────────────────────────┘
```

记忆范围：

- **任务级**（Default）：`WorkspaceInstance.taskGrants`，随 `task_complete` 清理。
- **会话级**（Shift+Enter）：`WorkspaceInstance.sessionGrants`，随 session 结束清理。
- **持久级**（KK.md 中声明）：永久生效，作为白名单。

### 4.3 白名单审计替代弹窗

- `.kyberkit/permit.yaml`：声明"安全区"（如 `./reports/**`, `./scratch/**`）。写入这些路径**不再弹窗**，但每次都进 trajectory `audit_events` 表。
- `/permit review`：列出本轮/本会话被默认放行 + 被批量授权的所有操作，支持一键 `revert`（基于 checkpoint/`fs_events`）。

### 4.4 接入点（与 v2-upgrade-plan.md 对齐）

- 落在 [./v2-upgrade-plan.md](./v2-upgrade-plan.md) 的 **Sprint 5 Step 12（Hook 系统）** 的 `PreToolExecution` 层，实现为标准 `PermissionPolicyHook`。
- 在 Sprint 5 正式化前，可先在 Sprint 3（TUI）期间以 PermissionSandbox 前置过滤器形式落地批量授权卡 UI，Sprint 5 再把策略逻辑迁移成 Hook。
- 现有 `PermissionSandbox` 接口不变；Hook 只在其上增加一层策略表。

---

## 5. 收尾反馈重设计：交付物仪表盘

### 5.1 数据契约 `TurnSummary`

**单一真源原则**：仪表盘所有字段都从 trajectory 事件聚合，不新增业务状态。

| 字段 | 来源事件 | 聚合规则 |
|------|---------|---------|
| `deliverables[]` | `fs_events` (create/modify) | 去重、按创建时间排序；覆盖同名视为"修改" |
| `steps[]` | `task_narration` + `tool_events` | 与 Narrative Band 过去段同源 |
| `assets[]` | `memory.extracted` + `skill.suggested` | 本轮内新增 + 未被撤回的 |
| `metrics` | `usage` + `tool_events.duration_ms` | 工具成败计数、总耗时、累计成本 |

TypeScript 接口草稿见附录 B。

### 5.2 TUI 渲染

```
┌─ 本轮交付 · 04:32 完成 ─────────────────────────────────┐
│                                                          │
│  交付物 (2)                                              │
│   📄 spaces/default/reports/省心租交易数据分析报告.md     │
│       86 行 · 新建                    [打开] [导出 PDF]  │
│   📊 spaces/default/reports/revenue_by_region.csv        │
│       4 行 × 3 列 · 新建              [打开]             │
│                                                          │
│  执行过程 (6 步 · 02:28 · ¥0.47)                         │
│   1. 读取源数据 trade_data.csv        (python)   1.2s    │
│   2. 清洗异常值, IQR 法剔除 3.1%      (python)   4.8s    │
│   3. 按地区聚合收入                    (python)  15.4s   │
│   4. 同比环比计算                      (python)   8.1s   │
│   5. 撰写分析结论                      (write)    -     │
│   6. 落盘报告                          (write)   0.3s    │
│                                                          │
│  沉淀资产 (Agent 自动积累, 可撤销)                        │
│   🧠 Memory: "省心租数据表字段口径"   [查看] [撤销]       │
│   🛠  Skill 建议: "地区收入对比分析"   [采纳] [忽略]      │
│                                                          │
│  [Ctrl+T] 查看完整轨迹  [Ctrl+S] 保存到任务库             │
└──────────────────────────────────────────────────────────┘
```

### 5.3 no-TUI 紧凑块

```
──────── 本轮交付 (04:32 完成 · ¥0.47) ────────
交付物:
  + spaces/default/reports/省心租交易数据分析报告.md  (86 行, 新建)
  + spaces/default/reports/revenue_by_region.csv      (4×3, 新建)
过程: 6 步 / 02:28 (工具成功 6/6)
沉淀: 1 条 Memory · 1 条 Skill 建议 (未采纳)
────────────────────────────────────────────────
```

与模型收尾正文之间用 `────` 分隔线明确分块。

### 5.4 职责分工

- **仪表盘（确定性）** 写"是什么" — 文件、行数、工具、耗时、资产。
- **模型收尾正文（语义性）** 写"如何用" — 结论、使用建议、注意事项。
- 系统提示词里约束：文末**不再**复读文件名或过程列表，避免重复；若检测到重复，可在渲染时折叠模型正文对应段落。

### 5.5 接入点

- 新增 `TurnSummaryBuilder`，建议位置：`src/runtime/TurnSummaryBuilder.ts`。
- 订阅 `task_complete` 事件（已在 Sprint 1/3 存在），聚合 trajectory 行生成 `TurnSummary`。
- TUI 消费：在 [./v2-upgrade-plan.md](./v2-upgrade-plan.md) Sprint 3 Step 7 的 `<StreamingOutput />` 之后插入 `<TurnSummaryCard />`。
- no-TUI 消费：在现有心跳渲染器收尾处注入紧凑块。

---

## 6. 资产成长可视化

回应 [./kyberkit-2.0.md](./kyberkit-2.0.md) §5 的 Q2（全自动 vs 半自动 vs 手动），本方案选**"全自动 + 3 秒可撤销"**折中。

### 6.1 "已记住"气泡

触发条件：接收到 `memory.extracted` 事件。

```
🧠 已记住: "省心租数据表字段口径"       [Ctrl+Z 撤回 · 3s]
```

规则：

- 3 秒后自动收起，不遮挡正文。
- 3 秒内 `Ctrl+Z` → 发送 `asset.revert` 指令 → `MarkdownMemoryStore` 删除对应 `.md` + 索引更新 + trajectory 记录 `asset.reverted`。
- 同一 Turn 内多条提取按队列依次展示，不并发堆叠。

### 6.2 `/assets` 资产地图

```
┌─ 你的 Agent 正在变成 ... ─────────────────────────┐
│                                                    │
│  Memories (17)                                     │
│   user/       6  偏好与写作风格                    │
│   project/    8  ← 本周新增 3                      │
│   reference/  3                                    │
│                                                    │
│  Skills (4)                                        │
│   ✓ 省心租交易分析模板         用过 5 次            │
│   ✓ 周报撰写                   用过 12 次           │
│   ◯ 地区收入对比分析 (建议)    [采纳] [忽略]        │
│                                                    │
│  Commands (2 自定义)                               │
│   /weekly   /report                                │
└────────────────────────────────────────────────────┘
```

- 实现为一个新的 Command（`src/commands/builtin/AssetsCommand.ts`），数据来自 `AssetRegistry.query()`（Sprint 2 已落地）。

### 6.3 资产成长条

每日首次打开 TUI 时顶部浮现一行，2 秒后自动收起为图标，`i` 键展开：

```
 上周你新增了: 3 条记忆 · 1 个 Skill · 用了 12 次 Agent, 节省约 4.5h  [查看详情]
```

"节省约 Xh"估算基于 trajectory `usage` 与任务完成计数，是**体验糖**而非审计数字，允许粗略。

---

## 7. 落地编排（与 v2-upgrade-plan.md 的接口）

### 7.1 不重排现有 Sprint

[./v2-upgrade-plan.md](./v2-upgrade-plan.md) 的 Sprint 1–6 编排保持不变。本方案作为 Sprint 3（TUI）与 Sprint 5（Hook）实现阶段的**产品参考**。

### 7.2 合入建议（不改现有 Step 编号）

| 落地位置 | 现有 Step | 本方案工作 |
|---------|----------|-----------|
| Sprint 3 · Step 7（TUI REPL） | 已有：REPL / PromptInput / StreamingOutput / StatusBar | **扩展** StatusBar → IdentityBand；**新增** NarrativeBand / ActionBand 组件；**新增** 授权卡 UI 骨架（策略留到 Sprint 5） |
| Sprint 4 · Step 10（LT Memory 提取） | 已落地：Markdown 写入 + 事件 | **消费** `memory.extracted` 事件，新增"已记住"气泡组件 |
| Sprint 5 · Step 12（Hook 系统） | 未实施：三层 Hook | **新增** `PermissionPolicyHook`（策略实现）；授权卡 UI 切换到正式 Hook 触发 |
| 跨 Sprint | — | **新增** `TurnSummaryBuilder` + `<TurnSummaryCard />`（可随 Sprint 3 一起做） |

### 7.3 细化任务建议（Step 7 内部拆分）

作为工程落地提示（不影响 Sprint 编号）：

- **Step 7a · PermissionPolicy**：`.kyberkit/permit.yaml` 加载 + 风险分级表 + 批量授权卡 UI（策略层临时用 Sandbox 前置过滤器，Sprint 5 迁移到 Hook）
- **Step 7b · TurnSummary**：`TurnSummaryBuilder` + 卡片/紧凑块双渲染器 + 系统提示词避免重复约束
- **Step 7c · 资产成长**：已记住气泡 + `/assets` Command + 成长条

### 7.4 估算

约 **1.5–2 周**，主要成本：

- TUI 组件重构（Identity/Narrative/Action 三带）：3–4 天
- 批量授权卡 UI + 策略前置过滤器：2–3 天
- TurnSummaryBuilder + 双渲染器：2 天
- 资产气泡 + `/assets` + 成长条：2 天
- 验收 + QA：2 天

基础数据（trajectory 事件、`memory.extracted` 事件、`AssetRegistry` 查询）已在 Sprint 1–4 落地，无需新基础设施。

---

## 8. 验收标准 (Acceptance Checklist)

按四条契约分组，可直接作为 QA 清单：

### C1 · 三问可答

- [ ] IdentityBand 持续显示 `Step N/M` 与 ETA，任一时刻 2 秒内可读
- [ ] 单工具执行 > 10s 时 NarrativeBand spinner 运行、ETA 非空
- [ ] 终端宽度 60/80/100/140 cols 四档截图，无任何重叠

### C2 · 交付可核对

- [ ] 所有 `task_complete` 事件后渲染 TurnSummary 卡片（TUI）或紧凑块（no-TUI）
- [ ] 交付物列表条目数 = `fs_events` create+modify 去重后条目数
- [ ] 抽检 10 例对话，模型正文未重复列交付物文件名

### C3 · 授权最小打扰

- [ ] L0 工具在集成测试下 0 弹窗
- [ ] L1 工具在同一 task 内最多 1 次批量授权卡
- [ ] `/permit review` 能列出被默认放行、批量授权、单次授权三类操作
- [ ] `revert` 后 `fs_events` 写审计记录

### C4 · 资产可感知

- [ ] 每次 `memory.extracted` 事件，3s 内 TUI 出现"已记住"气泡
- [ ] 3s 内 `Ctrl+Z` 能同步删除 `.kyberkit/memories/<category>/<slug>.md`
- [ ] `/assets` 输出与文件系统计数精确一致（fuzz 测试 20 次）

---

## 附录 A：与 v2-upgrade-plan.md Step 的交叉引用表

| 本文档章节 | 对应 [./v2-upgrade-plan.md](./v2-upgrade-plan.md) Step | 关系 |
|-----------|------------------------------------------------------|------|
| §3 三带 TUI | Sprint 3 · Step 7（TUI REPL） | 扩展 StatusBar；新增 Narrative/Action |
| §4.2 批量授权卡 UI | Sprint 3 · Step 7 | UI 落地，策略前置过滤器 |
| §4.4 PermissionPolicyHook | Sprint 5 · Step 12（Hook 系统） | 正式策略层 |
| §5 TurnSummary | Sprint 3 · Step 7（渲染）+ Sprint 1 事件 | 事件消费端 |
| §6.1 已记住气泡 | Sprint 4 · Step 10（`memory.extracted`） | 事件消费端 |
| §6.2 `/assets` | Sprint 2 · Step 6（Command 系统）+ Step 4（AssetRegistry） | 新增 Command |

---

## 附录 B：TurnSummary TypeScript 接口草稿

```typescript
interface TurnSummary {
  taskId: string;
  mission: string;             // plan_task.mission
  completedAt: number;         // ms epoch
  durationMs: number;

  deliverables: Deliverable[];
  steps: StepRecord[];
  assets: AssetRecord[];
  metrics: TurnMetrics;
}

interface Deliverable {
  path: string;                // 相对工作区根
  kind: 'create' | 'modify';
  sizeBytes: number;
  preview?: { lines?: number; rows?: number; cols?: number };
  actions: Array<'open' | 'exportPdf' | 'revealInFinder'>;
}

interface StepRecord {
  index: number;
  title: string;               // 来自 task_narration
  tool: string;                // 工具名
  durationMs: number;
  status: 'ok' | 'error' | 'skipped';
}

interface AssetRecord {
  type: 'memory' | 'skill';
  title: string;
  sourcePath?: string;         // .kyberkit/memories/... 或 skills/...
  suggested?: boolean;         // skill 建议（未采纳）
  revertible: boolean;
}

interface TurnMetrics {
  toolCallsTotal: number;
  toolCallsFailed: number;
  tokensInput: number;
  tokensOutput: number;
  costCNY: number;             // 展示用，允许估算
}
```

---

## 附录 C：开放问题

| # | 问题 | 状态 |
|---|-----|------|
| **Q1** | `plan_task.mission` 字段在当前 Narrator 规则/`plan_task` 工具中是否已产出？若未产出需在 Sprint 3 Step 7a 前补 | 待工程确认 |
| **Q2** | L2/L3 分级需要映射到当前 `ToolRegistry` 的具体 tool 名清单。建议在 Sprint 5 开工前由工程出 PR 草案 | 待工程出清单 |
| **Q3** | Ink 组件抽象层级：IdentityBand/NarrativeBand/ActionBand 是否共用 REPL state，还是独立订阅 agentLoop 事件？建议后者（解耦，便于 no-TUI 复用 builder） | 待设计 review |

---

## 附录 D：实施记录

> 随 Sprint 3.5 逐 Step 推进回填，保持规范与代码事实同步。

### Step 0 — 基础设施补齐 (完成)

**分支**: `sprint3.5/perception-contract`

**改动文件**:

| 文件 | 类别 | 说明 |
|------|------|------|
| `src/types/agent-events.ts` | ADD | 新增 `TaskCompleteEvent` 类型；`TaskPlanEvent` 增加可选 `mission` / `taskId` 字段 |
| `src/agent/middleware/NarratorMiddleware.ts` | MODIFY | Narrator 维护 `taskId` / `mission` / `turnsInTask` / `toolCallsInTask` / `errorsInTask` 状态；在 `turn_complete` 且 `stopReason ∈ {end_turn, stop_sequence, max_tokens}` 时合成 `task_complete`；`task_plan` 事件透传 `taskId` / `mission` |
| `src/observability/KyberAnalyticsDb.ts` | MODIFY | 新增 `fs_events` 表 + `recordFsEvent` / `queryFsEventsByTurn` / `queryFsEventsByTask` 方法；索引 `idx_fs_turn` / `idx_fs_task` |
| `src/observability/TrajectoryRecorder.ts` | MODIFY | 捕获 `tool_use_complete` 的 input，在 `tool_result` 成功时按规则（`write_file` / `edit_file` / `delete_file`）落入 `fs_events`；按 `task_plan.taskId` 维护 `currentTaskId` |
| `src/runtime/AgentSession.ts` | MODIFY | `ReliabilityBuildConfig.memoriesDir` 变为可选字段（兼容旧调用），默认回落 `<rootDir>/memories` |
| `src/runtime/KyberRuntime.ts` | MODIFY | `createSession` 在 `real` 模式下将 `memoriesDir` 指向活动 Workspace 的用户根 `assetPaths.user/memories`，打通 AssetRegistry 与 LTM 写入路径 |
| `src/tui/state/sessionReducer.ts` | MODIFY | `TurnState.taskPlan` 增加 `taskId` / `mission` 字段；新增 `TurnState.taskComplete` 存储 `task_complete` 事件（为 Step 3 TurnSummary 渲染预留） |

**新增测试**:

- `src/agent/middleware/NarratorMiddleware.test.ts` — 6 用例，覆盖 task_complete 触发条件、mission 透传、tool/error 计数、task 重置
- `src/observability/KyberAnalyticsDb.test.ts` — 3 用例，覆盖 fs_events insert/query by turn/task、null task_id 兼容
- `src/tui/state/sessionReducer.test.ts` — 追加 2 用例（taskPlan.taskId/mission、task_complete 归档）

**测试结果**: `bun test` 全量 241 pass / 4 skip / 0 fail。

**与 v2-upgrade-plan 的映射**:

- 本 Step 对 `docs/v2-upgrade-plan.md` 中 Sprint 3 Step 7a（plan_task/NarratorMiddleware）及 Sprint 5 Hook 前置事件化做基础扩展，不改动原 Sprint 编排。
- `fs_events` 为 Sprint 5 Hook 体系与 TurnSummary 交付物面板提供唯一数据源。
- memories 路径统一消除了 Sprint 4 LTM 写入与 Sprint 2 AssetRegistry 扫描之间的孤岛。

**已知局限（留给后续 Step / Sprint）**:

- `FsTelemetryMiddleware` 未独立落地 — 当前检测逻辑内联在 `TrajectoryRecorder` 中。若未来需要把检测接入 hook 或让非 trajectory 消费者可用，可将 `detectFsEffects` 提取为独立 tap（建议放在 Sprint 5 Hook 工作中一同做）。
- `write_file` 事件统一标记为 `kind='create'`；是否为 modify 需 Sprint 3 Step 3 或 4 时按 pre-state 判断（建议在 TurnSummaryBuilder 合并 `fs_events` 时做二次推断）。
- `bash` / `python` 等自由形式工具暂不做启发式 fs 检测（避免误报），若 Sprint 5 Hook 暴露了统一 tool-wrapper，可在 wrapper 层发射准确事件。

### Step 1 — TUI 三带结构 (完成)

**改动文件**:

| 文件 | 类别 | 说明 |
|------|------|------|
| `src/tui/components/IdentityBand.tsx` | ADD | 顶部身份带：Agent 名 / Mission / elapsed / 资产计数 / ws。始终可见，取代原 MissionChip 的"仅 busy 可见"行为 |
| `src/tui/components/NarrativeBand.tsx` | ADD | 中部纪事带：封装 TranscriptView + 运行中的计划步骤 + narration 活动面板 |
| `src/tui/components/ActionBand.tsx` | ADD | 底部动作带：运行时显示"● 运行中 · elapsed · tools · Ctrl+C 中断"；待命时"● 就绪 · 输入消息或命令"；权限等待时"y 允许 / n 拒绝 / Esc 取消"；右侧保留 model · turns · tokens · cost |
| `src/tui/utils/mission.ts` | ADD | `resolveMission(turn, maxLen)`：`taskPlan.mission` → active step title → first step title → userInput 截断 的四级回退 |
| `src/tui/utils/mission.test.ts` | ADD | 6 用例覆盖所有回退分支 |
| `src/tui/REPL.tsx` | REWRITE | 从「MissionChip + ActivityPanel + Transcript + StatusBar」重构为「IdentityBand + NarrativeBand + ActionBand + PromptInput」四段式布局 |
| `src/tui/components/MissionChip.tsx` | DELETE | 由 IdentityBand + NarrativeBand 的内联 plan 渲染取代 |
| `src/tui/components/StatusBar.tsx` | DELETE | 由 ActionBand 取代（含等价 cost / tokens 摘要） |

**核心变化（用户可感知）**:

1. **Mission 稳定性**：以前用 `userInput.slice(0, 80)` 做 chip 标题；现在 `resolveMission` 优先读 `NarratorMiddleware` 写入的 `taskPlan.mission`，即使用户问题很长或已被折叠，顶部仍显示"重构 AuthService"这样的稳定标题。
2. **身份常驻**：IdentityBand 在待命态也显示（"待命"占位），满足"三问可答 - 我的 Agent 在哪里"契约。
3. **右侧资产感知**：IdentityBand 右侧读取 `workspace.assets.getManifest()` 动态展示记忆 / 技能数量，每 ~1s 通过 uiClock 自动刷新。
4. **下一步提示**：ActionBand 替代纯 status bar，明确告诉用户"此刻该做什么"（输入消息 / 中断 / 授权决策）。

**新增测试**: `bun test src/tui/utils/mission.test.ts` — 6 用例。
**回归测试**: `bun test` 全量 247 pass / 4 skip / 0 fail（累计较 Step 0 前净增 17 用例）。

**与设计规范对齐**:

- §3.2 三带结构：已落地，IdentityBand 固定 1 行（带底边框），NarrativeBand `flexGrow=1`，ActionBand 固定 1 行（带顶边框）。
- §3.2 mission 字段：`TaskPlanEvent.mission` → `TurnState.taskPlan.mission` → `resolveMission` 链路打通。
- §4.2 权限模式提示位：`IdentityBand.permissionMode` 参数已预留，Step 2 接入 PermissionPolicy 时只需传入即可。
- §6 资产感知：`IdentityBand.assetCounts` 已落地，Step 4 的 Memory Toast 和 `/assets` 将与之共用数据源。

**已知局限（留给后续 Step）**:

- `ActionBand` 的权限等待提示是静态文案；真正的 y/n/Esc 响应仍由 `ToolPermissionOverlay` 弹层拦截。Step 2 会让 Action Band 的提示与批量授权卡状态联动。
- `assetCounts` 通过 uiClock 轮询 manifest，对 `scan()` 变更有 ~1s 延迟；后续可订阅 `asset.*` 事件改为事件驱动。
- TranscriptView 的 `<Static>` 仍照旧持久化完成的 turns；但目前不渲染 `task_complete` 事件（Step 3 TurnSummary 将在 Static 的 turn 块内追加 summary 卡片）。

### Step 2 — 权限分级 + 批量授权卡 + /permit (完成)

**改动文件**:

| 文件 | 类别 | 说明 |
|------|------|------|
| `src/permission/PermissionPolicy.ts` | ADD | 纯函数 `classifyToolCall(name, input, opts)`；覆盖 read_file / write_file / edit_file / delete_file / bash / python / plan_task，返回 `{ level: L0\|L1\|L2\|L3, reason, label, requiresSecondConfirm }`。bash 内按 verb 分级（sudo→L3, rm/mv/cp/git push→L2, ls/cat/git status→L0），write 按路径落点分级（`.kyberkit/`/跨 ws →L3，工作区内→L1） |
| `src/permission/PermitStore.ts` | ADD | 内存 grant 存储；三级作用域 task/session/persistent，task grants 由 `setCurrentTask` / `onTaskComplete` 自动回收；`modeLabel()` 驱动 IdentityBand 展示 |
| `src/permission/ToolPermissionGate.ts` | MODIFY | 扩展 `ToolPermissionPrompt` 带 `level`/`requiresSecondConfirm`；新增 `BatchAuthPrompt` / `BatchAuthDecision` / `CanAuthorizeBatchFn` 类型 |
| `src/agent/middleware/ToolDispatcherMiddleware.ts` | REWRITE | 构造函数新增 options-style 签名（兼容旧 positional）；`dispatchTools` 开头加入预扫描 → 调用 `canAuthorizeBatch` 出批量卡 → 结果写入 PermitStore；`shouldGateInteractive` 取代裸 `needsInteractiveGate`：L0 直通，L3 必问，L1/L2 先查 PermitStore |
| `src/agent/AgentLoop.ts` | MODIFY | `AgentLoopDeps` 新增 `permitStore` + `toolPermission.canAuthorizeBatch`；`observeTaskLifecycle` 钩子在三处 yield 点把 `task_plan.taskId` / `task_complete.taskId` 透传给 PermitStore，实现任务级 grants 自动回收 |
| `src/runtime/KyberRuntime.ts` | MODIFY | 新增共享 `PermitStore`；`setBatchAuthHandler()` / `getPermitStore()` 公开；`createSession` 注入 `permitStore` 到 `AgentLoopDeps` |
| `src/runtime/WorkspaceInstance.ts` | MODIFY | 新增 `attachPermitStore(getter)`；注册 `PermitCommand` 到命令注册表 |
| `src/commands/builtin/PermitCommand.ts` | ADD | `/permit [list\|review\|clear <task\|session\|persistent\|all>]` |
| `src/tui/components/BatchAuthCard.tsx` | ADD | 新的黄边卡片：按 toolName 分组展示 L1/L2 项；快捷键 Enter 本次任务 / `s` 本会话 / Tab 只放行 L1 / `e` 逐条 / `d` 拒绝 / `v` 展开详情 |
| `src/tui/hooks/useSession.ts` | MODIFY | 注册 `runtime.setBatchAuthHandler`；暴露 `batchAuthPrompt` + `resolveBatchAuth`；`cancel()` 一并 deny_all 批量提示 |
| `src/tui/REPL.tsx` | MODIFY | IdentityBand 填充 `permissionMode`（驱动自 `PermitStore.modeLabel()`）；在 ToolPermissionOverlay 位置优先渲染 `BatchAuthCard`；ActionBand / PromptInput 的 awaitingPermission 态两者合并 |
| `src/permission/PermissionPolicy.test.ts` | ADD | 11 用例，覆盖所有主流分级分支 + 默认回落 + allowlist 提升 |
| `src/permission/PermitStore.test.ts` | ADD | 8 用例，覆盖 grants 命中 / 通配 / 任务切换回收 / scope 互不影响 / clearScope / snapshot |
| `src/commands/builtin/PermitCommand.test.ts` | ADD | 5 用例，覆盖 list 输出 / clear task-only / clear all / 无 store 保护 / usage |

**核心变化（用户可感知）**:

1. **同类操作最多打扰 1 次**：plan 阶段一次性出授权卡；选择"本次任务"后 L1/L2 在当前 task 内直通；`task_complete` 自动清空 task grants。
2. **身份带上能看见当前模式**：IdentityBand 右侧出现 `权限:严格/任务/会话/持久`。
3. **`/permit` 审计随时可查**：列出所有 scope 的 grants，`clear task/session/persistent/all` 一键撤销。
4. **L3 仍然会每次询问**：写入 `.kyberkit/`、跨工作区写、`sudo`/`su` — 不接受批量授权。
5. **ToolPermissionOverlay 保留兜底**：当中间件没有 PermitStore（旧路径），或用户选择"逐条审查"，仍用原 y/n 弹层。

**关键设计决策**:

- **分级逻辑纯函数化**：`classifyToolCall` 不依赖 fs I/O，易于测试与未来 Hook 化。当前仅看 toolName + input；后续 Sprint 5 Hook 可叠加 pre-state（如判断 write_file 是否覆盖既有文件）。
- **PermitStore 放在 KyberRuntime 而非 WorkspaceInstance**：与 runtime 的 PermissionSandbox 同层生命周期；`onTaskComplete` 触发由 NarratorMiddleware 发射的 `task_complete.taskId` 驱动，无需 WorkspaceInstance 自己跟踪。
- **批量卡和单卡分开**：`canAuthorizeBatch` 是新通道而非复用 `canUseTool`；旧集成不受影响，默认行为回退到 Step 1 之前的逐次弹窗。
- **中间件接受两种构造签名**：为了不破坏可能存在的外部调用，既接受旧的 positional `(tools, sandbox, ruleChecker, canUseTool, obs)`，也接受新的 `(tools, sandbox, options)`。检测方式：第三个参数若是对象且无 `checkDenied` 方法，则视为 options。

**新增测试**: 24 用例（PermissionPolicy 11 + PermitStore 8 + PermitCommand 5）。
**回归测试**: `bun test` 全量 271 pass / 4 skip / 0 fail。

**与设计规范对齐**:

- §4.1 风险分级表：已完整实现 L0-L3 四级。
- §4.2 批量授权卡：已落地 `BatchAuthCard`，支持 task/session 两档记忆。
- §4.2 "持久级（KK.md 中声明）"：接口已留（`persistent` scope 可通过 `store.addGrant` 程式化写入），但 `.kyberkit/permit.yaml` / KK.md 声明的自动加载尚未实现（留给 Step 4 或 Sprint 5 Hook）。
- §4.3 白名单审计：`/permit review` 落地。
- §4.3 "基于 fs_events 一键 revert"：未实现，需结合 Sprint 3.5 Step 3 的 TurnSummary 聚合能力。

**已知局限（留给后续 Step / Sprint）**:

- 没有 `.kyberkit/permit.yaml` 自动加载 — 持久授权目前只能程式化添加。
- `ToolPermissionOverlay` 的 L3 "二次键入确认"仅通过 `requiresSecondConfirm` 字段透传，TUI 上还是单 y/n，尚未实装二次键入。真正的 L3 硬化建议与 Hook 系统一同做。
- 批量卡的 grants 按 toolName 聚合，不按 path 精细化；若需要"只放行 `./reports/**`" 的精细授权，需要 PermitStore 扩展 pattern 字段。

### Step 3 — TurnSummaryBuilder + 卡片/紧凑块双渲染器 (完成)

**分支**: `sprint3.5/perception-contract`

**改动文件**:

| 文件 | 类别 | 说明 |
|------|------|------|
| `src/types/turn-summary.ts` | ADD | 新增 `TurnSummary` / `Deliverable` / `StepRecord` / `AssetRecord` / `TurnMetrics` 接口 (§5 数据契约) |
| `src/types/agent-events.ts` | MODIFY | 新增 `TurnSummaryEvent` 事件类型（`type: 'turn_summary'`, `summary: TurnSummary`） |
| `src/runtime/TurnSummaryBuilder.ts` | ADD | 聚合 `fs_events` 生成 Deliverables（同路径 create+modify 合并为 modify，delete 优先）；从 `task_plan.steps` 派生 `StepRecord`；从 `CumulativeUsage` 快照差值计算本任务 tokens |
| `src/runtime/AgentSession.ts` | MODIFY | 在 `send()` 中：监听 `task_plan` 记录任务入口 token 快照、缓存最新 planSteps；`task_complete` 通过后调用 `TurnSummaryBuilder.build()` 合成 `turn_summary` 事件，穿过 trajectory 并 yield |
| `src/tui/state/sessionReducer.ts` | MODIFY | `TurnState.turnSummary` 字段 + `turn_summary` case，把 summary 附加到对应 turn |
| `src/tui/components/TurnSummaryCard.tsx` | ADD | Ink 渲染器（交付物 / 过程 / 沉淀 + metrics 尾注）+ 纯字符串 `renderCompactSummary()` 供 no-TUI 复用 |
| `src/tui/components/TurnRenderer.tsx` | MODIFY | 在 assistantText 之后、error banner 之前渲染 `<TurnSummaryCard>`（仅当 `turn.turnSummary` 存在且 turn 已结束） |

**新增测试**:

- `src/runtime/TurnSummaryBuilder.test.ts` — 8 用例，覆盖空 fs_events、create+modify 合并、delete 晋升、token 差值、plan status 映射、无 db 回退、紧凑块格式、空交付物文案。
- `src/tui/state/sessionReducer.test.ts` — 新增 1 用例：`turn_summary` 事件挂载到 active turn 的 `turnSummary` 字段。

**测试结果**: `bun test` 全量 280 pass / 4 skip / 0 fail（本步骤新增 9 条 pass）。

**关键设计决策**:

1. **TurnSummary 合成留在 session 层而非 agentLoop**：AgentLoop 只负责模型/工具事件流；summary 合成需要读取 trajectory SQLite，属于会话编排层职责。把它放在 `AgentSession.send()` 的 for-await 内既能第一时间响应 `task_complete`，又不污染 middleware 管线。

2. **数据源单一真源**：Deliverables 完全来自 `fs_events`（Step 0 已落），不新增字段；StepRecord 来自 `task_plan.steps`（TUI 已在用）；Metrics 由 `TaskCompleteEvent.toolCalls/errors` + `CumulativeUsage` 快照差值合成。符合 §5.1 "不新增业务状态"的约束。

3. **Token 差值优先于绝对值**：对每个 `task_plan.taskId` 第一次出现时记录当时的 `CumulativeUsage`，`task_complete` 时再取快照，差值即为本任务消耗。当无起点快照（旧会话或乱序）时回退为结束快照的原值，保持前向兼容。

4. **双渲染器复用**：`<TurnSummaryCard>` 是 Ink 组件，`renderCompactSummary(summary): string` 是纯字符串函数，两者都读 `TurnSummary` 同一份数据契约，避免 TUI / no-TUI 两套字段逻辑漂移。§5.3 紧凑块 `──── 本轮交付 ────` 分隔线在两个实现里是完全一致的视觉语言。

5. **Deliverable 合并规则**：同路径多事件时 `delete` 一票否决成为最终态；`create + modify` 合并为 `modify`（因为文件已经存在并被改写）；`modify + modify` 继续为 `modify`。这个规则是 builder 私有实现，测试锁定。

**对 v2-upgrade-plan 的映射**:

- Sprint 3 Step 7 的 `<StreamingOutput />` 之后接入 `<TurnSummaryCard />` — 本步已在 TurnRenderer 内落地（Static 回收的历史 turn 与 active turn 共用 TurnRenderer，卡片仅在 `status !== 'streaming'` 时渲染，符合"收尾呈现"语义）。
- §5.4 "模型收尾正文不再复读文件名" — 软约束，本步骤未做 prompt 侧硬化。仓库里 PlanningHintProvider / KK.md 模板将择机补一条"结尾禁止复读 deliverables 路径"的行为约束，留给 Step 4 或 Sprint 5。

**已知局限（留给后续 Step / Sprint）**:

- `AssetRecord[]` 目前恒空 — memory/skill 填充在 Step 4 的 `memory.extracted` / `skill.suggested` 事件落地后通过 `TurnSummaryBuilder.build({ assets })` 注入。
- `steps.duration_ms` 未携带 — 由于 `steps` 表按 turn_id 存储（`task_id` 尚未加列），当前只渲染标题 + 状态。后续如需在卡片上显示每步耗时/工具，应给 `steps` 表加 `task_id` 字段并用 `queryStepsByTask` 聚合。
- 卡片上的 `[打开]` / `[导出 PDF]` / `[Ctrl+T 查看完整轨迹]` 等交互按钮尚未实装 — 本步聚焦静态数据渲染；交互事件（open / export / revealInFinder）需要 TUI 侧 action routing，一并在 Step 4 与 `/assets` 命令时打通。
- 提示词约束（§5.4 "收尾正文不再复读交付物"）未在本步实施，属于跨步骤的软约束，视 UAT 反馈决定是否硬化。

### Step 4 — Memory Toast + /assets + 资产成长条 (完成)

**分支**: `sprint3.5/perception-contract`

**改动文件**:

| 文件 | 类别 | 说明 |
|------|------|------|
| `src/types/events.ts` | MODIFY | `memory.written` 载荷扩展可选的 `category` / `title` / `path` / `source`（向后兼容，旧消费者不需要变更） |
| `src/memory/MarkdownMemoryStore.ts` | MODIFY | `write()` 发射的 `memory.written` 事件填充全部元数据字段，供 Toast 与 `/assets` 使用 |
| `src/memory/MarkdownMemoryStore.test.ts` | MODIFY | 用 `toMatchObject` 断言扩展后的事件 payload，保持对核心字段的精确校验 |
| `src/tui/state/sessionReducer.ts` | MODIFY | 新增 `MemoryToast` 接口 + `memoryToasts` 队列 + 4 条 actions（`memoryToastAdd` / `memoryToastDismiss` / `memoryToastRevertStart` / `memoryToastRevertDone`），`initialState()` 增补 `memoryToasts: []`，按 `entryId` 去重 |
| `src/runtime/WorkspaceInstance.ts` | MODIFY | 新增 `getLongTermMemory()` 公开访问器（供 Toast 撤回调用 `LongTermMemory.remove(id)`）；注册新 `AssetsCommand` 到命令表 |
| `src/commands/builtin/AssetsCommand.ts` | ADD | `/assets` 命令：按 scope/category 分组展示 Memories、按 title 展示 Skills、按名字聚合 Commands；无资产时输出 onboarding 提示 |
| `src/tui/hooks/useSession.ts` | MODIFY | 挂载时订阅 `memory.written`（过滤掉 `source: 'manual'` 避免 `/memory add` 也触发 Toast），通过 `dispatch({ kind: 'memoryToastAdd', ... })` 注入队列；`revertMemoryToast(id)` 调用 `runtime.getActiveWorkspace().getLongTermMemory()?.remove(entryId)` 并驱动 reverting→reverted 状态机；`dismissMemoryToast(id)` 直接出队 |
| `src/tui/components/MemoryToastStack.tsx` | ADD | 3s 倒计时 + Ctrl+Z 撤回 + 撤回后 1.5s "已撤回" 幽灵态，自动消隐；useInput 全局钩子保证用户无需聚焦 |
| `src/tui/components/AssetGrowthBanner.tsx` | ADD | 挂载时一次性横幅（§6.3 "资产成长条"），6s 自动折叠为单行，`i` 键折叠/展开；记忆或技能 > 0 时才出现 |
| `src/tui/REPL.tsx` | MODIFY | 在 IdentityBand 之后 NarrativeBand 之前插入 `<AssetGrowthBanner>`；在 BatchAuthCard/ToolPermissionOverlay 之前插入 `<MemoryToastStack>`；从 `useSession` 解构 `revertMemoryToast` / `dismissMemoryToast` |
| `src/commands/builtin/AssetsCommand.test.ts` | ADD | 4 用例：空 manifest 文案、按 category 计数、skill 标题展示、回退到 relativePath |
| `src/tui/state/sessionReducer.test.ts` | MODIFY | 新增 2 用例覆盖 `memoryToastAdd` 去重 + revert 生命周期 |

**新增测试**: 6 条 pass（4 AssetsCommand + 2 sessionReducer memoryToast）。

**测试结果**: `bun test` 全量 286 pass / 4 skip / 0 fail。

**关键设计决策**:

1. **事件源选择：`memory.written` 而非 `memory.extracted`**。前者已存在并由 `MarkdownMemoryStore.write()` 在每个条目落盘时发射（一次一事件），天然匹配"一条记忆一个气泡"的 UI 语义；后者是批量聚合事件（一个 turn 多条时只发一次），缺少标题维度。本步扩展 `memory.written` 载荷是最小侵入修改。

2. **手动写入不打扰**：`/memory add` 最终也走同一 `write()` 路径，`source: 'manual'` 会把 Toast 过滤掉，避免"用户自己刚敲完命令又被弹窗打扰"。与 §4 "最小打扰"契约一致。

3. **撤回路径走 id 而非 path**：`LongTermMemory.remove(id)` 是既有契约（Sprint 4 已落）。Toast 只需要 `entryId` 就能撤回，不耦合文件系统细节。路径字段仅用于展示（verbose 模式下的透明度）。

4. **MemoryToastStack 的 3 s 倒计时内部持有**：组件自己用 `setInterval(500ms)` 驱动 re-render，而不是广播给全 TUI。因为 Toast 的时钟是独立的视觉语言，绑到全局 1Hz `uiClock` 既不够细、又会拖累其他组件。

5. **资产成长条作为"体验糖"而非关键路径**：AssetGrowthBanner 不做跨会话持久化（没有 "上周新增 3" 比对），只展示"当前沉淀总量"。设计规范 §6.3 明确标注为体验糖，允许粗略；后续若加 `trajectory` 维度的"轮数/节约时间"估算，应该从 `KyberAnalyticsDb` 聚合而不是新建状态。

6. **AssetsCommand 数据源与 Prompt Assembler 共源**：`assets.getManifest()?.entries` 即 `PromptAssembler` 里 MemoryProvider / ActiveSkillsProvider 使用的同一份数据，保证 `/assets` 输出与"实际注入模型的内容"一致。§6.2 "与文件系统计数精确一致" 由此得到保证。

**对 v2-upgrade-plan 的映射**:

- Sprint 4 · Step 10 "LT Memory 提取" 已落的 `memory.extracted` 事件本步未改动；Toast 直接订阅下游的 `memory.written`，解耦了"批量触发"和"单条展示"两层。
- Sprint 2 · Step 6 "Command 系统"与 Step 4 "AssetRegistry" 在本步合流为 `/assets` 命令——数据源（manifest）、渲染（`CommandResult.output`）、注册（`WorkspaceInstance.commandRegistry`）均直接复用既有基础设施，零新 API。

**已知局限（留给 Sprint 4/5 或后续）**:

- Toast 不会回填到 `TurnSummary.assets` — `memory.extracted` 是 fire-and-forget（`MemoryTriggerMiddleware` 在 `end_turn` 后异步执行），往往晚于 `task_complete` / `turn_summary` 事件到达；本步没有引入延迟合成或事后补丁机制。若需要在 TurnSummary 卡片上看到本轮 Memory，应在 `MemoryTriggerMiddleware` 之前加一个"缓冲 → 延后 flush"的排序约束（或让 TurnSummaryBuilder 订阅 bus 事件做 post-update）。
- `AssetGrowthBanner` 文案"累计 X 轮对话 / 节省 Xh"留空。完整实现需要 cross-session 的 `KyberAnalyticsDb.countTurns` 聚合以及对 `turnsLifetime` 属性的注入。当前 banner 仅展示静态总数。
- `Skills` 列表未显示"用过 N 次"和"建议态"（§6.2 mock 中 `◯` 标记），需要 `SkillUsageCounter` 持久化（当前 AssetRegistry 只扫盘不计用量）。
- `/assets` 输出是静态文本；"接受 / 忽略 / 查看" 等交互按钮无法在现有命令渲染管线中实现，需要扩展 `CommandResult` 增加 `interactiveActions` 或切换到"命令返回 React 组件"的新架构，留作 Sprint 5 议题。

---

*Sprint 3.5 设计规范结束。与 [./v2-upgrade-plan.md](./v2-upgrade-plan.md) 互为引用。*
