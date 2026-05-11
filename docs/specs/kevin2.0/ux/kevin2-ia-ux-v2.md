# Kevin 2.0 IA / UX 设计稿（V2）

> 本文用于沉淀 Kevin 2.0 IA 与 UX 的阶段性共识。  
> 目标不是改变 Kevin 的产品定义，而是在保持 Kevin 作为「桌面终端与边缘节点」定位的基础上，参考 Claude Design 重新组织信息架构、工作对象与交互闭环。

## 1. 设计立场

Kevin 2.0 不应被设计成单纯的聊天工具、文件管理器或 UI 设计器。它应该是一个面向复杂工作的 **语义工作空间（Semantic Workspace）**：

- 用户看到的不是一堆目录，而是当前工作场景的状态、对象、制品与动作。
- 文件和目录仍然重要，但它们退到材料与存储层，不再垄断产品心智。
- Agent 不是主角，业务对象与业务制品才是主角。
- 用户先理解“连接了哪些系统”，再理解这些系统开放了哪些读取、监听、写入或执行能力。
- 执行动作默认隐身，只有在用户决策、风险动作或签批时显现。

Kevin 2.0 对 Claude Design 的借鉴重点不是“设计工具化”，而是：

- 以工作画布承载主要对象。
- 以结构视图让生成物可控。
- 以局部微调减少重复 prompt。
- 以评论、选区、Diff 与版本时间线支撑审查。
- 以 Workspace 配置把连接器、能力授权、输出规范和执行策略前置。

## 2. 核心转向：从文件工作区到语义工作区

### 2.1 Kevin 1.5 的基础

Kevin 1.5 已经建立了几个重要基座：

- Space 是会话、任务、自动化的上下文隔离边界。
- Library 是用户绑定的本地工作目录。
- Artifact 是 Agent 产出的业务制品。
- Sensor/Actuator 是底层能力模型：前者负责感知，后者负责执行。
- 灵动岛负责异步任务、签批和关键状态感知。

这些约束在 2.0 中仍然成立，尤其是 Rev3 中规定的：

- 每个 Space 绑定一个 Library。
- Library 必须有用户选择或确认的本地挂载路径。
- Kevin 内 Agent 文件访问根必须与当前 Library 挂载路径一致。
- 会话、任务、通知必须按 Space/Library 隔离。

### 2.2 Kevin 2.0 的升级

Kevin 2.0 要在上述基础上增加一层语义抽象：

```text
Kevin 1.5:
Space + Library + Files + Artifacts

Kevin 2.0:
Semantic Workspace + Connectors + Materials + Semantic Artifacts + Actions
```

也就是说：

- Library 不再直接等于用户心智里的 Workspace。
- 文件不再直接等于制品。
- Workspace 是工作图谱、视图和策略的组合。
- Connector 是用户接入外部系统或本地能力的统一入口。
- Artifact 是有类型、有结构、有状态、有动作的语义对象。

## 3. 三层对象模型

Kevin 2.0 需要把「用户在做什么」和「东西存在哪里」分开，因此建议采用三层模型。

### 3.1 Semantic Layer：语义层

语义层是用户真正理解和操作的对象。

它回答的问题是：**我正在处理什么工作对象？**

示例：

- 产品场景：PRD、需求池、实验方案、发布计划。
- 股票场景：投资组合、个股持仓、调仓策略、日终盘点。
- 自媒体场景：账号矩阵、内容包、粉丝画像、选题灵感。

语义层的核心对象：

- `SemanticWorkspace`：一个工作场景的语义容器。
- `WorkspaceView`：该工作场景的视图，例如 Dashboard、List、Timeline、Materials。
- `KevinRegistry`：Artifact 类型系统与渲染/编辑规则的主注册表。
- `Connector`：外部系统或本地能力入口，例如飞书、小红书、数仓、券商接口。
- `Capability`：Connector 暴露的具体能力，例如读取、监听、写入、发布、下单。
- `SemanticArtifact`：可编辑、可审查、可执行、可归档的成果对象。
- `ActionRequest`：绑定在语义对象上的一次可执行动作请求。
- `Policy`：告警、权限、签批、发布等规则。

### 3.2 Material Layer：材料层

材料层是 Kevin 引用、加工、拼装、生成的材料集合。

它回答的问题是：**Kevin 用哪些材料完成这件事？**

材料可以来自：

- 本地文件：Markdown、PDF、CSV、PPT、图片、视频。
- 外部数据：行情接口、平台后台、数仓、埋点、评论区。
- 外部文档：飞书文档、网页、知识库。
- 模板：PRD 模板、复盘模板、内容脚本模板。
- 中间产物：临时分析表、截图、图表、草稿片段。

Material 不等于文件。文件只是 Material 的一种来源。

### 3.3 Storage Layer：存储层

存储层是物理落盘、索引、缓存、审计与恢复机制。

它回答的问题是：**东西最终存在哪里，如何恢复，如何审计？**

存储层包括：

- Library 挂载路径：用户选择的本地工作目录。
- `~/.kyberkit/kevin/`：Kevin 用户层配置、凭证、全局技能等。
- `~/.kyberkit/kevin/lib-<libraryId>/`：当前 Library 的会话库、索引、缓存、技术元数据。
- 审计日志：动作调用、签批决策、发布记录。
- 导出文件：Markdown、PDF、CSV、HTML、图片、视频包等。

### 3.4 三层关系

```text
Semantic Layer
用户看到和操作的工作对象
Workspace / Artifact / Action / Policy

        uses / cites / generates

Material Layer
Kevin 使用和加工的材料
Files / Connector Data / Connector Feeds / Templates / Media / External Docs

        persists / indexes / audits

Storage Layer
物理和技术存储
Library Mount / lib-<libraryId> / DB / Cache / Audit
```

## 4. 核心对象定义

### 4.1 SemanticWorkspace

