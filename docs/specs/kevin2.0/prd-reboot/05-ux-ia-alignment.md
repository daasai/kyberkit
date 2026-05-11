# UX/IA 基线对齐说明

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> UX/IA 基线：`../kevin2-ia-ux-v2.md`

## 1. 设计立场

本 PRD 不重新设计 UX/IA。Kevin 2.0 的 UX/IA 以 `../kevin2-ia-ux-v2.md` 为基线。

本子文档只回答一个问题：

```text
在现有 UX/IA 基线下，PRD 新增的产品原则如何落位？
```

## 2. 现有 UX/IA 可直接沿用的部分

### 2.1 阶段化 IA

沿用 Setup / Workspace / Artifact Focus / Action 阶段模型。

PRD 新增要求：

- Setup 阶段必须让用户理解 Connector/Capability/Policy 的边界。
- Workspace 阶段必须默认呈现工作状态，而不是空 Chat。
- Artifact Focus 阶段必须承载 Native Artifact 的审查与证据链。
- Action 阶段必须承载 External Projection 和其他外部写入动作。

### 2.1.1 Setup：创建工作区（与 `prototypes/kevin2-hifi-v2` 对齐）

- **四步**：① 基础与工作包 → ② 连接器 → ③ 功能 → ④ 审阅并创建；全程 **无聊天流**。
- **用户可见用语**：工作包（Work type pack）、资料库、**功能**（Capability）、连接器、签批、策略；专有名词保留 **Skill**、**MCP**。
- **① 基础与工作包**：工作区名称与 **资料库** 为 **全局区**（与各工作包 Tab 无关）；**工作包** 以 Tab 切换；Tab 内为制品模板包、默认输出相关字段、以及 **写入类签批默认**（仅约束 **外部连接器上写入类功能** 的默认倾向）。Kevin 以 **提示条** 辅助，不进入对话。
- **② 连接器**：**三栏**——已选列表、中间引导、**右侧连接/配置**（含测试、断开、失败重试）。**连接器目录**为独立层（左：连接器 / MCP / Skill，右：搜索与卡片栅格）。提供主按钮 **稍后配置** 以跳过外部连接器配置；预览区须提示缺口，后续可在 **首页 > 连接器** 补全。
- **③ 功能**：按连接器分组的 **功能** 矩阵；展示风险与签批；签批相对工作包默认为 **继承** 或用户修改后的 **已覆盖**（**以本步为有效配置**）。
- **MCP / Skill**：作为预置通用接入形态出现在目录与已选列表；配置区对齐协议习惯，**不在 UI 暴露密钥**。

### 2.1.2 Workspace 工作态（5.2 定稿，与 `prototypes/kevin2-hifi-v2` 下一版对齐）

- **总括右栏命名**：**「工作区」**——主区右侧整块 **对象浏览**：以 **统一目录树** 呈现——**资料库**为 PM 日常项目材料的主干（可较大深度：`materials/`、`specs/`、`reviews/` 等业务目录）。**Kevin 生成内容**（原语义上的 Artifact，如 PRD、周报、`.pptx` 等）在物理上与用户日常文档 **不做分栏**：**不强制**使用单独 `artifacts/` 文件夹，而是 **散落在用户习惯的目录结构中**；与材料 **同一棵树、同一预览与 @ 引用模型**。系统通过 **Workspace 索引**（及可选 **frontmatter / 侧车元数据**）识别对象角色与签批状态，**优先不依赖**文件名约定（如 `…-Kevin.md`）。**连接器**（如飞书）为 **挂载子树**：其下按 **云文档、多维表格** 等类型分层展开；同步粒度与缓存策略在 **空间设置** 中配置。
- **主区两列（桌面）**：**对话列**（Agent Chat；顶条 **多会话 Tab + 新会话**；**无「评论」Tab**）| **工作区**（见下）。
- **「工作区」列内布局（定稿）**：**方案 B**——**左侧目录树、右侧预览**；**窄屏** 纵向叠放（树上、预览下）。
- **顶栏（Workspace）**：与 **Artifact Focus** 一致采用 **极薄单行（CdMicroTabRow）**：**Kevin 字标 · 工作区 · 当前空间名** 同排；右侧 **灵动岛 / 搜索 /「工作区 ▾」** 等占位。**不再**使用大规格 `KevinFloatingChrome` 作为 Workspace 主顶栏。
- **不再常驻左栏 Home Rail**：原 **概览 / 制品 / 材料 / 异步 / 审计 / 会话** 等，收敛为 **顶栏** 的 **「工作区 ▾」** 打开 **抽屉/侧板**：**[ 概览 ] [ 空间设置 ]**。  
  - **概览**：**当前空间状态**只读摘要——资料库、连接器状态、索引进度、待签批、异步摘要（若有）、工作包/空间名等。  
  - **空间设置**：资料库路径、连接器、功能/签批策略等（Setup 之后的回家配置路径）。
