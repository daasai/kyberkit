# Kevin v1.5 — 异步任务生命周期 & SSE 契约

> **来源**：PRD §11、§13  
> **读者**：Sidecar、前端多窗口

## 1. 状态机

```
        ┌── queued ──► running ──┬──► completed
        │              │         │
        │              │         ├──► awaiting-signoff ──► completed
        │              │         │         │
        │              │         │         └──► cancelled
        │              │         │
        │              └─────────┴──► failed
```

| 状态 | 含义 | 灵动岛 |
|------|------|--------|
| `queued` | 等待执行槽 | 不显示 |
| `running` | 执行中 | 进度环 + 任务名 |
| `awaiting-signoff` | 待 HITL | 红色脉冲 |
| `completed` | 完成 | 3s 摘要 |
| `failed` | 失败 | 错误摘要 |
| `cancelled` | 用户取消 | 弱提示 / 仅审计 |

## 2. 触发方式（v1.5）

| 类型 | 支持 |
|------|------|
| Manual | 是 |
| `cron:` in Skill frontmatter | 是（Sidecar 内调度） |
| Sensor event | v2.0 |

## 3. Cron 契约

- 表达式：`cron:` 前缀 + 标准 5 字段（分 时 日 月 周）。
- 引擎：进程内调度（如 `node-cron` / Bun timer + `CronParser`）；命中后创建任务，`space_id` = Skill 所属 Space。

## 4. HTTP API（规划）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/tasks` | 创建任务 `{ space_id, skill?, payload?, trigger }` |
| GET | `/tasks?space_id=` | 列表 |
| GET | `/tasks/:id` | 详情 |
| DELETE | `/tasks/:id` | 取消（若可取消） |

持久化：SQLite 表 `tasks`（id, space_id, state, skill_name, created_at, …）。

## 5. SSE 事件

### 5.1 命名空间与隔离

- **所有任务 / 进度 / 签批相关事件**必须带 **`space_id`**。
- 前端窗口仅订阅 **当前窗口** `space_id` 的流（查询参数或首包握手）。

### 5.2 推荐端点

- `GET /events?space_id=<uuid>` — `text/event-stream`，复用或独立于会话 SSE。
- 事件类型示例：

```json
{ "type": "task_progress", "space_id": "...", "task_id": "...", "state": "running", "progress": 0.42, "message": "..." }
{ "type": "task_completed", "space_id": "...", "task_id": "...", "summary": "..." }
{ "type": "signoff_required", "space_id": "...", "task_id": "...", "actuator_id": "artifact.feishu-doc.write" }
```

### 5.3 配置广播（多窗口）

- `POST /config` 成功后 **不限 space**：向 **所有** SSE 连接广播 `{ type: "config_changed", ... }`（或引导客户端调用 `GET /config`）。

## 6. 跨 Space 归属（PRD §11.5）

- 任务只属于创建它的 Space。
- Space B 窗口 **不得** 收到 Space A 的 `task_*` / `signoff_*` 事件。

## 7. 验收检查清单

- [ ] 双开两窗口，仅对应窗口收到任务进度。
- [ ] Sidecar 重启后任务状态可从 DB 恢复或标记 failed。
- [ ] Cron 触发任务带正确 `space_id`。
