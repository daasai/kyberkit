# 材料引用证据链设计

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`

## 1. 设计目标

材料引用证据链用于支撑 Kevin 2.0 的智能可信度。

用户需要能回答三个问题：

1. Kevin 用了哪些材料？
2. 某个关键结论从哪里来？
3. 哪些内容是模型推理、假设或缺少证据？

MVP 目标不是建立论文式 citation 系统，而是建立产品级可检查证据链。

## 2. MVP 边界

MVP 只做三件事：

1. `Inspector > Materials`
2. `Evidence Badge`
3. `Chat Sources`

MVP 不做：

- 每句话 citation
- 复杂证据面板
- 百分比置信度
- block 级外部同步
- 自动外部文档回流

## 3. UI 呈现

### 3.1 Inspector > Materials

位置：Artifact Focus 右侧 Inspector 的 Materials tab。

作用：展示当前 Artifact 使用过的材料清单、来源与状态。

示例：

```text
Inspector > Materials

Used in this Artifact (6)

Local Files
✓ user-interview-notes.md
  used for: Problem, Users, Risks
  status: available

Data
✓ churn_metrics_q2.csv
  used for: Metric Snapshot, Action Plan
  status: available

Connector
⚠ Data Warehouse / retention_query
  used for: Trend Analysis
  status: stale · last synced 2d ago
```

必须展示：

- material name
- source type
- status
- used for

### 3.2 Evidence Badge

位置：Artifact 主视图中关键 block 的轻量标记。

只在关键内容上显示：

- 指标
- 结论
- 风险
- 行动建议
- 关键需求

Badge 类型：

- `Based on N materials`
- `From CSV`
- `Calculated`
- `Inferred`
- `Needs evidence`
- `Stale source`

MVP 点击行为：

- 点击后定位到 Inspector > Materials 中相关材料。
- 不展开复杂证据面板。

### 3.3 Chat Sources

位置：Contextual Chat 回答底部，默认折叠。

示例：

```text
Sources: 2 materials · 1 assumption · no missing context
```

展开后显示：

```text
Referenced
- user-interview-notes.md
- sales-discovery-summary.md

Assumptions
- 将“业务负责人”视为独立 persona，而非 PM 的上级角色

Missing context
- 缺少定量使用频率数据
```

## 4. Support Level

MVP 不使用百分比置信度。使用可解释状态标签：

- `well-supported`
- `partially-supported`
- `inferred`
- `needs-review`

这些状态用于 UI badge、智能指标抽样与 Review 辅助。

## 5. 最小数据结构

```text
ArtifactBlock
- block_id
- content
- evidence_refs[]
- support_level

EvidenceRef
- material_id
- usage_type
- snippet_or_range
- note
```

`usage_type` 取值：

- `quoted`
- `summarized`
- `calculated`
- `inferred`
- `background`

## 6. 与智能指标的关系

### 6.1 Material Grounding Accuracy

通过抽样检查 `evidence_refs` 是否真实支撑相关 block。

### 6.2 Structured Artifact Validity

检查关键 block 是否符合 Artifact schema，并是否有必要证据。

### 6.3 Suggestion Acceptance Rate

比较带证据标记的建议与无证据建议的采纳率。

### 6.4 Rework Rate

观察 `needs-review` 或 `needs evidence` 的 block 是否导致后续大幅返工。

## 7. 交互原则

1. 默认不打断阅读。
2. 只对关键 block 展示证据标记。
3. 用户能在一次点击内看到材料来源。
4. 模型推理必须和材料事实区分。
5. 证据不足时要显式提示，而不是静默补全。

## 8. 验收标准

- Artifact Inspector 能显示本 Artifact 使用过的 Materials。
- 至少 PRD / Weekly Ops Review 的关键 block 能显示 Evidence Badge。
- Contextual Chat 的回答能显示 Sources 折叠区。
- `Needs evidence` 的 block 可以被用户识别。
- 证据链数据可用于 9.4 智能指标抽样。
