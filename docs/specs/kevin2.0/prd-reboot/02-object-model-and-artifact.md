# 对象模型与双态 Artifact 策略

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`

## 1. 设计目标

Kevin 2.0 的对象模型要把“用户正在做什么”和“内容最终存在哪里”分开。

核心目标：

1. 用户在 Kevin 中操作的是语义对象，而不是文件路径或聊天消息。
2. Kevin 能追踪材料、制品、动作和审计之间的关系。
3. 外部文档平台可作为协作投影，但不能成为 Kevin 语义执行层的唯一真源。

## 2. MVP 一等对象

### 2.1 SemanticWorkspace

语义工作空间是 Kevin 2.0 的主心智对象。它不是一个目录，而是围绕某个工作目标组织起来的对象集合。

建议字段：

- `workspace_id`
- `space_id`
- `library_id`
- `mount_path`
- `name`
- `work_type`
- `views`
- `connectors`
- `capabilities`
- `policies`

MVP 约束：

- 必须绑定 Kevin 1.5 Rev3 的 Space/Library 关系。
- 必须保留 Library 挂载路径作为本地材料与导出根。
- 必须能进入 Materials、Artifacts、Actions、Audit。

### 2.2 Material

Material 是 Kevin 使用、引用、加工的材料。文件只是 Material 的一种来源。

建议字段：

- `material_id`
- `workspace_id`
- `source_type`
- `source_ref`
- `display_name`
- `mime_type`
- `summary`
- `status`
- `indexed_at`

典型来源：

- 本地 Markdown、CSV、JSON、PDF、图片
- Connector Data
- Data Warehouse Query Result
- 外部协作文档
- 模板
- 生成过程中的中间材料

MVP 约束：

- 支持本地文件材料化。
- 支持 CSV/JSON 的轻解析。
- 支持数仓查询结果材料化为 Material。
- 支持 Metric Dictionary 为数据材料提供业务口径。
- 解析失败时降级为普通文件材料，不阻断主流程。
- 支持被 SemanticArtifact 引用。

### 2.3 SemanticArtifact

SemanticArtifact 是 Kevin 2.0 最关键的工作对象。它可以投影到外部文档平台，但它本身不是飞书文档、Notion 页面或本地 Markdown 文件。

建议字段：

- `artifact_id`
- `workspace_id`
- `type`
- `schema_ref`
- `title`
- `state`
- `blocks`
- `materials`
- `actions`
- `storage_ref`
- `external_projections`
- `audit_ref`

MVP 约束：

- 必须独立于 Session 持久化。
- 可以由 Session 生成，但不能只存在于消息流。
- 必须可重新打开、审查、修改、投影。
- 必须支持至少 block 级结构，以服务 Review/Diff 和证据标记。

### 2.4 ActionRequest

ActionRequest 是绑定在语义对象上的具体动作请求。

建议字段：

- `action_id`
- `workspace_id`
- `target_artifact_id`
- `action_type`
- `connector_id`
- `capability_id`
- `risk_level`
- `preview`
- `signoff_required`
- `state`
- `audit_ref`

MVP 典型动作：

- `export_markdown`
- `write_to_library`
- `create_external_projection`
- `mock_write_back`

## 3. 双态 Artifact 策略

Kevin 2.0 不重造通用文档编辑器，但必须保留自己的语义对象层。

因此 Artifact 采用双态策略：

```text
Kevin Native Artifact（源对象）
        |
        v
External Projection（外部协作文档投影）
```

### 3.1 Kevin Native Artifact

源对象由 Kevin 管理，负责：

- 类型与结构
- 材料引用
- Review/Diff
- ActionRequest
- Sign-off
- Audit
- Skill Forge 学习信号

### 3.2 External Projection

外部投影由飞书、Notion、Confluence 等平台承载，负责：

- 组织内阅读
- 评论
- 分享
- 协作编辑
- 知识库沉淀

MVP 中，External Projection 不是 Kevin 源对象的替代品。

## 4. 为什么不完全外包给文档平台

如果把 Artifact 完全外包给外部文档平台，Kevin 会失去以下能力：

1. 无法稳定表达材料引用关系。
2. 无法将 ActionRequest 与 Artifact 生命周期绑定。
3. 无法用统一审计链回答“AI 做了什么、谁批准了什么、写到了哪里”。
4. Skill Forge 学不到完整工作过程，只能看到零散文本。

因此外部平台是协作平面，Kevin 是控制平面。

## 5. MVP Artifact Type

MVP 保留两个首批类型，完整 schema 如下。

---

### 5.1 PRD

#### Blocks（有序）

| block_type | 标题 | 必填 | Evidence 要求 |
|---|---|---|---|
| `overview` | Overview | ✅ 必填 | 可 `inferred` |
| `problem` | Problem Statement | ✅ 必填 | 必须有 `quoted` 或 `summarized` 类型 EvidenceRef |
| `goals` | Goals & Success Metrics | ✅ 必填 | 推荐材料支撑，无则 `partially-supported` |
| `users` | Target Users | ✅ 必填 | 推荐材料支撑，无则 `partially-supported` |
| `scope` | Solution Scope | ✅ 必填 | 可 `inferred` |
| `requirements` | Requirements | ✅ 必填 | 可 `inferred` |
| `risks` | Risks & Mitigations | 推荐 | 允许 `inferred`，但必须经 Review 确认 |
| `acceptance_criteria` | Acceptance Criteria | 推荐 | 可 `inferred` |
| `open_questions` | Open Questions | 可选 | 无要求 |

#### Block 数据结构

```typescript
interface ArtifactBlock {
  block_id: string;
  artifact_id: string;
  block_type: string;
  title: string;
  content: string;            // Markdown
  evidence_refs: EvidenceRef[];
  support_level: 'well-supported' | 'partially-supported' | 'inferred' | 'needs-review';
  review_state: 'pending' | 'reviewed' | 'accepted' | 'rejected';
  order: number;
  updated_at: string;
}