`SemanticWorkspace` 是 Kevin 2.0 的主心智对象。它不是目录，而是围绕一个工作目标组织起来的工作图谱。

建议包含：

- `workspace_id`：语义工作空间 ID。
- `space_id`：Rev3 要求的 Space UUID。
- `library_id`：绑定的 Library UUID。
- `mount_path`：用户绑定的本地目录。
- `name`：项目名或工作空间名。
- `work_type`：工作类型，例如 product_design、data_analysis、investment、media_ops、general。
- `views`：Dashboard、Artifacts、Materials、Async Jobs、Audit 等视图。
- `connectors`：当前工作空间接入的系统或本地能力入口。
- `capabilities`：当前 Workspace 已启用的读取、监听、写入、执行能力。
- `policies`：告警阈值、执行权限、签批规则、归档规则。

### 4.2 WorkspaceView

WorkspaceView 是进入工作空间后用户看到的主要视图。

建议内置几类：

- `Home`：工作空间概览、设置、连接器健康、最近任务。
- `Dashboard`：状态面板，展示关键指标、告警、重要对象。
- `Artifacts`：语义制品列表，不只是文件列表。
- `Materials`：材料视图，包含文件树、外部文档、数据源、媒体素材。
- `Async Jobs`：长期自治任务与回流记录。
- `Audit`：动作调用、签批、发布与归档记录。

### 4.3 SemanticArtifact

SemanticArtifact 是 Kevin 2.0 中最重要的工作对象。它可以导出为文件，但它本身不是文件。

建议包含：

- `artifact_id`：制品 ID。
- `type`：制品类型，例如 prd、dashboard、portfolio_strategy、content_package、daily_report。
- `schema_ref`：指向 Kevin Registry 中的结构定义，用于渲染、校验和局部编辑。
- `state`：draft、review、approved、published、archived。
- `blocks`：可寻址结构块，用于选区、评论、Diff、局部微调。
- `materials`：引用的材料列表。
- `actions`：该制品支持的动作。
- `storage_ref`：对应的落盘位置或导出记录。
- `audit_ref`：审计与版本历史。

### 4.4 Kevin Registry

Kevin Registry 是 Kevin 2.0 的制品类型系统。它负责定义 Artifact 的类型、结构、渲染、编辑、校验、动作与审查规则，是 `SemanticArtifact.schema_ref` 的单一真源。

核心原则：

- Registry 定义通用 Artifact 类型与基础规则。
- Skill 使用 Registry 中的类型生成内容，不能各自私有定义同名类型。
- Skill 可以在受控流程中注册扩展类型，但扩展类型必须进入 Registry 才能被 UI 稳定渲染和编辑。
- Connector 只提供 Materials 与 Capabilities，不直接定义 Artifact schema。
- Artifact Instance 是一次实际生成的制品实例，引用 Registry 中的类型定义。

Registry 建议包含：

- `artifact_type`：制品类型，例如 daily_report、content_package、portfolio_strategy。
- `schema`：结构字段与 block model。
- `renderer`：Preview / Dashboard / Card / Document 等渲染方式。
- `editor_capabilities`：可局部编辑的字段、参数、样式和结构。
- `allowed_actions`：该类型允许触发的 ActionRequest。
- `validation_rules`：输出校验、必填字段、格式约束。
- `export_formats`：Markdown、PDF、HTML、CSV、媒体包等。
- `review_flow`：默认 Diff、审批、版本和发布流程。

示例：

```text
Artifact Type: daily_report
- blocks: summary, metric_table, insight_cards, next_actions
- renderer: document + cards
- editor: block-level rewrite, metric explanation, tone tweak
- actions: export_pdf, write_feishu, archive
- review: block-level diff

Artifact Type: content_package
- blocks: title, hook, script, cover_prompt, tags, assets
- renderer: package view + platform preview
- editor: variant generation, tone tweak, platform adaptation
- actions: publish_platform, export_assets, archive
- review: field-level diff + publish sign-off

Artifact Type: portfolio_strategy
- blocks: thesis, positions, target_weights, risk_notes, backtest_result
- renderer: dashboard + strategy card
- editor: parameter tweak, assumption edit, risk explanation
- actions: simulate, rebalance_request, export_report
- review: scenario diff + high-risk sign-off
```

#### Registry / Skill / Connector 的边界

```text
Kevin Registry
  定义 Artifact 类型系统、渲染、编辑、校验和审查规则

Skill
  声明输出类型，填充内容，编排生成流程；可受控注册扩展类型

Connector
  提供材料与动作能力，不定义 Artifact schema

Artifact Instance
  某次实际生成的制品，引用 registry type 并持有内容、状态、版本和审计记录
```

在产品 UI 中，不需要直接暴露 “schema” 这个词。用户可以看到：

- `Artifact Types`
- `Output Formats`
- `Workspace Templates`
- `Content Structures`

例如初始化 Media Ops Workspace 时，Kevin 可以提示：

```text
Suggested Artifact Types
- Content Package
- Audience Insight
- Post Report
- Inspiration Card
```

### 4.5 Connector

Connector 是用户可见的一级接入对象。它代表一个外部系统、本地系统或能力集合，而不是单纯的 Sensor 或 Executor。

推荐用户侧命名：

- `Connector`：连接器，例如 Feishu、Xiaohongshu、Data Warehouse、Broker、Local Files。
- `Capability`：连接器开放的具体能力。
- `Policy`：该能力对应的权限、风险、签批和审计规则。

Connector 可以是纯感知型，也可以是感知和执行一体型：

```text
Data Warehouse Connector
- Read Metrics: sense
- Watch Thresholds: sense
- Write Back: unsupported

Feishu Connector
- Read Docs: sense
- Watch Comments: sense
- Write Docs: act, medium risk, sign-off required
- Send Message: act, medium risk, sign-off required

Xiaohongshu Connector
- Read Trends: sense
- Read Comments: sense
- Publish Post: act, medium/high risk, sign-off required
```

Connector 建议包含：

