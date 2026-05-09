# Kevin 2.0 UX 研讨输出（V1）

## 0. 目标与边界

- 目标：在 Kevin 产品定位与底层理念不变前提下，参考 Claude Design（CD）重构 Kevin 2.0 界面布局与交互。
- 不变项：Kevin 仍是企业场景下的桌面终端与边缘节点，不转型为纯设计工具或纯聊天工具。
- 范围：聚焦信息架构、面板关系、交互状态机、签批与归档闭环；不涉及底层运行时重写。

---

## 1) Kevin 1.5 必须保留的 UX 骨架（UX Invariants）

### 1.1 产品心智骨架

1. 业务制品是主角，AI 对话是助手，不可反转主次。
2. 可控与可审计优先于炫技，所有高风险动作必须可拦截。
3. Space/Library 隔离是用户心智与数据安全边界，不可弱化。
4. 异步任务必须“可感知、可追踪、可回看”。

### 1.2 结构骨架

- 左侧：Space/Library、Docs、Sensors、Sessions、Skills 的导航枢纽。
- 中侧：Artifact 主舞台（结果展示与后续编辑的中心）。
- 右侧：Chat + Trace + Sign-off 内联执行区。
- 顶部：灵动岛承担任务状态与关键提醒。

### 1.3 交互骨架

- Sign-off 三处同步提示（右侧卡片/顶部灵动岛/左侧会话标记）。
- 任务状态机至少包含 `queued/running/awaiting-signoff/completed/failed/cancelled`。
- 多窗口下任务归属到 Space，不跨 Space 污染通知。
- Skill 仍遵循“蒸馏 + 渐进式学习”原则，UI 不暗示“强预装技能”。

---

## 2) Claude Design 模式到 Kevin 2.0 的映射


| Claude Design 模式     | Kevin 2.0 对应能力                | 适配说明                          |
| -------------------- | ----------------------------- | ----------------------------- |
| Design Canvas 预览区    | Artifact Canvas（制品画布）         | 从“仅预览”升级为“可操作预览”，支持多类制品。      |
| Layers/Structure 视图  | 结构树（文档块/组件块/数据块/Diff 块）       | 不限定 UI 组件，抽象为“可寻址块”。          |
| Tweaks 微调面板          | 右侧可切换 `Trace/Tweaks/Comments` | 减少“改一个颜色也要写 prompt”。          |
| Comments/选区修改        | 选区批注 + 就地指令                   | 每次修改绑定块 ID，便于审计与回滚。           |
| Workspace 文件组织       | 左侧 Library + 中侧制品列表           | 沿用 Space/Library 语义，不引入新心智负担。 |
| Design System Config | Kevin Registry（主题/模板/输出规范）    | 把“设计系统”扩展成“制品输出规范系统”。         |
| Preview to Repo      | Live Sync to PR               | 继续走 Sign-off 和审计链，避免“无门槛直推”。  |


映射原则：

- 借鉴交互机制，不借鉴产品定位。
- 任何“高效率入口”都不能绕过 Sign-off/审计。
- 任何“可视化编辑”都要有结构 ID 和可回溯记录。

---

## 3) Kevin 2.0 界面布局候选（文本线框图）

> 以下 3 个候选均保留 Kevin 的产品心智，仅调整布局重心与交互密度。

### 方案 A：平衡三栏（保守升级）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ KevinLogo | DynamicIsland(Task/Signoff/Context) | Search | Bell | ⚙ │
├──────────────────┬──────────────────────────────────────┬────────────┤
│ LeftNav          │ ArtifactCanvas                       │ RightPanel │
│ - Space/Library  │ [Preview|Structure|Review]          │ [Chat]     │
│ - Docs           │                                      │ [Trace]    │
│ - Sensors        │ Main Artifact Area                   │ [Tweaks]   │
│ - Sessions       │                                      │ [Comments] │
│ - Skills         │                                      │            │
└──────────────────┴──────────────────────────────────────┴────────────┘
```

特点：迁移成本低，最贴近 1.5；缺点是“画布升级感”不够强。

### 方案 B：画布优先（CD 借鉴更深）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ KevinLogo | DynamicIsland | ModeSwitch(Work/Canvas) | Bell | ⚙      │
├───────────────┬───────────────────────────────────────────────┬──────┤
│ ProjectRail   │ Canvas Stage                                  │ Side │
│ - Space       │ (Large Preview Area)                          │ Panel│
│ - Library     │ ┌ Structure Drawer (toggle) ┐                 │      │
│ - Artifacts   │ └ Bottom Timeline / Review   ┘                │Chat/ │
│ - Tasks       │                                               │Trace/│
│               │                                               │Tweak │
└───────────────┴───────────────────────────────────────────────┴──────┘
```

