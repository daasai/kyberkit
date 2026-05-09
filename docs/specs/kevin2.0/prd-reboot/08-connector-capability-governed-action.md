# Connector / Capability / Governed Action 体系设计

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 设计目标：定义 Kevin 2.0 如何接入企业系统，并将外部能力转化为可授权、可预览、可签批、可审计的 AI 动作

## 1. 核心判断

Kevin 2.0 的 Connector 体系不应被设计成“工具接入列表”。

它应被设计成企业 AI 的能力授权与动作治理模型：

```text
Connector = 接入对象
Capability = 被授权的能力
ActionRequest = 某次具体动作请求
Policy / Sign-off / Audit = 企业治理闭环
```

这套体系的战略价值不在于“Kevin 能调用多少工具”，而在于 Kevin 能回答企业真正关心的问题：

- Kevin 连接了哪些系统？
- Kevin 被允许做什么？
- 哪些能力只是读取，哪些能力会写入或执行？
- 哪些动作需要用户确认？
- 执行前能不能预览？
- 执行后能不能追责？

## 2. 设计原则

### 2.1 Adapter-first

Kevin 适配旧系统，而不是要求旧系统适配 Kevin。

企业旧系统通常存在 API 不完整、权限粗糙、文档缺失、只能导出文件、改造排期长等问题。如果 Kevin 要求这些系统主动支持 Kevin 的 Connector 规范，落地会非常困难。

因此 Connector 规范应是 Kevin 内部统一抽象层，旧系统通过 Adapter 被翻译成 Kevin 可理解的对象。

### 2.2 Progressive Integration

企业系统接入必须支持渐进成熟：

```text
File Import
-> Reusable Material Source
-> Read Connector
-> Governed Action Connector
```

也可以表述为：

```text
Materialize first
Capability second
Governed Action last
```

先材料化，再能力化，最后治理化。

### 2.3 Capability is the authorization unit

用户不应授权一个模糊的“系统接入”，而应理解 Kevin 对这个系统具体能做什么。

Capability 是最小授权单元。

### 2.4 Write / Execute must be governed

写入和执行能力不能被模型直接调用。必须生成 ActionRequest，经过预览、策略检查、签批和审计。

## 3. Connector 成熟度分层

### 3.1 Level 1：File / Export Adapter

最低门槛。旧系统不需要改造，只要能导出文件即可。

来源包括：

- CSV
- Excel
- PDF 报表
- 邮件附件
- 本地下载目录
- 手工上传文件

Kevin 将这些转成 Material。

适用系统：

- 旧 BI
- 旧 CRM
- 旧 ERP
- 人工导出的运营报表

优点：

- 接入成本最低
- 不依赖系统改造
- 可作为所有 Connector 的 fallback

限制：

- 非实时
- 权限与口径依赖外部约定
- 审计链较弱

### 3.2 Level 2：Read API / MCP Adapter

系统已有 API、数据库只读账号或 MCP server。

Kevin 通过 Adapter 包装成 Connector / Capability。

适用系统：

- Data Warehouse
- 飞书文档读取
- Notion / Confluence 读取
- Jira / GitHub 读取
- 内部查询服务

优点：

- 稳定
- 可刷新
- 可审计
- 可材料化

限制：

- 需要接口权限
- 需要整理口径与数据边界

### 3.3 Level 3：Governed Write / Execute Adapter

系统允许写入、发布或执行业务动作。

适用系统：

- 飞书创建文档
- Confluence 创建页面
- Notion 创建页面
- CRM 状态更新
- 内容平台发布
- 营销系统下发

优点：

- 能完成真实工作闭环
- 能验证 Kevin 的企业级执行价值

限制：

- 接入成本最高
- 必须强制 Sign-off / Audit / Policy
- high risk 动作 MVP 不应真实执行

## 4. Connector 对象

Connector 是用户可理解的一级接入对象。

示例：

- Local Files
- Data Warehouse
- Feishu
- Notion
- Confluence
- GitHub
- Browser / Web
- CRM
- BI / Marketing System

建议字段：

```text
Connector
- connector_id
- display_name
- connector_type
- status
- auth_status
- adapter_level
- permission_scope
- capabilities[]
- default_policy_id
- recent_activity
- diagnostics
```

状态：

- `connected`
- `degraded`
- `disconnected`
- `reauth_required`
- `unsupported`

## 5. Capability 对象

Capability 是 Connector 暴露给 Kevin 的最小可授权能力。

统一四类：

```text
Read
Watch
Write
Execute
```

建议字段：

```text
Capability
- capability_id
- connector_id
- label
- kind: read | watch | write | execute
- risk_level: low | medium | high
- enabled
- requires_signoff
- audit_required
- input_schema
- preview_schema
- permission_scope
- rate_limit
```