- `connector_id`：连接器 ID。
- `display_name`：用户可读名称。
- `status`：connected、degraded、disconnected、reauth_required。
- `capabilities`：该连接器可用能力列表。
- `credentials_ref`：凭证引用，不暴露原始密钥。
- `activity`：最近读取、监听、写入、发布等活动。
- `policies`：默认权限、风险、签批、审计策略。

### 4.6 Capability

Capability 是 Connector 对外暴露的最小能力单元。它把底层 Sensor/Actuator 统一到用户可理解的 Read/Watch/Write/Execute 模型。

建议字段：

- `capability_id`：能力 ID。
- `connector_id`：所属连接器。
- `label`：用户可读名称，例如“读取文档”“发布笔记”“查询指标”。
- `kind`：read、watch、write、execute。
- `maps_to`：底层能力映射，sense 或 act。
- `risk_level`：low、medium、high。
- `enabled`：是否在当前 Workspace 启用。
- `requires_signoff`：是否需要签批。
- `audit_required`：是否必须写审计。

映射规则：

```text
Read / Watch  -> Sense Capability -> 底层 Sensor
Write / Execute -> Act Capability -> 底层 Actuator
```

### 4.7 AsyncJob

AsyncJob 不是“慢任务”，而是 **不需要用户持续监督的自治任务**。

建议包含：

- `job_id`：任务 ID。
- `space_id` / `library_id`：隔离上下文。
- `trigger`：manual、cron、connector_event、threshold。
- `scope`：监听范围，例如某个账号、某个股票组合、某个线上产品。
- `connector_id` / `capability_id`：任务依赖的连接器与能力。
- `output_policy`：回流策略。
- `risk_policy`：是否会触发签批。
- `state`：queued、running、watching、awaiting-signoff、completed、failed、paused。

AsyncJob 的回流方式有三类：

- 产物回流：生成日报、周报、告警报告，并写入当前 Workspace/Library。
- 事件回流：向 Kevin 面板、灵动岛、通知中心推送告警。
- 动作回流：生成待签批动作，例如调仓建议、内容发布建议、飞书写入建议。

### 4.8 ActionRequest

ActionRequest 是绑定在语义对象上的一次动作请求，而不是一个常驻工具栏。它通常由用户点击 Artifact 动作、Kevin 生成建议或 AsyncJob 回流触发。

建议包含：

- `action_id`：动作 ID。
- `target_artifact_id`：目标制品。
- `connector_id`：目标连接器。
- `capability_id`：目标能力，通常是 write 或 execute。
- `actuator_id`：底层 Actuator 映射。
- `risk_level`：low、medium、high。
- `preview`：执行前预览或 Diff。
- `signoff_required`：是否需要签批。
- `audit_policy`：审计策略。

动作面板默认隐藏。只有以下情况才显现：

- 用户点击制品上的动作按钮。
- Kevin 生成可执行建议。
- 异步任务回流一个待决策动作。
- 中高风险能力进入 Sign-off。

## 5. 阶段化 IA

Kevin 2.0 不再是固定三栏从头到尾不变，而是根据工作阶段调整信息架构。

阶段化 IA 的关键不是“每个阶段换一套页面”，而是定义同一组面板在不同阶段如何展开、收敛和转化：

- `Home Rail`：Workspace 入口、设置、对象导航。
- `Chat Stream`：与 Kevin 的对话、任务发起、过程解释。
- `Workspace Panel`：Dashboard、Artifacts、Materials、Async Jobs、Audit。
- `Artifact Canvas`：当前制品的主视图。
- `Artifact Panel`：结构、评论、版本、动作。
- `Action Panel`：执行预览、风险、签批；默认隐藏。

面板优先级规则：

```text
Setup 阶段：Workspace Contract 优先，Chat Stream 不出现
Workspace 阶段：Chat Stream + Workspace Panel 并列
Artifact 阶段：Artifact Canvas + Contextual Chat 常驻并列
Action 阶段：Action Panel 临时抢占右侧或浮层，直到决策完成
```

### 5.1 阶段一：Library / Workspace 初始化

目标：建立一个可工作的语义空间。

用户需要完成：

- 定义项目或工作空间名称。
- 绑定本地 **资料库** 路径。
- 选择 **工作包**（Work type pack），并配置该工作包下的制品模板包、默认输出相关项与 **写入类签批默认**（仅作用于外部连接器写入类功能的默认倾向）。
- 配置 **连接器**（含从 **连接器目录** 添加；支持 **稍后配置** 跳过外部连接器）。
- 为每个连接器启用具体 **功能**（Capabilities），并在功能矩阵中确认风险与签批（相对工作包默认可为继承或覆盖）。
- 审阅完整 **工作区契约** 后创建。

**定稿流程（四步 + 右侧契约预览）**：与 PRD `prd-reboot/05-ux-ia-alignment.md` §2.1.1 及原型 `prototypes/kevin2-hifi-v2` 中「创建工作区」一致。

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 创建工作区                                              ①②③④ 步骤 · 无聊天流 │
├──────────────────────────────────────────────────────────┬─────────────────┤
│ ① 全局：工作区名称、资料库                               │ 预览 · 工作区契约 │
│    工作包 Tab：模板包、默认输出、写入类签批默认            │                 │
│ ② 三栏：已选连接器 │ 中间引导 │ 右栏连接/重试           │                 │
│    连接器目录（连接器 / MCP / Skill）· [稍后配置]        │                 │
│ ③ 按连接器的功能表：风险、签批（继承/已覆盖）             │                 │
│ ④ 审阅并 [创建工作区]                                    │                 │
└──────────────────────────────────────────────────────────┴─────────────────┘
```

#### 面板状态

```text
Home Rail: hidden
Chat Stream: hidden
Workspace Panel: replaced by Setup Summary
Artifact Canvas: hidden
Artifact Panel: hidden
Action Panel: hidden
```

初始化阶段不需要对话流。Kevin 可以用说明文案、智能建议和连接器推荐辅助用户配置，但不应把用户拖入聊天模式。此阶段的核心任务是建立 Workspace Contract，而不是发起任务。

#### 收敛形态

- Workspace 设置在创建完成后收敛到 `Home > Settings`。
- Connectors 与 Capabilities 收敛到 `Home > Connectors`。
- 本地目录路径收敛到 `Home > Library` 和 `Materials > Files`。
- 默认策略收敛到 `Home > Policies`。

这里的关键不是“建一个目录”，而是建立：

```text
WorkspaceProfile = name + work_type + library + connectors + capabilities + policies
```

初始化阶段的关键 UX 是：用户看到的是“我接入了哪些系统，以及允许 Kevin 对这些系统做什么”。

```text
Connectors
- Feishu
  - Read Docs: enabled
  - Write Docs: enabled, medium risk, sign-off required
  - Send Message: disabled

