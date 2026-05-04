# 制品发现与会话升级（Spec）

本文档为 Kevin Web 制品体验升级的产品与技术规格，与实现里程碑对齐。实现状态见仓库内代码与后续 PR 说明。

## 1. 背景与目标

**痛点**：长对话中难以判断「本轮是否生成制品、去哪看、历史有哪些」；认知过度依赖中间画布「当前所见」，与具体 assistant 轮次弱绑定。

**目标**：制品与**某一轮 assistant 回复**同位锚定展示；中间 Milkdown 仍为**主编辑区**；右侧承担**发现、列表、跳转**。

## 2. 信息架构

- **制品条（Artifact strip）**：挂在产生制品的 assistant 气泡下方，展示状态与「查看」入口。
- **右侧「制品」区**：本会话内按时间列出条目（时间 + 摘要 + 打开画布），默认展开以降低点击次数。
- **中间画布**：`loadArtifact` 加载内容；「查看」与列表项均触发聚焦中间区域。

## 3. 分阶段能力

### P0（当前迭代目标）

| 能力 | 说明 |
|------|------|
| 制品条 | 文案示例：「主画布已更新」/ 流式中「正在更新…」；**查看** 触发 `loadArtifact` + 滚动/高亮中间区。 |
| SSE 元数据 | `artifact_start` 含 `artifact_id`；`artifact_end` 含 `artifact_id`、`summary`（首行 H1 或前 30 字，空则「未命名制品」）。 |
| 右侧制品列表 | 会话内内存队列：`artifact_end` 追加；点击打开画布。切换会话按 session 分桶；从 `GET /sessions/:id` 若有 `artifactContent` 可水合为一条以便刷新后仍有一条记录。 |

### P1（后续）

- 会话级制品时间线：`GET /sessions/:id/artifacts`、多版本 DB（`artifact_revisions`），刷新后仍区分多轮。
- 深链：`?session=&artifact=` 与启动加载顺序（先 session 再 rev，避免闪烁）。

### P2（后续）

- 制品条导出：复制 Markdown、下载 `.md`、桌面 Tauri「在文件夹中显示」。

## 4. SSE 协议增量

向后兼容：旧客户端忽略未知字段。

| 事件 | 字段 |
|------|------|
| `artifact_start` | `sessionId`, `artifact_id` |
| `artifact_end` | `sessionId`, `artifact_id`, `summary` |

## 5. 验收

- 新用户完成一轮带 `<artifact>` 的对话后，在右侧 **1 次点击** 内能确认「有制品」并回到画布对应内容（制品条「查看」或列表项点击）。
- 同一会话多轮生成：列表中出现两条可区分记录（时间与摘要）；**刷新后仍区分**依赖 P1。
- 制品条挂在对应轮次气泡下，不依赖用户当前是否正在看中间画布。

## 6. 风险说明

- P0 列表主要为内存 + 单次水合：多轮历史在刷新后仍可能合并为「仅最新一条」直至 P1 落库多版本。

## 7. 相关代码路径

- Sidecar：`src-sidecar/index.ts`、`src-sidecar/ArtifactParser.ts`、`src-sidecar/artifactSummary.ts`
- 前端：`app/src/contexts/ArtifactContext.tsx`、`app/src/components/layout/RightPanel.tsx`、`app/src/components/layout/CenterPanel.tsx`、`app/src/components/layout/AppShell.tsx`、`app/src/lib/artifactSummary.ts`、`app/src/lib/focusCenter.ts`

## 8. 实现记录（P0）

- SSE：`artifact_start` 携带 `artifact_id`；`artifact_end` 携带 `artifact_id` + `summary`（Sidecar 从正文截取）。
- 对话气泡下展示制品条（流式 / 已完成 +「查看」）；「查看」与右侧列表均触发 `loadArtifact` + `requestFocusKevinCenter()`（中间区 outline 高亮 + 锚点滚动）。
- 右侧「制品」折叠区默认展开，按会话维护内存列表；`GET /sessions/:id` 返回的 `artifactContent` 水合为 `persisted-<sessionId>` 条目。