interface EvidenceRef {
  material_id: string;
  usage_type: 'quoted' | 'summarized' | 'calculated' | 'inferred' | 'background';
  snippet_or_range?: string;
  metric_id?: string;         // 数据场景使用
  field?: string;
  value?: string;
  time_range?: string;
  note?: string;
}
```

#### Review/Diff 规则

- 只允许 block 级重写，不跨 block 合并。
- Diff 必须展示：原内容 / 新内容 / 触发该建议的 EvidenceRef（若有）。
- `problem`、`users` block 的 diff 建议必须携带 EvidenceRef，否则标记 `needs-review`。
- 用户接受或拒绝 diff 时，记录 `review_state` 变更事件（供 Skill Forge 消费）。

#### Evidence 要求

- `problem`、`users`：必须有至少一个 `quoted` 或 `summarized` EvidenceRef，否则标记 `needs-review`。
- `goals`：推荐有 EvidenceRef，无则 `partially-supported`。
- `risks`：允许 `inferred`，但须在 Review 中经用户确认才能从 `needs-review` 转为 `reviewed`。

#### 可执行 Actions

| Action | Capability | Risk | Sign-off |
|---|---|---|---|
| Export Markdown | `write_to_library` | low | 否 |
| Export HTML Presentation | `write_to_library` | low | 否 |
| Create External Doc | `create_external_projection` | medium | ✅ 需要 |
| Overwrite External Doc | `update_external_projection` | high | ✅ 需要显式确认 |

---

### 5.2 Weekly Ops Review

#### Blocks（有序）

| block_type | 标题 | 必填 | Evidence 要求 |
|---|---|---|---|
| `executive_summary` | Executive Summary | ✅ 必填 | 可 `inferred`，但须有数据支撑 |
| `metric_snapshot` | Metric Snapshot | ✅ 必填 | **必须**有 `data_warehouse_query` 类型 Material；每个指标值必须有 `metric_id` + `value` + `time_range` |
| `trend_analysis` | Trend Analysis | ✅ 必填 | 必须有 `calculated` 类型 EvidenceRef |
| `anomalies` | Anomalies | 推荐 | 须有 Material 支撑，或强制标记 `needs evidence` |
| `insights` | Insights & Interpretation | ✅ 必填 | 允许 `inferred`，但须 Review 确认 |
| `action_plan` | Action Plan | ✅ 必填 | 每条 action item 须关联至少一个 `source_block_id`（指向触发它的 Insight 或 Anomaly） |
| `follow_ups` | Follow-ups | 可选 | 无要求 |
| `evidence_appendix` | Evidence / Appendix | 推荐 | 自动汇总当前 Artifact 的所有 Query Result Materials |

#### 与 PRD 的关键差异

1. **`metric_snapshot` 强制数据引用**：每个指标值必须指向 `material_id + metric_id + value + time_range`，不允许静默空缺，缺失即标记 `needs evidence`（PRD 是推荐而非强制）。
2. **`action_plan` item 级溯源**：每条 action item 有 `source_block_id`，链接到触发它的 block。
3. **Action Plan 可触发 ActionRequest**：`action_plan` 中的 item 可标记 `→ Create ActionRequest`，支持投影到外部文档或 `mock_write_back`。

#### Action Plan Item 数据结构

```typescript
interface ActionPlanItem {
  item_id: string;
  block_id: string;              // 所属 action_plan block
  description: string;
  owner?: string;
  due_date?: string;
  source_block_id: string;       // 必填，关联 insights / anomalies block
  action_request_id?: string;    // 若已触发 ActionRequest，填入
  state: 'open' | 'in_progress' | 'done' | 'cancelled';
}
```

#### 可执行 Actions

与 PRD 相同，额外增加：

| Action | Capability | Risk | Sign-off |
|---|---|---|---|
| Create ActionRequest from Action Plan | 取决于目标 Capability | medium | ✅ 需要 |

## 6. 非目标

MVP 不做：

- 通用富文本编辑器
- 多人实时协同编辑
- 外部文档 block 级同步
- 外部评论自动回流
- 复杂版本合并

## 7. 验收标准

- Artifact 刷新后仍可从 Workspace 找回。
- Artifact 有 type、state、materials、blocks。
- Artifact 可进入 Review/Diff。
- Artifact 可触发 External Projection。
- Artifact 的 ActionRequest 可写入 Audit。