- **PM 工作包（MVP）**：以 **资料库目录树 + 连接器挂载子树** 构成集成材料环境；Kevin 输出以 **树内普通文件行** 呈现，可用轻徽标（如「Kevin 生成」）提示索引角色，**不单独开辟「制品区」认知**。
- **输出卡（对话列）**：仍出现在 **对话列** 消息流；**打开结构化视图** → Artifact Focus（5.3）；与树中对应 **物理文件** **同一对象**（路径即用户可见真相之一，索引为系统真相）。
- **顶栏**：极薄条 · **Kevin · 工作区 · 空间名**；占位 **灵动岛、搜索、「工作区 ▾」**。
- **用语**：用户向中文为主；工具名、类型等可保留英文技术名。

### 2.2 Artifact Focus

沿用 `kevin2-ia-ux-v2.md` 中的 Contextual Chat + Artifact Canvas + Inspector 结构。

PRD 新增要求：

- Inspector 增加 Materials tab 的证据链最小呈现。
- Artifact 主视图支持 Evidence Badge。
- Actions tab 支持 External Projection 入口。

### 2.3 Action Panel

沿用 Action Panel 默认隐藏、只在动作或签批时显现的策略。

PRD 新增要求：

- External Projection 必须走 ActionRequest。
- Action Panel 必须展示 Source / Target / Preview / Governance。
- 写入成功后必须产生 Audit 与 external link。

### 2.4 Connector/Capability

沿用“Connector 是用户可见接入对象，Capability 是具体能力”的设计。

PRD 新增要求：

- External Projection 的目标平台必须以 Connector/Capability 表达。
- 写入能力必须展示风险等级。
- Connector 失败时需要明确可恢复路径。

## 3. 五项优势的前端落位

### 3.1 真实上下文连接

落位：

- Setup 中的 Connectors
- Workspace 中的 Materials
- Artifact Inspector 中的 Materials Used

用户应能看到：

- Kevin 接入了什么
- 当前 Workspace 启用了什么能力
- 当前 Artifact 使用了哪些材料

### 3.2 工作对象化

落位：

- Workspace 概览（Home 卡片集；可与主工作区抽屉/同屏呈现）
- Artifact List
- Artifact Focus

用户应能看到：

- Artifact 不是聊天消息
- Artifact 有类型、状态、材料、动作
- Artifact 可以投影到外部平台

### 3.3 可控执行

落位：

- Action Panel
- Sign-off 卡片
- Inspector > Actions

用户应能看到：

- Kevin 想执行什么动作
- 动作作用于哪个对象
- 风险等级是什么
- 是否需要确认

### 3.4 可追责链路

落位：

- Audit
- Action Panel 执行结果
- Artifact 的 external links
- Chat Sources

用户应能看到：

- 谁触发了动作
- 基于什么材料
- 写到了哪里
- 最终是否成功

### 3.5 能力复利

落位：

- Contextual Chat
- Workspace 建议任务
- My Kevin / 认知资本管理视图
- Skill Forge 反馈卡片

用户应能看到：

- Kevin 识别出重复工作模式
- Kevin 建议沉淀 Skill
- 用户可查看、接受或拒绝沉淀
- 用户可查看、禁用、删除 Kevin 已经记住的偏好和方法

## 4. 现有 UX/IA 需要补充但不重做的点

### 4.1 Workspace Home MVP 内容

**Workspace Home** 指 **概览卡片集与态势信息**（Recent / Pending / Materials / Suggested / Connectors），是用户建立「Kevin 是工作空间，不是聊天工具」第一印象的**工作态概览层**。

