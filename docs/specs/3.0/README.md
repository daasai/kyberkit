# KyberKit 3.0 Specs

状态: Draft  
范围: 3.0 P0 首切片（可信执行底座）

---

## 1. 目标

本目录是 `KyberKit3.0-product-strategy.md` 的执行规格拆分，面向工程落地而非产品叙事。

3.0 首切片只实现 P0 foundation：

- Task Permission Contract（含三类合约 schema）
- Tool Permission Gate 的策略包决策（开发/平衡/保守）
- 防注入与扩权校验（不可变 deny-list、禁止运行时自扩权）
- 审计字段与可追溯事件

---

## 2. 文档清单

- `task-permission-contract.md`  
  定义合约结构、状态机、有效权限计算和扩权规则。
- `policy-and-permission-gate.md`  
  定义策略包、风险等级与 Tool Permission Gate 的决策流程。
- `audit-and-outputguard.md`  
  定义 3.0 最小审计事实字段与 OutputGuard 的首切片验收。

---

## 3. 与现有代码的映射

- Runtime 与 session 装配: `src/runtime/KyberRuntime.ts`, `src/runtime/AgentSession.ts`
- 工具执行收口: `src/agent/middleware/ToolDispatcherMiddleware.ts`
- 风险分级基础: `src/permission/PermissionPolicy.ts`
- 事件类型: `src/types/events.ts`
- 轨迹记录: `src/observability/TrajectoryRecorder.ts`

---

## 4. 分阶段边界

本目录明确以下边界，防止首切片过度扩张：

- In scope（本次实现）
  - Ad-hoc 合约运行时承载
  - Recurring/Triggered 合约 schema 预埋（不含调度执行）
  - 策略包与 deny-list 在 Gate 前置生效
  - 审计字段可入事件与轨迹
- Out of scope（后续切片）
  - Web Console UI
  - 企业微信/飞书 Gateway
  - Cron 与事件监听调度器
  - 真实业务 Connector（支付 MCP、日志、行为）

---

## 5. Done Definition（P0）

P0 首切片完成需同时满足：

1. 工具调用在执行前必须能拿到 `effectivePermission` 决策。
2. 超出合约声明范围的工具调用被拒绝，并有明确原因。
3. 默认 deny-list 命中不可被 prompt 或工具回包绕过。
4. L2/L3 风险调用在策略要求下必须显式审批（或被拒绝）。
5. 审计事件包含 `taskId`、`actorUserId`、`policyDecision`、`approvalStatus`、`effectivePermission`。