示例：

```text
Feishu Connector
- Read Docs: read
- Create Doc: write
- Update Doc: write
- Send Message: execute

Data Warehouse Connector
- List Metrics: read
- Run Query: read
- Watch Metric Threshold: watch

Confluence Connector
- Read Page: read
- Create Page: write
- Update Page: write
```

## 6. Governed Action

Governed Action 是 Kevin 2.0 区别于普通 agent tool calling 的关键。

普通 agent 是“调用工具”。  
Kevin 是“提出可治理动作”。

标准链路：

```text
Intent
-> Capability Match
-> ActionRequest
-> Preview
-> Policy Check
-> Sign-off if needed
-> Execute
-> Audit
```

### 6.1 ActionRequest 最小 Schema

```typescript
interface ActionRequest {
  action_id: string;              // uuid
  workspace_id: string;
  artifact_id: string | null;     // 可能不关联 Artifact（如纯数据查询）
  action_type: ActionType;
  connector_id: string;
  capability_id: string;
  risk_level: 'low' | 'medium' | 'high';
  preview: ActionPreview;
  impact_summary: string;         // 用户可读的"将要发生什么"，一句话
  policy_result: PolicyResult;
  signoff_required: boolean;
  signoff_by: string | null;      // user_id，approved 后填入
  state: ActionState;
  created_at: string;             // ISO 8601
  updated_at: string;
  audit_ref: string | null;       // audit_id，执行后填入
}

type ActionType =
  | 'export_markdown'
  | 'write_to_library'
  | 'create_external_projection'
  | 'update_external_projection'
  | 'mock_write_back';

type ActionState =
  | 'pending_preview'    // 预览生成中
  | 'awaiting_signoff'   // 等待用户确认
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

interface ActionPreview {
  target_platform: string;        // 'feishu' | 'local' | 'notion' | ...
  target_location: string;        // 文件夹名称 / 路径，用户可读
  document_title: string;
  outline: string[];              // 文档大纲条目
  format_warnings: string[];      // 格式降级提示，如"表格将转为纯文本"
  estimated_impact: string;       // 简短影响描述，用于 Action Panel 展示
}
```

### 6.2 PolicyResult 最小 Schema

```typescript
interface PolicyResult {
  policy_id: string;
  evaluated_at: string;           // ISO 8601
  outcome: 'allowed' | 'requires_signoff' | 'blocked';
  reason: string;                 // 用户可读的策略说明
  required_signoff_roles: string[]; // MVP 阶段只有 ['current_user']
}
```

MVP 默认 Policy（硬编码）：

| Capability Kind | PolicyResult.outcome | 说明 |
|---|---|---|
| `read` | `allowed` | 不需要 Sign-off |
| `write` | `requires_signoff` | 需要预览 + 用户确认 |
| `execute` | `blocked` | MVP 不实现 |
| `high` risk | `blocked` | MVP 不实现真实 high-risk 执行 |

### 6.3 AuditEntry 最小 Schema

```typescript
interface AuditEntry {
  audit_id: string;               // uuid
  workspace_id: string;
  event_type: AuditEventType;
  actor_id: string;               // user_id 或 'system'
  timestamp: string;              // ISO 8601
  artifact_id: string | null;
  material_id: string | null;
  action_id: string | null;
  payload: Record<string, unknown>; // event-specific，见下
  outcome: 'success' | 'failure' | 'cancelled';
  error_message: string | null;
}

type AuditEventType =
  | 'artifact_created'
  | 'artifact_updated'
  | 'artifact_reviewed'           // block diff accept / reject
  | 'material_added'
  | 'material_refreshed'
  | 'query_executed'              // 数仓参数化查询
  | 'query_materialized'          // 查询结果写入 Material
  | 'action_requested'
  | 'action_approved'
  | 'action_rejected'
  | 'action_executed'
  | 'projection_created'
  | 'projection_updated'
  | 'skill_saved';
```

**典型 payload 示例：**

`projection_created`：
```json
{
  "platform": "feishu",
  "external_doc_id": "doxcnXXXXXX",
  "external_url": "https://xxx.feishu.cn/docx/xxx",
  "artifact_id": "uuid",
  "artifact_title": "Q2 Growth PRD",
  "source_version": "v3"
}
```

`artifact_reviewed`：
```json
{
  "artifact_id": "uuid",
  "block_id": "risks",
  "decision": "accepted",
  "diff_summary": "新增 3 条风险条目，移除 1 条重复项"
}
```

