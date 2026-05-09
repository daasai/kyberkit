# External Projection v1 设计

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`

## 1. 定义

External Projection 是将 Kevin Native Artifact 制作为外部协作文档的动作。

它不是同步系统，也不是外部文档编辑器。MVP 中它只解决一个问题：

```text
把 Kevin 内已经生成、审查、确认过的 Artifact，
制作成飞书 / Notion / Confluence 等平台上的协作文档。
```

## 2. 产品原则

### 2.1 Kevin 是源对象

Kevin Native Artifact 是语义源对象。外部文档只是协作投影。

### 2.2 文档级单向投影

MVP 只做完整文档级投影，不做 block 级同步。

### 2.3 投影必须是 ActionRequest

创建外部文档是一个外部写入动作，必须进入 ActionRequest 流程。

### 2.4 默认不覆盖

默认新建外部文档。若用户要覆盖已有外部文档，必须在 Action Panel 中明确确认。

## 3. 首个平台选择

### 3.1 决策：飞书优先

**结论：MVP External Projection 只做飞书，Notion / Confluence 进 Phase 2。**

选择依据：

1. **目标场景**：Kevin 2.0 MVP 聚焦中国企业知识工作者，飞书是主要知识协作载体。
2. **API 成熟度**：飞书 OpenAPI 支持创建文档、获取 Space/文件夹元数据，Adapter 实现可控。
3. **验证逻辑**：飞书验证成功后，Connector / Capability / ActionRequest 体系稳定，Notion / Confluence 复用同一框架接入。

### 3.2 Feishu Connector MVP 定义

Connector：`feishu`，Adapter Level 3（Governed Write）

**Capabilities：**

| Capability ID | 动作 | Kind | Risk | Sign-off |
|---|---|---|---|---|
| `feishu.read_space_metadata` | 读取可用 Space / 文件夹列表 | read | low | 否 |
| `feishu.list_folder_docs` | 列出文件夹内文档 | read | low | 否 |
| `feishu.create_doc` | 新建飞书文档 | write | medium | ✅ 需要 |
| `feishu.update_doc` | 覆盖已有飞书文档 | write | high | ✅ 需要显式确认 |

**MVP 只实现 `create_doc`，`update_doc` 进 Phase 2。**

### 3.3 文档标题映射规则

- 默认标题：`{Artifact title} {YYYY-MM-DD}`
- 用户在 Action Panel 中可修改标题，不能为空。
- 写入成功后标题不可通过 Kevin 侧修改（飞书文档由用户在飞书侧管理）。

### 3.4 目录映射规则

- 用户在 Action Panel 中手动选择目标 Space + 文件夹（不自动推断）。
- MVP 不支持自动创建文件夹，只支持写入已有目录。
- 选择后保存为 Workspace 的 `default_projection_target`，下次预填。

### 3.5 MVP 范围

**In Scope：**

- 从 Artifact 触发 `create_external_projection`（飞书）
- 读取目标 Space / 文件夹元数据，供用户选择
- 生成投影预览（标题 + 大纲 + 格式降级提示）
- 用户确认写入
- 写入成功后保存外部链接至 Artifact Inspector
- 写入动作进入 Audit

**Out of Scope（MVP）：**

- block 级同步
- 外部评论回流
- 外部修改自动回流
- 自动 merge
- 实时同步
- 多平台广播
- `update_doc` 覆盖写入（Phase 2）
- Notion / Confluence（Phase 2）

## 4. 用户流程

```text
Artifact Focus
-> Actions
-> Project to External Document
-> Select Target Platform
-> Projection Preview
-> Sign-off / Confirm
-> Write
-> External Link Saved
-> Audit Recorded
```

## 5. Action Panel 信息结构

External Projection 的 Action Panel 必须展示：

### 5.1 Source

- Artifact title
- Artifact type
- Artifact state
- Source version
- Last reviewed time

### 5.2 Target

- Platform
- Workspace / Space / Folder
- Document title
- Create new / overwrite existing

### 5.3 Projection Preview

- 即将写入的文档标题
- 文档大纲
- 格式降级提示（如不支持的 block 类型）
- 外部平台限制提示

### 5.4 Governance

- Connector
- Capability
- Risk level
- Sign-off requirement
- Audit destination

## 6. 写入策略

默认策略：

- 默认新建文档。
- 默认标题使用 Artifact title。
- 默认附带 Kevin 回链。
- 默认在 Artifact Inspector 中保存 external link。

再次投影策略：

1. 新建副本（默认）
2. 生成新版本文档
3. 覆盖已有文档（需要显式确认）

MVP 推荐只实现 1 和 3，2 可作为后续增强。

## 7. 回链与状态

写入成功后，Kevin 需要保存：

- `projection_id`
- `artifact_id`
- `platform`
- `external_url`
- `external_document_id`
- `created_at`
- `created_by`
- `action_id`

Artifact Inspector 中显示：

```text
External Projections
- Feishu Doc: Q2 PRD Draft
  created: 2026-05-09 16:00
  action: approved
  [Open] [Copy link]
```

## 8. 失败处理

MVP 定义以下失败类型（飞书场景）：

### 8.1 auth_failed

含义：飞书 OAuth 授权失效或 Token 过期。  
处理：保留当前 Action Panel 上下文（不重置），弹出"重新连接飞书"引导，授权成功后自动回到当前 Action Panel。

### 8.2 target_invalid

含义：选择的 Space 或文件夹不可访问（权限变更、文件夹被删除）。  
处理：提示"目标文件夹不可访问，请重新选择"，清空目录选择但保留其他填写内容，让用户重选。

### 8.3 write_failed

含义：飞书 API 写入失败（网络超时、接口错误、内容超限）。  
处理：展示错误详情，提供"重试"和"取消"选项，不自动重试。写入失败不写入 Audit 成功记录，但保留 `action_requested` 和 `action_failed` 的 Audit 条目。

### 8.4 write_conflict（Phase 2）

含义：用户选择覆盖目标文档，但目标已在飞书侧被修改。  
处理：Phase 2 实现。MVP 不支持覆盖写入，此场景不触发。

## 9. 风险等级

建议：

- 写入本地 Library：low
- 新建外部协作文档：medium
- 覆盖外部文档：medium/high（取决于平台与企业策略）

MVP 可统一按 medium 处理外部写入，要求确认。

## 10. 文档级回流评估

文档级回流不进入 MVP，但可作为 Phase 2。

若未来实现，最小方案是：

```text
Pull External Snapshot
-> Compare metadata/hash
-> Mark external_changed
-> User chooses:
   - Keep Kevin source
   - Import as new Artifact version
   - Create new Artifact from external document
```

不建议第一版实现自动 merge 或 block diff。

## 11. 验收标准

- 用户可以从 Artifact Focus 触发飞书投影（首个平台）。
- Action Panel 能读取用户飞书 Space / 文件夹列表供选择。
- 写入前可以看到目标文件夹、文档标题预览、大纲、风险等级（medium）。
- 用户确认后写入飞书文档，写入成功后 Artifact Inspector 显示飞书文档链接。
- 写入动作完整进入 Audit（`action_requested` + `action_approved` + `projection_created`）。
- 飞书授权失败时保留 Action Panel 上下文，用户重新授权后可继续。
- 目标文件夹不可用时提示用户重选，不重置其他填写内容。
- Workspace 保存 `default_projection_target`，下次投影时预填。

### 11.1 Phase 2 方向（不进 MVP）

- Notion / Confluence Connector 复用同一框架。
- `update_doc` 覆盖写入，支持"再次投影"三种策略。
- 文档级回流（外部文档 hash 变更检测）。
