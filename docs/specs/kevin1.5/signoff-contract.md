# Kevin v1.5 — HITL Sign-off & 审计日志契约

> **来源**：PRD §10、§3.2.1  
> **读者**：Actuator 层、Sidecar、前端

## 1. Actuator 注册

每个 Actuator 静态注册：

| 字段 | 说明 |
|------|------|
| `id` | 如 `artifact.feishu-doc.write` |
| `risk_level` | `low` \| `medium` \| `high` |
| `requires_signoff` | `medium` 对外部写入通常为 true |

### v1.5 白名单

| id | risk | Sign-off |
|----|------|----------|
| `artifact.markdown.generate` | low | 否 |
| `artifact.html-ppt.generate` | low | 否 |
| `artifact.xls.generate` | low | 否 |
| `artifact.feishu-doc.write` | medium | **是** |

`high`：v1.5 **拒载**或占位，不实现双重确认。

## 2. 执行链路

1. **low**：直接执行 → 审计（可选简要日志）。
2. **medium**：暂停 → UI Sign-off 卡片 → 用户确认 / 编辑后再执行 → 执行 → 审计。
3. **60s 未操作**：任务 → `awaiting-signoff`，进入待签批队列；通知中心置顶。

## 3. UI 三处同步（PRD §10.2）

同一 `task_id` 的待签批必须在以下三处同时可感知：

1. **右侧对话面板**：内联完整 Sign-off 卡片（Diff + 按钮）。
2. **顶部灵动岛**：红色脉冲 + 文案如「N 项任务等待签批」；点击展开列表。
3. **左侧历史会话**：对应会话行尾 **红色脉冲圆点**（`session_id` 关联）。

## 4. Sign-off REST（规划）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/signoff/:taskId/approve` | 确认执行 |
| POST | `/signoff/:taskId/reject` | 取消 |
| POST | `/signoff/:taskId/edit` | Body 含修订后内容再执行 |

执行完成后任务 → `completed` 或 `failed`。

## 5. 审计日志

- **路径**：`~/.kyberkit/users/default/audit/YYYY-MM-DD.jsonl`
- **写入**：所有 **medium** 与 **high** 调用；无论签批通过与否。
- **建议字段**（每行 JSON）：

```json
{
  "ts": "ISO8601",
  "userId": "default",
  "spaceId": "...",
  "sessionId": "...",
  "taskId": "...",
  "skillName": "...",
  "actuatorId": "artifact.feishu-doc.write",
  "riskLevel": "medium",
  "targetSummary": "飞书文档标题或 URL",
  "decision": "approved|rejected|timeout|pending",
  "signoffLatencyMs": 1234
}
```

## 6. 验收检查清单

- [ ] medium 写入未确认前不入库。
- [ ] 超时进入 `awaiting-signoff` 且通知首位。
- [ ] 审计文件按日滚动，JSONL 可追加。