- Data Warehouse
  - Query Metrics: enabled
  - Watch Thresholds: enabled
  - Write Back: unsupported

- Xiaohongshu
  - Read Trends: enabled
  - Read Comments: enabled
  - Publish Post: enabled, medium/high risk, sign-off required
```

### 5.2 阶段二：进入 Workspace 后的工作态

> **定稿布局见 §5.2b**；本节保留早期三栏与 Chat 职责叙述，便于对照历史讨论。

进入项目后，界面应更像 Claude Design 的 Workspace，但保留 Kevin 的业务语义。

默认状态：

- 左栏收敛为 Home Rail，提供 Workspace 的主要对象入口。
- 中栏是 Chat Stream，承载对话、任务发起和过程解释。
- 右栏默认打开 Workspace Panel，而不是纯文件树。
- Materials 中包含本地工作目录，用户仍可选文件、新建文件、新建目录。

推荐 UI：

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Kevin | Workspace: Media Ops | Island | Search | Notifications | Settings│
├───────────────┬─────────────────────────────────────┬───────────────────┤
│ Home          │ Agent Work Area                     │ Workspace Panel   │
│ - Overview    │ - Current conversation              │ [Dashboard]       │
│ - Artifacts   │ - Task planning                     │ [Artifacts]       │
│ - Materials   │ - Generated suggestions             │ [Materials]       │
│ - Async Jobs  │ - Inline task state                 │ [Async Jobs]      │
│ - Audit       │                                     │ [Audit]           │
│               │                                     │                   │
│               │                                     │ Materials view:   │
│               │                                     │ - files           │
│               │                                     │ - external docs   │
│               │                                     │ - connector data  │
└───────────────┴─────────────────────────────────────┴───────────────────┘
```

#### 面板状态

```text
Home Rail: expanded, but只保留一级入口
Chat Stream: expanded, 当前 Workspace 的默认主工作区
Workspace Panel: expanded, 默认显示 Dashboard 或 Materials
Artifact Canvas: hidden, 直到选中或生成制品
Artifact Panel: hidden
Action Panel: hidden
```

#### Chat Stream 在哪里？

Workspace 阶段，Chat Stream 是中栏主区。它承担三类职责：

- 发起任务：用户用自然语言、Slash 命令或引用 Materials 发起任务。
- 解释过程：Kevin 展示关键推理、调用的 Connector Capability、任务状态。
- 生成对象：当任务生成 Artifact 时，在消息流中出现 Artifact Card。

Artifact Card 不是最终阅读区，而是进入 Artifact Focus 的入口。

```text
Chat Stream
- User: 帮我基于本周数据生成运营复盘
- Kevin: 已读取 Data Warehouse / Feishu Docs
- Artifact Card: weekly-review-report
  [Open] [Preview] [Pin to Workspace]
```

#### 是否支持多次对话？

支持。Workspace 阶段有两层会话：

- `Session`：一次完整对话流，保留在 Workspace 的会话历史中。
- `Thread`：某个 Artifact 或某个任务下的局部对话，可从主 Session 派生。

默认策略：

- 新任务默认进入当前 Session。
- 用户可手动 `New Session`，用于开启新主题。
- 围绕某个 Artifact 的追问会自动绑定为 Artifact Thread。
- Artifact Thread 可以在 Artifact Focus 阶段从右侧或底部抽屉打开。

#### 历史对话如何呈现？

历史对话不应长期占据左栏大面积。建议：

- Home Rail 中保留 `Sessions` 入口。
- 最近 3 条可在 Home 悬浮展开。
- 全量历史进入 `Home > Sessions`。
- 与当前 Artifact 相关的 Thread 在 Artifact Panel 的 `Threads` 中呈现。

```text
Home > Sessions
- Current Session
- Recent
  - 运营复盘草稿
  - 小红书选题分析
  - Q2 PRD 修改
- Archived
```

### 5.2b Workspace 工作态（定稿 · 2026）

> 取代上方 §5.2 推荐 UI 中 **常驻三栏左轨** 的落地方案；与 `prd-reboot/05-ux-ia-alignment.md` §2.1.2 一致。原型按此迭代。

**结构**

- **极薄顶栏（与制品态一致）**：**Kevin · 工作区 · 当前空间名** 同一行（`CdMicroTabRow`）；右侧 **灵动岛、搜索、「工作区 ▾」** 占位。点击 **「工作区 ▾」** 打开抽屉：**概览** | **空间设置**。
- **主区两列**：**对话列**（Agent Chat）| **工作区**（总括名）。
- **对话顶条**：**多会话 Tab**（切换线程示意）+ **新会话 +**；**无「评论」Tab**。
- **「工作区」列（桌面 · 定稿 B）**：**左侧统一目录树 · 右侧预览**；窄屏时 **树上、预览下** 纵向叠放。
- **统一对象树（UX 规划）**
  - **资料库**：PM 项目材料的主干目录（可较深：`materials/`、`specs/`、`reviews/`、业务子目录等），支撑「整个项目材料接入」。
  - **Kevin 输出与材料同一认知**：物理上均为资料库内文件，**不按单独 `artifacts/` 等文件夹隔离**；可散落在 `specs/`、`reviews/` 等与工作流一致的目录。系统以 **索引**（及可选 frontmatter / 侧车）识别「Kevin 生成 / 签批状态」等，**优先不依赖**文件名标识。
  - **飞书等连接器**：不作为扁平标签页，而作为 **挂载子树**（例：`飞书/云文档/…`、`飞书/多维表格/…`），容纳多文档、多二维表；同步范围与表级挂载在 **空间设置** 中配置。
