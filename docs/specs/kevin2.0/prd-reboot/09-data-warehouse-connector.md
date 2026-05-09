# Data Warehouse Connector MVP 设计

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 前提：用户已准备数仓 MCP，可作为 Kevin 2.0 的首个真实 Connector  
> 体系基线：`08-connector-capability-governed-action.md`

## 1. 设计结论

Kevin 2.0 MVP 不使用 mock connector。  
Data Warehouse MCP 作为首个真实 Connector，用于验证企业真实上下文连接、数据材料化、证据链和 Weekly Ops Review 场景。

### 1.1 MCP 能力确认状态（2026-05-09）

| 能力项 | 状态 | 说明 |
|---|---|---|
| 参数化查询 | ✅ 已确认支持 | 不需要自由 SQL，通过预置模板 + 参数执行 |
| 查询结果 schema | ⏳ 待确认 | 格式待对接后确认，Kevin 侧需根据实际 schema 做 result parser |
| 指标元数据（Metric Dictionary） | ❌ MCP 侧不支持 | 由 Kevin 层维护本地 Metric Dictionary 文件补齐，MVP 必需路径 |
| 权限范围信息 | ✅ 已确认可用 | 可在 Kevin Connector 详情页展示当前用户的可访问数据域 |

### 1.2 MVP 主路径确认

基于以上确认，Data Analysis MVP 主路径可以跑通：

```
参数化查询执行
→ Kevin 侧 result parser（schema 待确认后适配）
→ Query Result 材料化为 Material
→ 本地 Metric Dictionary 提供指标口径
→ Weekly Ops Review Artifact 生成
→ 证据链标注
→ ActionRequest / External Projection / Audit
```

**阻塞项只剩一个**：查询结果 schema 确认后，Kevin 侧 result parser 才能实现。在此之前可用 mock result schema 并行推进前端和 Artifact 生成逻辑。

### 1.3 MCP 侧补齐项

MVP 阶段必须在 Kevin 层补齐（不依赖 MCP 侧改造）：

1. **本地 Metric Dictionary**：YAML/JSON 文件，绑定到 Data Warehouse Connector
2. **Query Result 材料化**：Kevin Sidecar 负责，MCP 只提供查询结果
3. **Audit 记录**：Kevin 侧负责，MCP 无需支持
4. **Weekly Ops Review Artifact schema**：Kevin 侧定义
5. **证据链标注**：Kevin Runtime 负责

## 2. MVP 定位

Data Warehouse Connector 是 Kevin 2.0 MVP 的真实业务上下文入口。

它要验证：

- Kevin 能连接真实企业数据，而不是只处理本地文件。
- Kevin 能把查询结果变成可引用 Material。
- Kevin 能基于数据 Material 生成结构化 Artifact。
- Kevin 能让关键结论可追溯到指标、字段、时间范围和查询结果。
- Kevin 能把数据复盘结果继续进入 ActionRequest / External Projection / Audit。

## 3. Connector / Capability 契约

### 3.1 Connector

```text
Connector: Data Warehouse
Type: enterprise_data
Adapter level: Level 2 Read API / MCP Adapter
Mode: read-only for MVP
```

MVP 必须坚持 read-only。  
不支持写表、改数据、建任务、改口径。

### 3.2 Capabilities

MVP Capabilities：

1. `list_available_metrics`
   - 列出当前用户权限范围内可用指标。
   - **实现方式**：读取本地 Metric Dictionary（MCP 侧不提供元数据），展示已定义的指标列表。

2. `run_authorized_query`
   - 执行权限范围内的数据查询。
   - **✅ 已确认**：通过参数化查询模板执行，不支持自由 SQL，符合安全边界要求。
   - 参数化模板由 Kevin 侧维护，用户通过参数选择时间范围、维度等。

3. `explain_metric_definition`
   - 返回指标口径说明。
   - **实现方式**：MCP 侧不支持，由 Kevin 层本地 Metric Dictionary 提供。MVP 必需路径，不可降级。

4. `materialize_query_result`
   - 将查询结果保存为 Kevin Material。
   - **实现方式**：Kevin Sidecar 负责，MCP 只提供 raw 查询结果。
   - ⏳ result parser 实现依赖查询结果 schema 确认。

