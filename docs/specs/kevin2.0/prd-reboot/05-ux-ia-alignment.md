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

- Workspace Home
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
- Skill Forge 反馈卡片（后续细化）

用户应能看到：

- Kevin 识别出重复工作模式
- Kevin 建议沉淀 Skill
- 用户可查看、接受或拒绝沉淀

## 4. 现有 UX/IA 需要补充但不重做的点

### 4.1 Workspace Home MVP 内容

Workspace Home 是用户进入 Kevin 的第一个落点。它必须建立"Kevin 是工作空间，不是聊天工具"的第一印象。

**MVP 卡片集（优先级排序）：**

| 卡片 | 内容 | 关键作用 |
|---|---|---|
| **Recent Artifacts** | 最近 5 个制品；显示 type / title / state / last updated | 用户进来第一眼看到工作对象，不是空聊天框 |
| **Pending Actions** | 待确认的 ActionRequest（state = `awaiting_signoff`） | 建立"Kevin 不自动执行，需要你审批"的治理信任 |
| **Materials** | 材料总数 + stale 材料提示 + 上次添加时间 | 体现 Kevin 正在接触真实上下文 |
| **Suggested Next Step** | 基于 Workspace 当前状态给出一条引导（如"继续完成 PRD"、"你有 2 个待审查 diff"） | 主动引导，避免用户进来不知道干什么 |
| **Connectors Status** | 已连接 Connector 的状态指示器（connected / degraded / reauth_required） | 让用户清楚当前能力边界 |

**不出现在 Home 的内容：**

- 聊天输入框不是 Home 的主 CTA（聊天入口在 Workspace 侧栏，Home 是工作状态面板）
- Audit 完整日志（有独立页面）
- Skill 管理（进 Settings 或 Workspace Setup）

**空状态（全新 Workspace）：**

```
Welcome to [Workspace Name]

→ Add Materials        （第一步）
→ Create your first Artifact   （第二步）
→ Connect a system     （可选，但推荐）
```

这三个 CTA 的顺序即用户应建立的工作心智顺序。

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

## 5. 设计约束

1. 不新增一套与 `kevin2-ia-ux-v2.md` 冲突的导航结构。
2. 不把 External Projection 做成独立主页面。
3. 不把材料证据链做成高干扰 citation 系统。
4. 不把 Chat 重新推回产品主角位置。
5. 不把 ActionRequest 隐藏成普通按钮。

## 6. 验收标准

- PRD 新增能力可以映射到现有 IA 的明确位置。
- Workspace Home 展示 Recent Artifacts / Pending Actions / Materials / Suggested Next Step / Connectors Status 五类卡片。
- 全新 Workspace 进入时展示空状态引导（Materials → Artifact → Connect），不展示空聊天框。
- External Projection 可以在 Artifact Focus / Action Panel 内完成（飞书）。
- Evidence Chain 可以在 Inspector / Chat 内完成。
- 用户不需要学习新的主导航模型。
- 现有 UX/IA 文档仍是界面设计单一基线。
