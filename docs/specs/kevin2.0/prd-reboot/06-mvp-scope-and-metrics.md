# MVP 范围、成功指标与验收

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`

## 1. MVP 定位

Kevin 2.0 MVP 不是完整平台版本，而是用于验证新产品心智的版本：

```text
Semantic Workspace + Native Artifact + Governed Action Validation Release
```

它要验证：

1. 用户是否理解 Kevin 是语义工作空间，而不是聊天工具。
2. Artifact 作为源对象是否成立。
3. External Projection 是否能与外部文档平台形成清晰分工。
4. ActionRequest + Sign-off + Audit 是否能建立企业信任。
5. 智能能力是否足以支撑端到端任务。

## 2. MVP In Scope

### 2.1 Semantic Workspace

- Workspace Home 体现工作状态。
- Workspace 绑定 Space / Library。
- 进入 Materials、Artifacts、Actions、Audit。

### 2.2 Native Artifact

- 支持 PRD 和 Weekly Ops Review 两个 Artifact Type。
- Artifact 独立于 Session 持久化。
- Artifact 支持 block 结构。
- Artifact 支持 Review/Diff。

### 2.3 Materials

- 支持本地 Markdown、CSV、JSON。
- 支持 Data Warehouse Connector 查询结果材料化。
- MVP 不使用 mock Connector Data 作为主路径。
- 支持 Materials Used 展示。
- 支持解析失败降级。
- 支持最小 Metric Dictionary / 指标口径层。

### 2.4 Evidence Chain

- Inspector > Materials
- Evidence Badge
- Chat Sources

### 2.5 ActionRequest

- 支持低风险导出。
- 支持 medium 外部写入确认。
- 支持 mock write-back。
- 支持 Sign-off 与 Audit。

### 2.6 External Projection

- 支持文档级单向投影。
- 默认新建外部文档。
- 写入后保留 external link。
- 写入动作写入 Audit。

## 3. MVP Out of Scope

- 通用富文本编辑器
- 多人实时协作编辑
- block 级外部同步
- 外部评论/修改自动回流
- 全量 SaaS Connector 生态
- 高风险全自治执行
- 自动 merge
- 复杂 BI / 图表平台能力

## 4. 样板场景

### 4.1 Product Design Workspace

目标：验证 PRD Artifact、材料引用、Review/Diff、External Projection。

路径：

```text
Materials
-> Generate PRD Artifact
-> Review/Diff
-> Evidence Badge
-> External Projection
-> Audit
```

成功标准：

- 用户能生成 PRD Artifact。
- 用户能理解 PRD 引用了哪些材料。
- 用户能完成一次 block 修改与审查。
- 用户能投影成外部协作文档。

### 4.2 Data Analysis Workspace

目标：验证真实 Data Warehouse Connector、数据材料化、Weekly Ops Review、Action Plan、ActionRequest。

路径：

```text
Data Warehouse MCP
-> Query Result Material
-> Generate Weekly Ops Review
-> Ask about metric
-> Generate Action Plan
-> ActionRequest
-> Sign-off
-> Audit
```

成功标准：

- 用户能基于数仓查询结果生成周报。
- 用户能看到指标口径说明。
- 查询结果能作为 Material 被 Artifact 引用。
- 用户能看到关键结论的材料来源。
- 用户能触发一个可签批 ActionRequest。
- 用户能在 Audit 中回看动作记录。

## 5. 产品认知指标

MVP 内测中应验证：

- 用户能说清 Kevin 与 ChatGPT/Claude 的差异。
- 用户能说清 Kevin 与飞书/Notion 的分工。
- 用户能区分 Material、Artifact、Action。
- 用户认为 Kevin 的输出不是一次性聊天结果，而是可持续管理的工作对象。

## 6. 行为指标

建议目标：

- 5 分钟内创建 Workspace 并生成首个 Artifact。
- 5 分钟内完成一次基于材料的 Artifact 修改。
- 完成至少一次 Review/Diff。
- 完成至少一次 External Projection。
- 完成至少一次 ActionRequest Sign-off。

## 7. 智能程度指标

### 7.0 评测任务集（MVP 内测用）

内测阶段使用以下 7 个任务作为结构化评测集，覆盖两个主场景。

| # | 场景 | 任务描述 | 主要评估指标 |
|---|---|---|---|
| T1 | Product Design | 基于访谈笔记（Markdown）+ feature brief（Markdown）生成 PRD；`problem` 和 `users` 必须有材料引用 | Grounding Accuracy, Structured Validity |
| T2 | Product Design | 对已生成 PRD 的 `risks` block 触发 Review/Diff，要求至少 3 条有效建议 | Suggestion Acceptance Rate |
| T3 | Product Design | 将 PRD 投影到飞书；验证 Action Panel 展示正确预览、risk level = medium、授权流程正常 | Action Decision Precision |
| T4 | Data Analysis | 基于数仓参数化查询结果生成 Weekly Ops Review；所有 `metric_snapshot` 指标必须有 EvidenceRef | Grounding Accuracy, Structured Validity |
| T5 | Data Analysis | 在 Weekly Ops Review 中追问"DAU 本周下降的可能原因"；Answer 必须 source 到正确 Query Result Material | Grounding Accuracy |
| T6 | Data Analysis | 从 Weekly Ops Review 的 `action_plan` 触发一个 ActionRequest；验证 preview 和 sign-off 流程 | Action Decision Precision |
| T7 | Cross-scenario | 完整走通：添加 Materials → 生成 Artifact → Review/Diff → 查看 Evidence → 投影到飞书 → 查看 Audit | Task Success Rate |

**T7 系统判断条件：**

```
projection_created audit event 存在
AND artifact.state = 'reviewed'
AND artifact.external_projections 不为空
AND audit 中包含 action_approved + projection_created 事件
```

---

### 7.1 Task Success Rate

目标场景中端到端任务完成比例。

**评估方式：**

- T7：系统自动检查（条件见 §7.0）
- T1 / T4：人工判断"Artifact 结构完整，内容与材料相关，无明显幻觉段落"

**合格标准：** T7 完整跑通；T1 / T4 必填 block 无缺失

### 7.2 Structured Artifact Validity

生成 Artifact 是否符合类型结构与必填块约束。

**评估方式：**

- 系统：schema 检查，统计必填 block 缺失数
- 人工：抽样检查 content 是否与 block_type 语义一致

**合格标准：** 必填 block 零缺失；`metric_snapshot` 中无指标值空缺（数据场景）

### 7.3 Material Grounding Accuracy

关键结论是否可追溯到正确 Material。

**评估方式：**

- 从生成 Artifact 中抽取 5 条关键断言（指标值、风险项、用户洞察）
- 人工核对对应 `evidence_refs` 是否真实指向相关 Material 片段或数据字段
- 数据场景还需确认 `metric_id` + `value` + `time_range` 三者与查询结果一致

**合格标准：** ≥ 80% 抽样 EvidenceRef 正确指向有效 Material 内容

### 7.4 Suggestion Acceptance Rate

Review/Diff 中被用户接受的建议比例。

**评估方式：**

- 系统自动记录每次 diff 的 `review_state`（accepted / rejected）
- 计算 `accepted / total_suggested`，按 Artifact Type 分别统计

**合格标准：** 内测阶段记录基线值，不设硬门槛，用于后续优化对比

### 7.5 Action Decision Precision

ActionRequest 的风险等级与 sign-off 建议是否被用户认可。

**评估方式：**

- 人工检查 T3 / T6：risk level 是否与实际动作匹配
- 观察用户是否手动调整风险等级或拒绝不合理动作

**合格标准：** 无 medium-risk 动作被系统误分类为 low；用户无需手动修正风险等级

### 7.6 Rework Rate

同一任务因智能错误导致的大幅重做比例。

**评估方式：**

- 系统记录同一 Artifact 被"全量重写"（> 50% blocks 被替换）的次数
- 观察用户是否触发"重新生成"或大幅手动覆盖

**合格标准：** 同一 Artifact 在 5 次交互内不需要全量重写

## 8. 技术验收指标

- Artifact 独立于 Session 持久化。
- Material 引用链可追踪。
- ActionRequest 可完整审计。
- Space/Library 隔离不回退。
- External Projection 写入成功后可回链。
- Evidence Chain 数据可供抽样评估。
- Data Warehouse 查询结果可材料化为 Material。
- 至少一组核心指标有 Metric Dictionary。

## 9. MVP 风险

### 9.1 范围风险

External Projection 容易演化成同步系统。MVP 必须坚持文档级单向投影。

### 9.2 心智风险

如果 Workspace Home 不够强，用户仍会认为 Kevin 是聊天工具。

### 9.3 智能风险

如果生成质量不足，证据链会暴露错误而不是建立信任。必须同步衡量智能指标。

### 9.4 治理风险

如果 Sign-off / Audit 只是形式化 UI，而不是对象级数据，企业信任无法建立。

## 10. MVP 完成定义

MVP 完成时，用户应能完成：

```text
Create Workspace
-> Add Materials
-> Generate Artifact
-> Review/Diff
-> Check Evidence
-> Project to External Document
-> Approve Action
-> View Audit
```

并能清楚理解：

- Kevin 为什么不是普通 AI Chat
- Kevin 为什么不替代飞书/Notion
- Kevin 如何把 AI 工作变成可审查、可执行、可沉淀的流程
