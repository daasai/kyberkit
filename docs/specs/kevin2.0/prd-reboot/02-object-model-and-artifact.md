# 对象模型与双态 Artifact 策略

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 第一性底层：`./00-first-principles.md`  
> 关联：`./11-first-encounter-spec.md`（directory_cognition Material 类型详细规格）

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
- 由"用户指认工作目录"创建（见 `11-first-encounter-spec.md`）：mount_path 即用户指定的目录路径，Workspace 与目录 1:1 绑定。
- 必须自动绑定一份 `directory_cognition` Material（见 §2.2.2），作为 Workspace 的项目认知档案。

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
- 支持 file_backed_material 子类型（见 §2.2.1）。

### 2.2.1 file_backed_material 子类型

MVP 引入一个 Material 子类型 `file_backed_material`：表示 Material 的**事实源是用户目录中的真实文件**，不是 Kevin 内部存储。Kevin 维护的 Material 对象只是文件的镜像。

#### 与普通 Material 的关系

| 维度 | 普通 Material | file_backed_material |
|---|---|---|
| 事实源 | Kevin 内部存储 | 用户目录中的文件（如 `.kevin/cognition.md`） |
| 同步 | 单向（Kevin → 内部存储） | 双向（Kevin ↔ 文件，文件为最终事实源） |
| 可见性 | 只在 Kevin 内可见 | 用户在文件管理器 / 编辑器 / git 中均可见 |
| 可移植性 | 锁在 Kevin 数据 | 跟随用户目录走 |
| 可分享性 | 需要 Kevin 间数据迁移 | 直接复制目录或 git 推送 |

#### 字段扩展（在通用 Material 字段基础上）

| 字段 | 含义 |
|---|---|
| `is_file_backed: true` | 标识此 Material 是 file-backed 子类型 |
| `backing_file_path` | 文件相对于 Workspace 根目录的路径，如 `.kevin/cognition.md` |
| `backing_file_format` | 文件格式描述（如 `markdown+yaml-frontmatter`、`jsonl`） |
| `last_synced_at` | Material 内存对象与文件最后一次同步的时间戳 |
| `history_log_path` | （可选）演进日志文件的路径，如 `.kevin/cognition.history.jsonl` |

#### 同步与冲突处理（高层原则）

- 文件较新（外部修改） → 解析文件 → 更新 Material → 追加日志（来源标注 `user_edit_file`）
- Material 较新（Kevin 修改） → 序列化 → 原子写文件（临时文件 + rename）+ 追加日志
- 两者同时变化 → 等待文件稳定（300ms 无变化）后取最新；冲突时以文件为最终事实源
- 文件被外部删除 → 从 Material 内存重建文件（不丢失认知）
- 文件解析失败 → 不破坏用户文件，UI 显式提示用户检查并提供 diff 预览

详细规格见 `11-first-encounter-spec.md` §5.6。

#### 使用范围

MVP 内 file_backed_material 的应用：

- `directory_cognition`（见 §2.2.2）

未来可扩展（不在 MVP 内）：

- 用户的 AGENT.md / CLAUDE.md / glossary.md / decision-log.md 等"项目记忆"文件
- 团队级共享的 `.kevin/skills.md`、`.kevin/preferences.md` 等

#### MVP 约束

- 文件写入仅限 `.kevin/` 子目录，不写入用户目录的其他位置
- 首次创建 `.kevin/` 时主动询问用户是否加入 `.gitignore`（默认建议是）
- 敏感文件名（`.env` / `credentials.*` / `*.pem` / `*.key` / 含 "secret" / "password" 命名）在 Material 化抽样阶段自动跳过
- 写入操作必须经过 LocalFilesConnector 的 `file-backed material write` capability（见 `08-connector-capability-governed-action.md` §10.1 扩展）

### 2.2.2 directory_cognition Material 类型

`directory_cognition` 是 file_backed_material 的**第一个具体类型**，表达 Kevin 对一个工作目录的整体认知。

#### 用途

- 第一次见面（用户指认工作目录）后，Kevin 形成的项目认知档案
- 持续演进——随用户与 Kevin 的交互、后台索引、目录变化更新
- 是 Workspace 的"项目档案"，可被任意 Artifact 引用为上下文

#### 唯一性

每个 Workspace 一份（与 Workspace 1:1 绑定）。

#### 文件位置与格式

- 事实源：`<workspace_root>/.kevin/cognition.md`
- 演进日志：`<workspace_root>/.kevin/cognition.history.jsonl`
- 文件格式：YAML frontmatter（结构化字段）+ Markdown body（人类可读叙事）

完整文件格式示例与 schema 定义见 `11-first-encounter-spec.md` §4.1（`DirectoryCognitionV1` TypeScript 接口）和 §5.3（文件格式规范）。

#### 字段摘要（结构化 frontmatter）