- **PM MVP**：对话列中的 **输出卡** 与树中对应文件 **同一对象**；打开 **Artifact Focus** 即打开该文件的结构化视图（路由名可保留 Artifact，用户向可称「输出 / 文档」）。

**ASCII（桌面）**

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Kevin · 工作区 · 增长与数据·Q2]     [灵动岛] [搜索] [工作区 ▾]                  │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ 对话列                             │ 工作区                                    │
│  Tab1 │ Tab2 │           [+]       │  ┌ 目录树 ──┬ 预览区 ─────────────────────┐ │
│  消息流 + 输出卡                   │  │ 资料库…  │ 路径 / 元数据 / 打开          │ │
│  Composer                         │  │ 飞书子树 │                               │ │
│                                   │  └──────────┴──────────────────────────────┘ │
└───────────────────────────────────┴──────────────────────────────────────────────┘
```

### 5.3 阶段三：选定制品后的 Artifact Focus

当用户选中一个文件、生成物或语义对象后，Kevin 进入制品聚焦态。

此时：

- Home Rail 不再占据独立列，收敛到顶部 `Workspace Switcher` 与 Chat 顶部的返回入口。
- 左栏变成常驻 `Contextual Chat`，默认绑定当前制品与选区上下文。
- 中栏展示制品主视图。
- 右栏聚焦 `Artifact Inspector / Actions`，用于结构、评论、版本、线程、动作与签批。
- Action / Sign-off 面板默认隐藏，只在执行动作或签批时出现。

推荐 UI：

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Kevin | Workspace ▼ | Artifact: daily-report | Island | Share | Settings             │
├──────────────────────┬────────────────────────────────────────┬──────────────────────┤
│ Contextual Chat      │ Artifact Canvas                        │ Inspector / Actions  │
│ ← Workspace          │ [Preview] [Structure] [Tweak] [Review] │ [Blocks] [Comments]  │
│ Current thread       │                                        │ [Versions] [Actions] │
│ Prompt input         │ Main artifact view                     │                      │
│ Agent trace          │ Selected block / selected section      │ Block properties     │
│ Pending diffs        │ Inline: Comment / Rewrite / Style      │ Related materials    │
│ Suggested asks       │                                        │ Related jobs / audit │
└──────────────────────┴────────────────────────────────────────┴──────────────────────┘
                                           │
                                           │ only when needed
                                           ▼
                                   ┌────────────────┐
                                   │ Action Panel   │
                                   │ - Preview      │
                                   │ - Connector    │
                                   │ - Capability   │
                                   │ - Risk         │
                                   │ - Sign-off     │
                                   └────────────────┘
```

#### 面板状态

```text
Home Rail: collapsed into Workspace Switcher + Back to Workspace
Contextual Chat: persistent, 常驻左栏并绑定当前制品上下文
Workspace Panel: collapsed into Workspace Switcher menu / Inspector tabs
Artifact Canvas: expanded, 当前主舞台
Artifact Inspector: persistent on right, 展示结构、评论、线程、动作和版本
Action Panel: hidden until action/sign-off
```

#### Chat Stream 在哪里？

Artifact 阶段，Chat 不应被收敛成很小的 Drawer。多数制品加工都需要用户看着制品、持续通过自然语言要求 Kevin 修改，因此这里采用左栏常驻 `Contextual Chat`：

- 常驻在左栏，和 Artifact Canvas 并列，类似 CD 的“意图输入区”。
- Chat 顶部保留 `← Workspace` 返回入口，替代原独立 Home Rail。
- 提问自动携带当前 Artifact、选中 block、版本和引用材料。
- Chat 输出若产生修改，必须进入 Artifact 的 Review/Diff，不直接覆盖原文。
- Chat 可展示最近一次 Diff 摘要、可接受/拒绝的修改建议，以及正在调用的 Connector Capability。

```text
Artifact Focus
├── Contextual Chat
│   - Current thread
│   - Prompt input
│   - Agent trace
│   - Pending diffs
├── Artifact Canvas
│   └── selected block / selected section
└── Inspector / Actions
    - Ask Kevin about selected block
    - Blocks / Comments / Versions
    - Connector action preview
    - Sign-off when needed
```

这样保留 CD 式“从左侧持续输入意图、在中间查看结果”的效率，同时通过中栏 Canvas 的最大视觉权重保证制品仍是主舞台。

#### Inspector 在哪里？

Artifact 阶段，`Inspector` 常驻右栏，承担结构化控制和风险动作，不与 Chat 争夺同一区域。推荐：

- 默认显示当前选中 block 的结构属性或 Summary。
- 用户点击评论、版本、动作时，右栏顶部 Tab 切到对应视图。
- 风险动作触发时，Action Panel 覆盖或顶替右栏 Inspector。
- Inspector 不承载开放式对话，避免和左栏 Chat 心智重叠。

```text
Right Panel
[Inspector] [Comments] [Versions] [Actions] [Audit]

Default: Inspector
On block selected: Inspector tab shows block properties
On comment selected: Comments tab shows thread
On risky action: Action Panel overrides all tabs
```

#### Home Rail 在哪里？

Artifact Focus 阶段不再保留独立 Home Rail，避免变成四栏。它收敛成三处入口：