`query_executed`：
```json
{
  "connector_id": "data_warehouse",
  "capability_id": "run_authorized_query",
  "query_template_id": "weekly_retention_v2",
  "parameters": { "week": "2026-W18", "segment": "new_users" },
  "row_count": 42,
  "material_id": "uuid"
}
```

> 审计日志区分两个层次：**用户可见审计**（展示在 Audit 页面的业务描述）和**开发诊断信息**（完整 payload，仅限内部日志或调试模式）。用户可见审计不暴露完整 SQL、内部 token 或敏感参数。

## 7. Risk Level

### 7.1 Low Risk

只读、局部生成、本地导出。

例子：

- 读取本地文件
- 查询数仓
- 生成 Artifact
- 导出 Markdown 到 Library

默认不需要 Sign-off，但需要可追踪。

### 7.2 Medium Risk

外部系统写入，但可逆或影响有限。

例子：

- 创建飞书文档
- 创建 Notion 页面
- 写入 Confluence 草稿
- 发送内部消息草稿

需要预览与用户确认。

### 7.3 High Risk

影响业务系统、客户、资金、公开发布或不可逆结果。

例子：

- 发布内容到外部平台
- 修改 CRM 状态
- 提交营销策略
- 下单 / 调仓
- 删除外部内容

MVP 不实现真实 high-risk 执行，只保留设计位。未来需要 dry-run、双重确认、更强审计和企业策略配置。

## 8. Policy

Policy 不应散落在各 Connector 的代码里。它应成为一等对象。

Policy 决定：

- 哪些 Capability 默认启用
- 哪些 Capability 禁止
- 哪些动作需要 Sign-off
- 哪些动作只允许某类 Workspace 使用
- 哪些动作必须写 Audit
- 是否允许自动执行
- 是否允许覆盖外部对象

MVP 默认策略：

```text
Read: allowed, audit optional
Watch: design only or disabled
Write: allowed with preview + sign-off
Execute: disabled or sign-off required
High risk: design only, no real execution
```

## 9. 用户侧 UX 心智

用户不应看到工具函数。用户应看到系统与能力。

示例：

```text
Connectors
- Data Warehouse
  - Read metrics: enabled
  - Run query: enabled
  - Write back: unsupported

- Feishu
  - Read docs: enabled
  - Create doc: enabled, sign-off required
  - Send message: disabled
```

当 Kevin 触发动作时，用户看到：

```text
Kevin wants to create a Feishu document

Source:
- Weekly Ops Review Artifact

Target:
- Feishu / Growth Team Folder

Capability:
- Feishu Create Doc

Risk:
- Medium

Preview:
- title
- outline
- content summary

[Approve] [Reject] [Edit]
```

## 10. MVP 最小体系

MVP 不追求全量 Connector 生态，但体系必须完整。

建议最小 Connector 组合：

### 10.1 Local Files Connector

Capabilities：

- read file
- materialize local file
- write to library

### 10.2 Data Warehouse Connector

Capabilities：

- list metrics
- run authorized query
- materialize query result

约束：

- read-only
- 基于权限范围查询
- 查询结果必须材料化

### 10.3 External Doc Connector

Capabilities：

- create external document
- optionally read destination metadata

约束：

- write requires preview + sign-off
- MVP 只做文档级单向投影

### 10.4 Output Connector / Local Export

Capabilities：

- export Markdown
- export HTML PPT
- write generated file to Library

## 11. Adapter 示例

### 11.1 旧系统导出 Excel

```text
Old ERP export.xlsx
-> File Adapter
-> Material
-> Artifact uses Material
```

### 11.2 数仓 MCP

```text
Data Warehouse MCP query
-> MCP Adapter
-> Data Warehouse Connector
-> run_authorized_query Capability
-> Query Result Material
```

### 11.3 飞书 API

```text
Feishu API
-> Feishu Adapter
-> Create Doc Capability
-> ActionRequest
-> Sign-off
-> Execute
-> Audit
```

## 12. MVP 验收标准

- 用户可以看到当前 Workspace 已连接哪些 Connector。
- 用户可以看到每个 Connector 暴露哪些 Capability。
- 用户可以区分 read / write / execute 的风险。
- 写入类 Capability 不会被模型直接执行，必须转成 ActionRequest。
- ActionRequest 执行前有预览。
- medium risk ActionRequest 需要用户确认。
- 执行结果进入 Audit。
- 旧系统可通过 File / Export Adapter 进入 Material Layer，不要求系统改造。

## 13. 非目标

MVP 不做：

- 全量企业系统 Connector 生态
- high risk 真实执行
- 企业级权限管理后台
- 复杂自动化编排器
- 旧系统深度改造
- 要求旧系统原生支持 Kevin 规范