**呈现与路由（与 `prototypes/kevin2-hifi-v2` 对齐）**：上述内容**不必**占用独立全屏路由；可收敛为 **Workspace 内的「概览」**（如 `工作区 ▾` 抽屉首 Tab，或等价侧板）。**默认落点**可直接进入 **Workspace 主工作区**（浏览 + 对话），概览按需打开。规格仍以本节卡片与逻辑为准，仅 IA 承载位置可调。

**与第一次见面的关系：**

默认新建 Workspace 路径以 `11-first-encounter-spec.md` 为准：用户先指认工作目录，Kevin 进入扫描工作台，在 5-10 秒内生成 `directory_cognition` 和首批建议。扫描完成后才进入 Workspace Home。

下方 Workspace Home 卡片集适用于第一次见面之后的常规进入；空状态 3 步仅作为用户跳过目录指认、或目录为空/无法读取时的备选路径。

**MVP 卡片集（优先级排序）：**

| 卡片 | 内容 | 关键作用 |
|---|---|---|
| **Recent Artifacts** | 最近 5 个制品；显示 type / title / state / last updated | 用户进来第一眼看到工作对象，不是空聊天框 |
| **Pending Actions** | 待确认的 ActionRequest（state = `awaiting_signoff`） | 建立"Kevin 不自动执行，需要你审批"的治理信任 |
| **Materials** | 材料总数 + stale 材料提示 + 上次添加时间 | 体现 Kevin 正在接触真实上下文 |
| **Suggested Next Step** | Kevin 基于上下文记忆主动推断一条最值得做的事（见 §4.1.1 生成逻辑） | 这是"Kevin 记得你"的核心感知时刻，不能是空洞的状态描述 |
| **Connectors Status** | 已连接 Connector 的状态指示器（connected / degraded / reauth_required） | 让用户清楚当前能力边界 |

**不出现在 Home 的内容：**

- 聊天输入框不是 Home 的主 CTA（聊天入口在 Workspace 侧栏，Home 是工作状态面板）
- Audit 完整日志（有独立页面）
- Skill / 认知资本管理（进 My Kevin 或 Workspace 管理）

**备选空状态（用户跳过目录指认 / 目录为空 / 无法读取）：**

```
帮 Kevin 了解你的工作

→ 给工作空间取个名字
→ 把最常用的几个文件拖进来    （建立初始上下文）
→ 告诉 Kevin 你现在最需要完成什么
```

框架是"帮 Kevin 了解你的工作"，而不是"配置 Workspace"——用户行为相同，但心智模型不同。3 步后 Kevin 有了初始上下文，可以立刻开始工作。默认情况下，这个备选空状态不应覆盖第一次见面的"指一个文件夹，开始工作"体验。

#### §4.1.1 Suggested Next Step 生成逻辑（规格）

这张卡片是 Kevin"上下文与记忆"能力的核心展示窗口，**不能是通用的状态描述**。

**生成优先级（按顺序评估，取最高优先级项）：**

| 优先级 | 触发条件 | 展示内容示例 |
|---|---|---|
| P0 | 有 Artifact 存在未完成的必填 block（evidence 缺失） | "Q2 PRD 的 Problem block 还缺材料引用。你上周上传的访谈笔记里有 2 段相关内容。[继续]" |
| P0 | 有 pending ActionRequest（state = `awaiting_signoff`） | "周报已生成，待你批准投影到飞书。[查看]" |
| P1 | 有新增 Material，且与已有 Artifact 的某个 block 有潜在关联 | "你新上传的 Q2 用研报告，可能支撑增长 PRD 的 Users block。[查看关联]" |
| P1 | 有 Artifact 的某个 block 被标记 `needs-review` 超过 24 小时未处理 | "增长 PRD 的 Risks block 已等待 Review 2 天。[继续 Review]" |
| P2 | 上次 diff 中有被拒绝的建议类型重复出现 | "Kevin 再次建议修改 Acceptance Criteria 的表述风格。你上次拒绝了类似建议，这次要继续跳过吗？[查看] [跳过]" |
| P2 | Data Warehouse Material 超过 7 天未刷新 | "周报使用的数据已有 8 天未更新。[刷新查询]" |
| P3 | 无以上情况 | "你上次在 [Artifact 名] 上工作，还有 [N] 个 block 可以继续完善。[继续]" |

