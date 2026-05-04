# Web Console API Contract (3.0 P1-C)

状态: Draft  
范围: Web Console 前后端联调契约（REST + SSE）  
目标: 冻结字段语义，避免前后端漂移

## 1. 响应封装

- 成功:
  - `200/201/204` with `{ "data": <payload> }`
- 失败:
  - `4xx/5xx` with:
    - `error.code: string`
    - `error.message: string`
    - `error.retryable: boolean`
    - `error.details?: unknown`

## 2. REST 接口

- `GET /api/health`
  - data: `{ ok: true, service: "kyber-console-api" }`

- `GET /api/sessions`
  - data: `SessionThread[]`

- `GET /api/sessions/:sessionId/messages`
  - data: `SessionMessage[]`

- `GET /api/artifacts/:artifactId`
  - data: `{ mimeType, name, content }`

- `GET /api/contracts`
  - data: `TaskPermissionContract[]`

- `POST /api/contracts/:contractId/activate`
- `POST /api/contracts/:contractId/pause`
- `POST /api/contracts/:contractId/resume`
- `POST /api/contracts/:contractId/revoke`
  - data: updated `TaskPermissionContract`

- `GET /api/evolution`
  - data: evolution row list

- `GET /api/memory`
  - data: memory row list

- `GET /api/skills`
  - data: skill meta list

- `GET /api/audit`
  - data: audit row list

- `GET /api/growth/summary`
  - data: `{ memories, skills, permits }`

- `GET /api/growth/7d`
  - data: `number[]`

- `GET /api/permits`
  - data: permit list

- `DELETE /api/permits/:toolName`
  - data: `{ toolName }`

- `GET /api/preferences`
  - data: `{ policyPack, workspaceRoot }`

- `PATCH /api/preferences`
  - body: `{ policyPack: "development" | "balanced" | "conservative" }`
  - data: `{ policyPack, workspaceRoot }`

## 3. SSE 事件

- stream: `GET /api/events/stream`
- event names:
  - `connected`
  - `heartbeat`
  - `contract.updated`
  - `preferences.updated`
  - `permit.revoked`
  - `audit.appended`
  - `session.updated`

推荐 payload 字段:
- `ts: number` (ms epoch)
- `contract.updated`: `{ ts, contractId, status }`
- `preferences.updated`: `{ ts, policyPack }`
- `permit.revoked`: `{ ts, toolName }`
- `audit.appended`: `{ ts, contractId?, action? }`
- `session.updated`: `{ ts, reason }`

## 4. 字段约定

- 所有时间字段统一毫秒时间戳（`number`）。
- `policyPack` 仅允许 `development|balanced|conservative`。
- `contract.status` 仅允许 `draft|active|paused|revoked|expired|completed`。
- `artifact.mimeType` 当前仅保证 `text/markdown|text/html|text/csv`。

## 5. 验证清单

- 前端对所有非 2xx 响应按 `error` 结构处理，不依赖字符串匹配。
- 联调环境默认关闭静默 mock 回退，接口失败需显式暴露错误态。
- SSE 断开时 UI 明确显示连接状态，恢复后可继续收到事件。