5. `refresh_query_material`
   - 在用户确认后刷新已有查询结果 Material。
   - MVP 可选，成本高可延后至 Phase 2。

## 4. 权限与安全边界

数仓 Connector **✅ 已确认**可以在 Kevin UI 中展示当前用户的权限范围信息。

### 4.1 Connector 详情页展示内容

```
Data Warehouse Connector
状态: Connected

权限范围
- 可访问数据域: [由 MCP 返回，对接后填充]
- 可访问指标: [来自本地 Metric Dictionary，N 个已定义]

查询限制
- 查询类型: 参数化查询（不支持自由 SQL）✅
- 单次行数上限: [待对接后确认]
- 查询超时: [待对接后确认]
- 明细数据导出: 不允许（只能材料化为受控 Material）

审计
- 所有查询动作进入 Audit ✅
```

### 4.2 MVP 默认安全策略

- 只读，不允许任何数仓写入
- 只允许参数化查询（已确认，自由 SQL 不在 MVP 范围）
- 查询结果行数有上限（待 result schema 确认后定值）
- 敏感字段默认不进入 Artifact 正文，只在受控 Material 中保留
- 所有 `run_authorized_query` 执行写入 Audit

## 5. Metric Dictionary / 指标口径层

### 5.1 为什么必须补齐

数仓查询结果只告诉 Kevin “数值是什么”，但不能保证 Kevin 理解“业务含义是什么”。

没有指标口径层，Kevin 容易出现：

- 指标解释错误
- 同名指标混淆
- 时间粒度误读
- 维度口径误用
- 将相关性误写成因果

因此 Metric Dictionary 是 Data Warehouse Connector 的 MVP 必需能力。

### 5.2 最小字段

```text
MetricDefinition
- metric_id
- display_name
- business_definition
- calculation_logic
- source_table_or_query
- grain
- supported_dimensions
- default_time_window
- owner
- caveats
- examples
```

### 5.3 示例

```text
metric_id: weekly_active_users
display_name: Weekly Active Users
business_definition: 一周内完成核心动作的去重用户数
grain: week
supported_dimensions: channel, segment, region
default_time_window: last_8_weeks
caveats:
- 不包含内部测试账号
- 与月活用户不可直接相加
```

### 5.4 MVP 实现方式（已确认路径）

数仓 MCP **不提供**指标元数据接口，Kevin MVP 使用本地 Metric Dictionary 作为唯一口径层。这不是 fallback，而是 MVP 主路径。

实现要求：

- 本地 YAML 或 JSON 文件维护，放置于 Workspace Library 内
- 绑定到 Data Warehouse Connector，Connector 详情页展示已定义指标
- 在 Workspace Setup 中提供"导入 / 编辑 Metric Dictionary"入口
- 被 Weekly Ops Review Artifact 和 Evidence Chain 引用
- 文件变更时，已生成 Artifact 的相关 block 标记 `source: stale`

文件格式示例（YAML）：

```yaml
metrics:
  - metric_id: weekly_active_users
    display_name: Weekly Active Users
    business_definition: 一周内完成核心动作的去重用户数
    grain: week
    supported_dimensions: [channel, segment, region]
    default_time_window: last_8_weeks
    caveats:
      - 不包含内部测试账号
      - 与月活用户不可直接相加
```

Metric Dictionary 文件的 `metric_id` 必须与参数化查询模板中引用的字段名一致，以支持 EvidenceRef 的 `metric_id` 对齐。

## 6. Query Result -> Material 材料化

### 6.1 设计原则

查询结果不能只作为一次 tool output 使用。  
它必须进入 Material Layer，才能被 Artifact 引用、被 Evidence Badge 指向、被 Audit 回放。

### 6.2 Material 字段

```text
Material
- material_id
- workspace_id
- source_type: data_warehouse_query
- connector_id
- capability_id
- query_ref
- query_label
- metric_ids
- time_range
- dimensions
- result_schema
- row_count
- sampled_preview
- summary
- generated_at
- status
- audit_ref
```

### 6.3 QueryRef 字段

```text
QueryRef
- query_id
- query_type
- query_text_or_template_id
- parameters
- executed_by
- executed_at
- permission_scope
- result_hash
```

