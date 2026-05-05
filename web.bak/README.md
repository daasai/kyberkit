# KyberKit Web Console (UI Mock)

本目录是 Web Console 的前端 UI 实现（mock 数据版），用于兑现以下文档：

- `docs/specs/3.0/web-console-ui.md`
- `docs/specs/3.0/web-console-ui-views.md`
- `docs/specs/3.0/web-console-ui-system.md`

## 运行

在仓库根目录：

```bash
bun run web:dev
```

构建检查：

```bash
bun run web:build
```

## 已实现范围

- 三栏壳：侧栏（高频入口 + 历史）/ 中栏会话流 / 右栏预览或运行上下文
- 主工作区：`/c`、`/c/:sessionId`
  - `run_summary` 条
  - 消息流 8 类渲染（user / assistant / tool / approval / artifact / system）
  - 工具行展开显示审计字段（`effectivePermission` / `policyDecision`）
  - 制品预览（markdown / html / csv）
- 首次概览 Modal（localStorage dismiss + 设置页手动再次打开）
- 设置 6 子页：
  - `/settings/contracts`
  - `/settings/evolution`
  - `/settings/memory`
  - `/settings/skills`
  - `/settings/audit`
  - `/settings/preferences`
- 横切能力：
  - 统一状态包装（loading / empty / error / partial）
  - 快捷键（`/`, `g s`, `g c`, `?`）
  - A11y 基础（`role=log`, `role=dialog`, `aria-live`, focus trap）
  - zh-CN 术语统一

## 说明

- 已新增后端 API 骨架：`src/console-server/server.ts`（REST + SSE）。
- 前端数据层通过 `src/lib/apiClient.ts` 走 `/api/*`。
- 默认 fail-fast：`VITE_WEB_FAIL_FAST=true`（推荐联调/验收保持开启）。
- 如需本地演示 mock 回退，可在 `web/.env.local` 设置：
  - `VITE_WEB_FAIL_FAST=false`
  - `VITE_WEB_ALLOW_MOCK_FALLBACK=true`
- 对话支持发送/取消、审批动作（Approve/Deny）与事件回流刷新。

## 联调方式

在仓库根目录开两个终端：

```bash
# 终端 1：启动后端 API
bun run web:api

# 终端 2：启动前端
bun run web:dev
```

其中 `web/vite.config.ts` 默认将 `/api` 代理到 `http://localhost:8787`，也可通过 `VITE_API_PROXY_TARGET` 覆盖。

## 联调验证

在根目录执行：

```bash
bun run web:smoke
```

API 冒烟（需先启动 `bun run web:api`）：

```bash
bun run web:smoke:api
```

E2E（会自动拉起 API 与前端）：

```bash
bun run web:e2e
```

首次安装浏览器：

```bash
bun run web:e2e:install
```

手工验证最小路径：

1. 打开 `/c/:sessionId` 查看 `run_summary`、tool audit、artifact 预览。
2. 打开 `/settings/contracts` 执行暂停/恢复/撤销并观察列表更新。
3. 打开 `/settings/preferences` 切换 policy 并撤销 permit。
4. 观察页面顶部 SSE 状态与最近事件时间是否持续更新。