- 顶栏 `Workspace ▼`：作为 Workspace Switcher 和全局导航菜单。
- 左栏 Chat 顶部 `← Workspace`：返回当前 Workspace 工作态。
- Command Palette / Global Search：快速进入 Materials、Async Jobs、Connectors、Audit、Settings。

```text
Top Bar
[Kevin] [Workspace: Media Ops ▼] [Artifact: Daily Report] [Island] [Share] [Settings]

Workspace Menu
- Overview
- Dashboard
- Artifacts
- Materials
- Async Jobs
- Connectors
- Audit
- Settings
```

也就是说：

```text
Workspace 阶段：Home Rail 常驻
Artifact Focus 阶段：Home Rail 收敛
```

#### 是否支持围绕同一制品多次对话？

支持，但以 Artifact Thread 呈现，而不是散落在全局会话中。

```text
Artifact Panel > Threads
- Thread A: 修改摘要口径
- Thread B: 解释转化率异常
- Thread C: 发布前检查
```

每个 Thread 都绑定：

- `artifact_id`
- 可选 `block_id`
- 起始版本与当前版本
- 相关 Materials
- 产生的 Diff 或 ActionRequest

#### 用户同时操作多个制品时如何呈现？

Kevin 2.0 应支持多制品，但不建议用传统浏览器式无限 Tab。推荐三种层级：

1. **Artifact Tabs**：当前正在编辑的少量制品，最多 5 个。
2. **Artifact Stack**：与当前任务相关的一组制品，例如“内容包 + 发布计划 + 复盘报告”。
3. **Compare / Split View**：只在需要对照时临时打开双栏比较。

推荐规则：

- 单击 Artifact：在当前 Tab 打开。
- Cmd/Alt + 打开：新建 Artifact Tab。
- 从同一任务生成的多个 Artifact 自动组成 Artifact Stack。
- 超过 5 个 Tab 时，旧 Tab 收敛到 `Open Artifacts` 列表。
- Compare View 只允许 2 个主对象并排，避免变成无界画布。

```text
Artifact Focus
┌──────────────────────────────────────────────────────────────┐
│ Tabs: [daily-report] [strategy-card] [position-card] [+]      │
├──────────────────────────────────────────────────────────────┤
│ Stack: Portfolio Review                                      │
│ - position-card                                              │
│ - risk-dashboard                                             │
│ - rebalance-strategy                                         │
└──────────────────────────────────────────────────────────────┘
```

#### Workspace Panel 收敛成什么？

在 Artifact Focus 阶段，Workspace Panel 不再作为独立右栏存在，而是拆成两类入口：

- 全局 Workspace 信息进入顶栏 `Workspace ▼` 菜单。
- 与当前制品相关的信息进入右栏 Inspector tabs。

右栏中只保留与当前制品相关的 Workspace 子集：

- `Materials`：当前制品引用的材料。
- `Related Artifacts`：相关制品。
- `Jobs`：正在影响当前制品的异步任务。
- `Audit`：当前制品相关的动作和签批记录。

这保证用户聚焦当前制品时，仍能回到上下文，但不会被整个 Workspace 的信息淹没。

### 5.4 阶段四：异步自治态

异步任务不是另一个页面，而是横跨 Workspace 的后台自治能力。

它在 UI 中表现为：

- Dashboard 中的监控卡片。
- Async Jobs 中的任务列表与规则。
- 灵动岛中的关键状态提醒。
- 通知中心中的事件。
- Artifact 中的自动产物回流。
- Sign-off 中的动作回流。

异步任务的关键规则：

- 不需要用户持续监督。
- 必须绑定 Space/Library。
- 必须有明确回流策略。
- 一旦涉及执行动作，必须进入 Sign-off。

### 5.5 新材料接入后的 Artifact 初始化（双模式）

当新 Space 创建或新 Connector 接入后，Workspace 会出现新的 Materials。Kevin 2.0 在这一点上采用双模式策略：

- 普通模式：无感、懒初始化，尽量不打断用户。
- 高阶模式：显式 Seeding，面向复杂场景做可控编排。

#### A. 普通模式（文件目录 + Connector）

目标：让用户像平时一样打开文件工作，不额外理解复杂流程。

触发机制：

- 不在 Space 创建时强制展示初始化向导。
- 用户首次打开文件时触发懒初始化（Lazy Init）。
- 以文件扩展名为第一路由，内容轻解析为第二校正。

```text
UNSEEN_FILE
-> OPENED
-> QUICK_CLASSIFIED(by extension)
-> LIGHT_INIT_DONE(artifact stub + context binding)
-> CONTEXTUAL_CHAT_READY
```

推荐映射（首版）：

- `.md` -> document / report-like artifact
- `.csv` / `.xlsx` -> table / analysis-like artifact
- `.json` -> config / structure-like artifact
- 其他类型 -> plain file mode（不阻断）

无感策略：

- 默认不弹复杂流程。
- 只给轻提示：“已为该文件启用结构化编辑（可关闭）”。
- 初始化失败时自动降级到纯文件模式。
- 幂等：同一文件只初始化一次，可重建。

普通模式下，Connector 的新材料接入也遵循“轻触达”：

- 在 Materials 列表中新增来源标签和更新时间。
- 在 Chat 中提供轻建议入口（例如“基于新数据更新当前报告”）。
- 不自动创建或覆盖 Artifact。

#### B. 高阶模式（文件目录 + Connector + AUI 渲染）

目标：在复杂场景中让用户对对象化工作流有完整控制。

触发机制：

- 用户手动开启高阶模式。
- 或系统检测到复杂度阈值达到后给出“建议开启”。

复杂度信号示例：

- 多 Connector 且含写入/执行能力。
- 同时维护多个 Artifact。
- 存在持续 AsyncJob 监控。
- 需要多对象联动（例如策略 + 报告 +发布）。

高阶模式流程：

```text
New Space / New Connector
-> Material Ingestion
-> Material Index
-> Workspace Seeding
-> Suggested Artifacts
-> User Confirm
-> Artifact Initialization
```