```typescript
interface DirectoryCognitionV1 {
  project_identification: {
    inferred_type: string;
    inferred_topic: string;
    inferred_stage: string | null;
    confidence: 'high' | 'medium' | 'low';
  };
  directory_overview: {
    total_files: number;
    file_type_distribution: Record<string, number>;
    last_modified_at: string;
    activity_pattern: string;
  };
  key_findings: Array<{
    finding_type: 'connection' | 'gap' | 'contradiction' | 'staleness' | 'opportunity';
    description: string;
    referenced_files: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  uncertainties: Array<{
    description: string;
    affected_files?: string[];
    will_resolve_in: 'background' | 'on_demand' | 'requires_user_input';
  }>;
  suggestions: NextStepSuggestion[];
  generated_at: string;
  generation_tier: 'tier1' | 'tier1+tier2';
  generation_model: string;
}
```

#### 演进触发器（MVP 必须支持）

| 触发器 | 来源标注 |
|---|---|
| 首次扫描完成 | `tier1` |
| 后台深度索引完成 | `background_indexing` |
| 用户在 Kevin 内编辑 | `user_edit_in_app` |
| 用户在外部编辑器修改 cognition.md | `user_edit_file` |
| 用户在 Chat 中纠正认知 | `user_correction_in_chat` |
| 用户接受/拒绝/修改建议（隐含偏好） | `inferred_from_user_action` |

完整触发器目录见 `11-first-encounter-spec.md` §5.4。

#### 与其他对象的关系

- **引用 local_file Material**：`key_findings.referenced_files` 中的每个文件路径都对应一个 `local_file` Material（如该文件已被 Material 化）
- **被 Artifact 引用**：可作为 Material 出现在任意 Artifact 的 evidence_refs 中（提供项目级上下文）
- **演进日志**：`cognition.history.jsonl` 是单独的 file_backed_material（子类型 `kevin-cognition-history/v1`），追加式写入，永不修改历史

#### MVP 约束

- 必须遵循 file_backed_material 的全部同步与冲突处理规则（见 §2.2.1）
- 必须在 Workspace Home 有入口（"目录认知"卡片或 Material 列表项）
- 演进日志必须可在 UI 中查看，并支持直接打开 `.kevin/cognition.history.jsonl` 文件
- 所有字段（包括 frontmatter 和 markdown body）必须可由用户编辑或纠正
- 字段被修改时，演进日志必须记录变化前后值
- Workspace 创建时（用户指定目录后）自动产出首版 directory_cognition

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

> **关于本节范围**：本节定义的 PRD 和 Weekly Ops Review 是 **MVP 阶段验证用的两个具体 Artifact 类型**——不是 Kevin 的 Artifact 类型边界。Kevin 服务的不是某个职业（参见 `01-product-strategy.md` §4 目标用户、`00-first-principles.md` 范围与适用性）。其他锚定场景（自媒体、投资、研究、咨询等）将通过新增 Artifact 类型扩展，复用本节定义的通用 schema（`ArtifactBlock`、`EvidenceRef`、Review/Diff 规则、可执行 Actions 等）。
> 
> 选择 PRD 与 Weekly Ops Review 作为首批类型，是因为它们覆盖了 Kevin 的两个关键能力面：
> - **PRD**：跨多种 Material 来源的**结构化制品**（访谈、用研、竞品、数据混合），证明 Kevin 处理软性证据 + 协作责任的能力
> - **Weekly Ops Review**：**强数据引用 + 行动衍生**的制品，证明 Kevin 处理硬性数据 + 决策溯源 + 行动闭环的能力

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
- file_backed_material 写入用户 `.kevin/` 之外的目录
- directory_cognition 之外的 file_backed_material 类型（AGENT.md / glossary.md 等扩展类型留待 Phase 2）
- 团队级共享 directory_cognition（多人写 cognition.md 的冲突处理留待 Phase 2）

## 7. 验收标准

### 7.1 通用对象

- Artifact 刷新后仍可从 Workspace 找回。
- Artifact 有 type、state、materials、blocks。
- Artifact 可进入 Review/Diff。
- Artifact 可触发 External Projection。
- Artifact 的 ActionRequest 可写入 Audit。

### 7.2 file_backed_material

- file_backed_material 写入时仅落到 `.kevin/` 子目录，不污染用户其他目录。
- Kevin 内修改 Material → 文件原子更新（写临时文件 + rename）。
- 文件被外部编辑器修改 → File watcher 触发 Material 更新，演进日志追加（`source: user_edit_file`）。
- 解析失败时不破坏用户文件，UI 显式提示并提供 diff 预览。
- 首次创建 `.kevin/` 时主动询问用户是否加入 `.gitignore`。

### 7.3 directory_cognition

- Workspace 创建时自动产出首版 directory_cognition（写入 `.kevin/cognition.md`）。
- 演进日志 `.kevin/cognition.history.jsonl` 创建并追加首次扫描记录（`source: tier1`）。
- 演进触发器目录（§2.2.2）中标注 MVP 必须支持的 6 类触发器全部可工作。
- 在 Workspace Home 有入口可查看 / 编辑 directory_cognition。
- 用户可直接打开 cognition.md 与 cognition.history.jsonl 文件。
- 详细体验和功能验收见 `11-first-encounter-spec.md` §11。
