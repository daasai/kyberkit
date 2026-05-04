# Web Console 联动验收报告

时间: 2026-05-02  
范围: API 契约、后端读写、前端联动、最小冒烟

## 已完成项

- 契约冻结
  - 新增 `web-console-api.md`，统一 REST 成功/失败封装与 SSE 事件名。
- 后端联动
  - `src/console-server/server.ts` 增加 mutate 接口：
    - `POST /api/contracts/:id/{activate|pause|resume|revoke}`
    - `PATCH /api/preferences`
    - `DELETE /api/permits/:toolName`
  - 接口统一返回 `{ data }`，错误返回 `{ error }`。
  - SSE 增加事件广播：`contract.updated`、`preferences.updated`、`permit.revoked`、`audit.appended`、`session.updated`。
- 前端联动
  - `apiClient` 支持 mutate + 统一错误类型 `ApiError`。
  - 默认关闭静默 mock 回退，仅在 `VITE_WEB_ALLOW_MOCK_FALLBACK=true` 时启用。
  - 会话页接入 SSE 与动态 run summary。
  - 设置页按钮接入真实接口（合约动作、policy 更新、permit 撤销）。
  - 设置/会话页增加 SSE 连接状态与最近事件可观测信息。
- 冒烟与验证资产
  - 新增 API 冒烟脚本：`scripts/web-console-smoke.ts`
  - 新增命令：`bun run web:smoke:api`
  - 前端冒烟命令：`bun run web:smoke`
  - 新增 Playwright E2E 骨架：`web/tests/e2e/console.spec.ts`
  - 新增 E2E 命令：`bun run web:e2e`

## 本次执行结果

- `bun run web:smoke`：通过（typecheck + build）。
- `bun test`：通过（全仓 367 pass，4 skip，0 fail）。

## 剩余注意事项

- `web:smoke:api` 依赖 `web:api` 已运行（`http://localhost:8787`）。
- permit 撤销为破坏性动作，脚本默认只提示手动验证，不自动执行删除。