这里保持强约束：

- Connector 只带来新材料与能力，不直接创建 Artifact。
- Kevin 提供建议，不自动替用户做结构化对象决策。
- 用户确认后才初始化或更新 Artifact。

#### C. Material Ingestion / Seeding 对象

为了统一普通模式和高阶模式，建议增加 `SeedingPlan`：

```text
SeedingPlan
- workspace_id
- trigger (new_space | new_connector | manual_refresh)
- material_summary
- suggested_artifacts
- required_connectors
- confidence
- user_selection
- created_artifacts
- fallback_mode
```

普通模式可把 `SeedingPlan` 隐式执行（只做轻初始化）；高阶模式显式展示并要求确认。

#### D. 核心边界

```text
Connector brings materials
-> Kevin proposes
-> User confirms (high-level mode) / implicit light init (normal mode)
-> Artifact initializes or updates
```

必须避免：Connector 一接入就自动创建、自动发布或自动覆盖已有 Artifact。

## 6. 参考 Claude Design 后的 IA 调整

Claude Design 对 Kevin 2.0 最有价值的启发是：界面不是围绕聊天组织，而是围绕 Workspace 中的对象与生成物组织。

Kevin 2.0 可借鉴以下模式：

- Project/Workspace 作为工作容器。
- Files/Assets/References 作为材料集合。
- Canvas 作为当前对象的主要操作区。
- Layers/Structure 作为生成物的可控入口。
- Tweaks 作为局部微调入口。
- Comments 作为人机协作入口。
- Timeline/Review 作为变更审查入口。

但 Kevin 需要做的关键改造是：

- Project 不只是文件项目，而是 SemanticWorkspace。
- Files 不只是本地文件，而是 Materials。
- Connectors 不是简单数据源列表，而是外部系统及其 Read/Watch/Write/Execute 能力授权。
- Canvas 不只渲染 UI，而是渲染任意 SemanticArtifact。
- Tweaks 不只改视觉样式，也可以改参数、阈值、结构、语气、发布策略。
- Repo Sync 不只推代码，也可以通过 Connector Capability 发布文档、写飞书、调整仓位、分发内容，但必须经过执行策略与签批。

## 7. 高阶场景推演

### 7.1 股票投资场景

#### Workspace

股票投资工作空间不应是一个文件夹，而应是一个投资工作图谱。

可能包含：

- 市场指标 Dashboard。
- 持仓股票列表。
- 组合风险暴露。
- 新闻与公告事件流。
- 价格、成交量、波动率、资金流等市场数据 Connector。
- 券商或持仓 Connector。
- 策略规则与风控阈值。
- 日终盘点与调仓记录。

#### Artifacts

典型语义制品：

- 个股持仓卡：展示成本、收益、风险、关键事件、Kevin 分析。
- 日终盘点报告：总结市场、持仓变化、风险提示、明日计划。
- 组合配置策略：展示目标仓位、调仓理由、风险影响、回测结果。
- 异常波动告警卡：说明触发原因、相关材料、建议动作。

#### Async Jobs

典型异步任务：

- 盘中波动监控。
- 持仓风险扫描。
- 重大新闻/公告监听。
- 日终复盘自动生成。

#### Connectors / Capabilities

典型连接器与能力：

- Market Data Connector：读取行情、监听波动、读取资金流。
- News Connector：读取公告、监听重大新闻。
- Broker Connector：读取持仓、读取成交、提交调仓或下单请求。

其中 Market Data 多数是纯感知型，Broker 则通常是 Sense + Act 一体型。

#### Action Requests

典型执行动作：

- 生成日终报告：low risk。
- 发送告警：low/medium risk。
- 生成调仓建议：medium risk。
- 实际调整仓位或下单：high risk，必须 Sign-off，建议双重确认。

#### 闭环

```text
市场数据 Connector + 持仓 Connector
-> AsyncJob 监控波动和事件
-> Dashboard 更新状态
-> 生成异常告警或日终报告
-> 用户打开组合配置策略 Artifact
-> Kevin 给出调仓建议与影响分析
-> Action Panel 显示 Broker Connector 的下单/调仓预览
-> Sign-off
-> 执行或取消
-> 审计与复盘写入 Workspace
```

### 7.2 自媒体运营场景

#### Workspace

自媒体运营工作空间也不应是一个内容目录，而是账号与内容生产工作图谱。

可能包含：

- 账号矩阵指标 Dashboard。
- TOP 内容列表。
- 热点雷达。
- 粉丝反馈扫描。
- 内容素材库。
- 选题池与灵感池。
- 发布计划与复盘记录。

#### Artifacts

典型语义制品：

- 多模态内容包：文案、脚本、封面、标题、标签、素材引用。
- 粉丝画像分析：人群、兴趣、反馈主题、情绪变化。
- 创作灵感卡：来源、洞察、可转化角度、适合平台。
- 发布复盘报告：流量、互动、转化、评论摘要、下一步建议。

#### Async Jobs

典型异步任务：

- 平台热点持续扫描。
- 竞品账号监控。
- 发布后数据巡检。
- 爆款/负反馈告警。

#### Connectors / Capabilities

典型连接器与能力：

- Xiaohongshu Connector：读取热点、读取评论、读取账号数据、发布笔记。
- Content Platform Connector：读取多平台数据、发布内容、修改内容。
- Media Library Connector：读取素材、写入内容包、导出发布素材。

小红书、公众号、视频平台这类 Connector 往往同时具备 Sense 与 Act 能力，因此必须按 Capability 做授权和签批。

#### Action Requests

典型执行动作：

- 生成内容草稿：low risk。
- 生成封面与多模态素材包：low/medium risk。
- 发布到平台：medium/high risk，取决于账号权限和平台影响。
- 修改已发布内容或删除内容：high risk。

#### 闭环