特点：视觉冲击强、编辑效率高；缺点是对老用户学习成本高。

#### 方案 B 细化线框图（高保真文本版）

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Kevin] [Space: Growth-OPS v] [Library: /biz/growth] [Mode: Canvas] [GlobalSearch] [Island] [Bell] [⚙] [Me]│
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ LEFT: Project Rail (240)  │                CENTER: Canvas Stage (adaptive)                │ RIGHT: Side (360)│
├───────────────────────────┼──────────────────────────────────────────────────────────────────┼──────────────────┤
│ + New Artifact            │ Toolbar: [Preview] [Structure] [Tweak] [Review] [Share▼]      │ Tabs:             │
│                           │         [Device:Desktop▼] [Zoom - 100% +] [Snap] [Grid]       │ [Chat] [Trace]    │
│ Space                     │──────────────────────────────────────────────────────────────────│ [Inspector]       │
│ - Overview                │                                                          ^       │ [Comments]        │
│ - Artifacts (12)          │   ┌──────────────── Canvas Viewport ──────────────────┐  │       │ [Sign-off]        │
│ - Tasks (3)               │   │                                                   │  │       │                  │
│ - Sessions                │   │   Selected Block: hero.metrics.card               │  │       │ Chat Tab         │
│ - Audit                   │   │   ┌─────────────────────────────────────────────┐  │  │       │ - Prompt input   │
│                           │   │   │ KPI Card / PRD Section / Table / Slide ... │  │  │       │ - Slash actions  │
│ Library                   │   │   └─────────────────────────────────────────────┘  │  │       │ - Quick attach   │
│ - docs/                   │   │                                                   │  │       │                  │
│ - reports/                │   │   Inline affordance: [Comment] [Rewrite] [Style] │  │       │ Inspector Tab    │
│ - templates/              │   │                                                   │  │       │ - block_id       │
│                           │   └───────────────────────────────────────────────────┘  │       │ - typography     │
│ Artifact Types            │                                                          │       │ - spacing        │
│ - PRD                     │  <--- Left Drawer (toggle) --->                           │       │ - theme token    │
│ - Dashboard               │  Structure Tree                                            │       │                  │
│ - Strategy Memo           │  - Page                                                   │       │ Sign-off Tab     │
│ - Slide                   │    - Section A                                             │       │ - target action  │
│                           │      - Block 1 (selected)                                 │       │ - diff preview   │
│ Running Tasks             │      - Block 2                                             │       │ - Approve/Reject │
│ - weekly-report (42%)     │    - Section B                                             │       │ - timeout queue  │
│ - feishu-sync (awaiting)  │                                                            │       │                  │
├───────────────────────────┼────────────────────────────────────────────────────────────┴──────────────────┤
│ Bottom Review Timeline (full width of center+right)                                                         │
│ [v17 current] -- [v16 accepted] -- [v15 comment] -- [v14 signoff-required] -- [v13 exported]               │
│ Diff Controls: [Side-by-side] [Unified] [Accept] [Reject] [Undo] [Redo]                                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### 方案 B 的交互分层（对应线框图）

- 顶栏（全局态）：Space/Library/模式切换/灵动岛任务态。
- 左栏（项目态）：制品集合、任务、审计、文件入口。
- 中栏（编辑态）：大画布 + 结构抽屉（可开关）+ 局部就地操作。
- 右栏（控制态）：Chat/Trace/Inspector/Comments/Sign-off 五态切换。
- 底栏（评审态）：版本时间线 + Diff 决策按钮。

#### 方案 B 的关键优势与风险（用于评审）

- 优势：画布沉浸感强；局部修改效率高；结构化评审路径清晰。
- 风险：信息层级多，初次上手成本高；需要强约束避免“右栏功能爆炸”。

### 方案 C：双层工作台（推荐）

```text
┌──────────────────────────────────────────────────────────────────────┐
│ KevinLogo | DynamicIsland(任务+上下文) | GlobalSearch | Bell | ⚙     │
├──────────────────┬──────────────────────────────────────┬────────────┤
│ LeftNav          │ CenterWorkbench                      │ RightPanel │
│ Space/Library    │ ┌ Canvas Modes ───────────────────┐ │ Tab:       │
│ Docs/Sensors     │ │ Preview | Structure | Edit |    │ │ Chat/Trace │
│ Sessions/Skills  │ │ Review                           │ │ Inspector  │
│                  │ └──────────────────────────────────┘ │ Comments   │
│                  │ Artifact Canvas + Block Selection    │ Sign-off   │
└──────────────────┴──────────────────────────────────────┴────────────┘
```