MVP 应避免在 Artifact 正文中暴露完整 SQL 或敏感参数；可在审计或开发诊断中保留受控引用。

## 7. 数据证据链

数据场景的 EvidenceRef 与文档片段不同。

最小字段：

```text
EvidenceRef
- material_id
- metric_id
- field
- value
- time_range
- filters
- usage_type: calculated | summarized | inferred | background
- generated_at
```

示例：

```text
EvidenceRef
- material_id: query_result_2026_w18_retention
- metric_id: week1_activation_rate
- field: activation_rate
- value: 34%
- time_range: 2026-W18
- filters: segment = new_users
- usage_type: calculated
```

## 8. Weekly Ops Review Artifact Schema

Data Warehouse Connector 的首个核心 Artifact Type 是：

```text
weekly_ops_review
```

最小 blocks：

1. `Executive Summary`
2. `Metric Snapshot`
3. `Trend Analysis`
4. `Anomalies`
5. `Insights`
6. `Action Plan`
7. `Evidence / Appendix`

每个数据结论 block 必须能指向至少一个 Query Result Material 或明确标记 `needs evidence`。

## 9. 真实样例任务集

MVP 需要准备 5-10 个真实但可控的任务作为评测集。

建议任务：

1. 基于本周指标生成运营复盘。
2. 对比本周与上周核心指标变化。
3. 解释某个指标下降原因。
4. 找出异常指标。
5. 生成下一步 Action Plan。
6. 将 Weekly Ops Review 制作为 HTML PPT。
7. 将 Weekly Ops Review 投影到外部协作文档。

这些任务用于评估：

- Task Success Rate
- Material Grounding Accuracy
- Structured Artifact Validity
- Suggestion Acceptance Rate
- Rework Rate

## 10. UI 落位

沿用 `../kevin2-ia-ux-v2.md` 的 UX/IA。

### 10.1 Setup / Connector Detail

展示：

- Data Warehouse Connector 状态
- 当前权限范围
- 可用 Metrics
- 可用 Capabilities
- 查询限制
- 指标口径入口

### 10.2 Materials Center

展示 Query Result Material：

- 查询名称
- 指标
- 时间范围
- 行数
- 生成时间
- 状态

### 10.3 Artifact Inspector > Materials

展示 Weekly Ops Review 使用过的 query materials。

### 10.4 Evidence Badge

数据结论 block 显示：

- `From Data Warehouse`
- `Calculated`
- `Based on N metrics`
- `Source stale`
- `Needs evidence`

## 11. Audit

MVP 需要记录：

- 查询发起时间
- 查询 capability
- 用户权限范围
- 查询参数或 query_ref
- 结果材料化 ID
- Artifact 生成事件
- ActionRequest / Projection 事件

查询 Audit 不等于暴露敏感 SQL。实现层需区分用户可见审计与开发诊断信息。

## 12. MVP 验收标准

- Data Warehouse MCP 以 Connector 形态出现在 Kevin 中。
- 用户能看到当前权限范围和可用数据能力（权限范围信息已确认可用）。
- 至少一组指标有 Metric Dictionary（本地 YAML 文件，已确认为 MVP 主路径）。
- 参数化查询可以执行（已确认 MCP 支持）。
- 查询结果可以材料化为 Material。
- Weekly Ops Review 可以引用 Query Result Material。
- 关键数据结论可以通过 Evidence Badge 指向查询材料。
- 查询与材料化事件进入 Audit。
- 不使用 mock connector 完成 Data Analysis MVP 主路径。

### 12.1 当前阻塞项

| 阻塞项 | 当前状态 | 解除条件 |
|---|---|---|
| Query Result 的 result schema 格式 | ⏳ 待确认 | 与数仓 MCP 对接后确认字段格式，Kevin 侧 result parser 实现依赖此项 |

在 result schema 确认前，可并行推进：前端 Weekly Ops Review 渲染、Metric Dictionary 文件格式、Artifact schema 定义。result parser 和 materialize 逻辑在确认后单独实现。

## 13. 非目标

MVP 不做：

- 写回数仓
- 建表 / 改表 / 改口径
- 自由无限制 SQL
- 复杂 BI dashboard
- 自动根因分析平台
- 实时监控告警
- 全量指标治理平台