```text
热点 Connector + 账号数据 Connector + 用户素材
-> Dashboard 更新热点与账号表现
-> Kevin 生成选题与内容包
-> 用户在 Artifact Canvas 中微调标题、脚本、封面、标签
-> Action Panel 显示平台发布预览
-> Sign-off
-> 发布到平台
-> AsyncJob 监控播放、互动、评论、转化
-> 生成复盘报告和下一轮创作建议
```

## 8. 通用 UX 规则

### 8.1 Workspace 规则

- Workspace 是语义工作空间，不是文件夹。
- Library 仍然必须绑定本地目录，但它是 Storage Layer 的入口。
- Home 负责承载 workspace 设置、连接器、能力授权、策略和健康状态。
- Dashboard 是工作空间的默认视图之一，适合高阶场景。

### 8.2 Connector 规则

- Connector 是用户可见的一级接入对象，Sensor/Actuator 是底层能力映射。
- 一个 Connector 可以只有 sense 能力，也可以同时拥有 sense 和 act 能力。
- 用户在初始化或 Home 中管理 Connector，而不是把底层 Sensor 与 Actuator 分成两个用户侧入口。
- Connector 详情页展示连接状态、Capabilities、风险标签、签批要求和最近活动。
- 每个 Capability 必须明确是 Read、Watch、Write 还是 Execute。
- 每个 Write / Execute Capability 必须绑定风险等级与审计策略。

### 8.3 Material 规则

- Files 是 Materials 的一个子集。
- Materials 可以来自本地目录、外部文档、API、数据库、媒体素材和 Connector。
- 用户可以从 Materials 中选择材料作为上下文。
- Kevin 生成的制品可以引用多个 Material，并保留引用关系。

### 8.4 Artifact 规则

- Artifact 是语义对象，不等于文件。
- Artifact 必须有 type、schema_ref、state、actions。
- Artifact 的 schema_ref 必须指向 Kevin Registry；Skill 不应私有定义同名 schema。
- Skill 可以声明输出类型、填充内容，并在受控流程中注册扩展 Artifact Type。
- Connector 只提供材料和动作能力，不直接定义 Artifact schema。
- Artifact 可导出为文件，也可发布到外部系统。
- Artifact 内部需要有 block 级结构，支撑选区、评论、微调和审查。

### 8.5 AsyncJob 规则

- AsyncJob 是自治任务，不是简单后台慢任务。
- AsyncJob 可以绑定 Connector + Capability，例如小红书热点扫描或持仓风险监控。
- AsyncJob 必须有回流策略。
- AsyncJob 的回流可以是产物、事件或动作。
- AsyncJob 触发执行动作时必须经过风险策略。

### 8.6 Action 规则

- Action Panel 默认隐藏。
- Action Panel 只在对象动作、异步回流或签批时出现。
- Action Panel 必须展示 Connector、Capability、目标账号/对象、风险等级和执行前预览。
- medium/high risk 必须进入 Sign-off。
- 所有执行动作必须写审计。

## 9. MVP 建议

### Phase 1：语义 Workspace 骨架

- 初始化流程支持项目名、工作类型、本地目录、连接器、能力授权、策略。
- 进入 Workspace 后支持 Home、Dashboard、Artifacts、Materials、Async Jobs、Audit。
- Materials 中先支持本地文件树和手动添加外部材料。
- Connector 详情支持连接状态、能力列表、风险标签和签批要求。
- 普通模式支持“打开文件即懒初始化”（扩展名路由 + 内容轻解析 + 失败降级）。

### Phase 2：语义 Artifact 骨架

- 支持 Artifact type、state、actions。
- 支持 Kevin Registry 初版，至少包含通用 report、document、dashboard、content_package 等基础类型。
- 支持 Skill 声明输出 Artifact Type，并按 Registry schema 填充内容。
- 支持 Artifact Canvas 的 Preview / Structure / Review。
- 支持 block 级选区、评论和 Diff。
- 支持导出到 Library 挂载路径。
- 支持 SeedingPlan 最小实现（new_space/new_connector/manual_refresh 三类触发）。

### Phase 3：AsyncJob 与 Action 闭环

- 支持自治任务配置、运行和回流。
- 支持产物回流、事件回流、动作回流。
- 支持 Action Panel 默认隐藏和风险触发显现。
- 支持 Sign-off 与审计闭环。

### Phase 4：高阶场景模板

- 产品设计模板。
- 数据分析模板。
- 股票投资模板。
- 自媒体运营模板。
- 通用工作模板。

## 10. 下一轮需要细化的问题

1. `work_type` 是否应作为强模板，还是只作为初始化建议？
2. Dashboard 是否应成为所有 Workspace 的默认首页，还是仅在高阶场景启用？
3. Artifact 的 `schema` 由 Kevin Registry 统一管理；Skill 负责声明输出类型、填充内容，并可在受控流程中注册扩展类型；Connector 不直接定义 schema。
4. Materials 是否需要跨 Workspace 复用，还是严格绑定当前 Library？
5. high risk Capability 是否需要 v2.0 就支持双重确认，还是只定义设计预留？
6. AsyncJob 的事件回流是否允许打断当前工作，还是统一进入灵动岛和通知中心？
7. 普通模式懒初始化的扩展名映射规则与轻解析阈值如何设定，避免误判？
8. 高阶模式开启条件是手动优先还是系统推荐优先，推荐策略如何解释给用户？

## 11. 当前结论

Kevin 2.0 的 IA 重点不是把 1.5 的三栏界面做得更漂亮，而是完成一次产品对象升级：

```text
目录 -> Materials
文件 -> SemanticArtifact
工作区 -> SemanticWorkspace
后台任务 -> AsyncJob with 回流策略
系统接入 -> Connector with Capabilities
工具按钮 -> ActionRequest with 风险策略
```

这套模型能同时承载产品设计、数据分析、股票投资、自媒体运营等高阶场景，也能保持 Kevin 1.5 的安全、隔离、签批、审计和本地边缘节点原则。