特点：保留 1.5 骨架，同时把中栏升级为“多模式画布”；右栏通过 Tab 收敛信息密度。

---

## 4) 布局对比与推荐


| 评估维度            | 方案 A | 方案 B | 方案 C（推荐） |
| --------------- | ---- | ---- | -------- |
| 与 1.5 一致性       | 高    | 低    | 中高       |
| 画布能力表达          | 中    | 高    | 高        |
| 学习成本            | 低    | 高    | 中        |
| 工程落地风险          | 低    | 中高   | 中        |
| 对 Sign-off/审计兼容 | 高    | 中    | 高        |
| 对多制品类型扩展性       | 中    | 中    | 高        |


推荐结论：**方案 C（双层工作台）**。

推荐理由：

1. 兼容 1.5 的认知资产（用户不需要重学“Kevin 是什么”）。
2. 中栏具备足够的 2.0 进化空间（从展示台升级为画布）。
3. 右栏通过 `Chat/Trace/Inspector/Comments/Sign-off` 分层，避免信息互相打架。
4. 便于分阶段上线：先上模式框架，再逐步填充高级编辑能力。

---

## 5) 核心流程与状态定义（MVP）

### 5.1 生成到归档主流程

```text
输入任务 -> 任务排队(queued) -> 运行(running)
       -> 生成制品并进入 Preview
       -> 用户在 Structure/Edit/Comments 中微调
       -> 若涉及中高风险动作: awaiting-signoff
       -> 审批通过后执行 -> completed
       -> 归档到当前 Library + 写入审计 + 可选 Live Sync(PR)
```

### 5.2 选区微调流程（Block-level）

```text
用户在 Canvas 选中块(BlockID)
-> 右栏 Inspector 加载块属性
-> 用户修改样式/结构参数 或 添加评论指令
-> 系统生成变更预览(Diff)
-> 用户 Accept/Reject
-> 记录变更日志(含 block_id, actor, timestamp)
```

MVP 约束：

- 每次微调必须绑定 `block_id`。
- 所有 Accept/Reject 都可回放。
- 支持撤销与最近变更历史。

### 5.3 Structure 视图流程

```text
切换到 Structure
-> 展示树: Section/Block/Component/DataRegion
-> 支持定位到画布并高亮
-> 支持重命名、折叠、重排(受类型约束)
-> 提交后刷新 Preview 与审计记录
```

### 5.4 Sign-off 流程（沿用 1.5 并增强）

```text
任务触发 medium/high actuator
-> 右栏出现 Sign-off 卡片 + 灵动岛红点 + 左侧会话红点
-> 用户 Approve / Reject / EditThenApprove
-> 超时进入 awaiting-signoff 队列
-> 决策写审计日志并反馈到任务流
```

### 5.5 灵动岛 2.0 语义升级

在保留任务状态功能的基础上，新增“上下文锚点”：

- 空闲：当前会话/制品标题
- 编辑中：当前选中块 + 可执行动作提示
- 运行中：任务进度 + ETA
- 待签批：待处理数量 + 快速跳转
- 完成瞬态：摘要 + 查看制品

---

## 6) Kevin 2.0 UX 原则（可作为评审检查清单）

1. **主次原则**：中栏制品优先，右栏 AI 信息不夺主。
2. **可控原则**：所有自动化动作都可预览、可拒绝、可回放。
3. **边界原则**：Space/Library 隔离与路径一致性不妥协。
4. **渐进原则**：先“可操作画布”，再“高阶自动化编排”。
5. **一致原则**：Chat、Canvas、Sign-off、Audit 使用同一套任务与对象 ID。

---

## 7) MVP 交付建议（按阶段）

### Phase 1（结构升级）

- 落地方案 C 的面板骨架与模式切换。
- 中栏支持 `Preview/Structure/Review` 基本切换。
- 右栏完成 `Chat/Trace/Sign-off` 分层。

### Phase 2（编辑升级）

- 新增 `Edit/Inspector/Comments`。
- 支持 Block-level 选区和 Diff 审核。
- 灵动岛增加“上下文锚点”。

### Phase 3（闭环升级）

- Kevin Registry（输出规范）初版。
- Live Sync 到 PR（受 Sign-off 和审计门控）。
- 引入跨制品模板化策略（PRD/报表/PPT/配置单）。

---

## 8) 本轮研讨结论

- Kevin 2.0 不是“改定位”，而是“升级交互操作系统”。
- 最优路径是：**保留 1.5 核心心智 + 引入 CD 的画布/结构/微调能力**。
- 推荐布局：**方案 C（双层工作台）**，并按 Phase 1~3 渐进交付。