**展示规则：**

- 只展示一条，不展示列表。
- 每次进入 Home 重新评估，不缓存旧建议。
- 用户点击"忽略"后降级到下一优先级建议，不再展示被忽略项（本次会话内）。
- 措辞必须具体到 Artifact 名称和 block 名称，不允许泛化表述（如"继续完成你的工作"）。

### 4.2 External Projection

需要在现有 Artifact Focus / Action Panel 上补充：

- Project to External Document 入口（首个平台：飞书）
- Projection Preview（标题 + 大纲 + 格式降级提示）
- External Links 展示（写入成功后在 Inspector 显示飞书文档链接）

### 4.3 Evidence Chain

需要在现有 Inspector / Chat 上补充：

- Inspector > Materials（列出当前 Artifact 使用过的所有 Material）
- Evidence Badge（关键 block 轻量标记）
- Chat Sources（回答底部折叠展示材料来源）

### 4.4 Intelligence Metrics

需要在产品埋点和内部评估中补充（对应 doc 06 §7.0 评测任务集）：

- T7 端到端完成率（Task Success Rate）
- 必填 block 缺失率（Structured Artifact Validity）
- EvidenceRef 准确率抽样（Material Grounding Accuracy）
- diff accept/reject 事件（Suggestion Acceptance Rate）
- ActionRequest risk level 确认行为（Action Decision Precision）
- Artifact 全量重写次数（Rework Rate）

### 4.5 My Kevin / 认知资本管理视图

My Kevin 是用户查看和管理 Kevin 记忆的统一入口。它不进入 Workspace Home 主卡片区，避免抢占工作状态面板；但必须在 Settings 或 Workspace 管理中有稳定入口。

MVP 最小视图：

| 区块 | 内容 | MVP 操作 |
|---|---|---|
| 项目情境 | 当前 Workspace 的 `directory_cognition` 摘要 | 打开 `.kevin/cognition.md` / 重新认识项目 |
| 行为偏好 | C3 偏好记录列表 | 查看 / 禁用 / 删除 |
| 判断框架 | C4 已确认 Skill 与草案 | 预览 / 编辑 / 删除 |
| 决策日志 | C5 关键 ActionRequest 与显式纠正 | 查看 / 搜索（可后置） |
| 外部指针 | C6 外部文档、查询、系统引用 | 查看 / 删除 |

设计要求：

- 每条记忆必须显示来源、作用域、最近使用时间。
- 每条会影响输出的记忆必须支持“本次不用”或“禁用”。
- 删除记忆时要说明影响，而不是只做危险确认。
- My Kevin 不应该成为复杂知识库产品；它的目标是让用户信任 Kevin 记住了什么。

## 5. 设计约束

1. 不新增一套与 `kevin2-ia-ux-v2.md` 冲突的导航结构。
2. 不把 External Projection 做成独立主页面。
3. 不把材料证据链做成高干扰 citation 系统。
4. 不把 Chat 重新推回产品主角位置。
5. 不把 ActionRequest 隐藏成普通按钮。
6. 不把 My Kevin 做成新的主导航中心；它是记忆治理入口，不是日常工作入口。

## 6. 验收标准

- PRD 新增能力可以映射到现有 IA 的明确位置。
- Workspace **概览层**（原 Workspace Home 卡片集）展示 Recent Artifacts / Pending Actions / Materials / Suggested Next Step / Connectors Status 五类卡片；可与主工作区同屏以抽屉/Tab 呈现，不强制独立路由。
- 全新 Workspace 默认进入第一次见面扫描工作台；仅在用户跳过目录指认或目录不可读时展示备选空状态引导。
- External Projection 可以在 Artifact Focus / Action Panel 内完成（飞书）。
- Evidence Chain 可以在 Inspector / Chat 内完成。
- My Kevin 有稳定入口，可查看/禁用/删除至少 C2/C3/C4 三类认知资本。
- 用户不需要学习新的主导航模型。
- 现有 UX/IA 文档仍是界面设计单一基线。
