# Audit And OutputGuard (3.0 P0)

状态: Draft  
范围: P0 最小可信闭环

---

## 1. 审计目标

3.0 P0 不追求完整审计平台，但必须确保每次工具调用可追溯：

- 代表谁执行
- 基于什么合约执行
- 为什么被允许/拒绝
- 是否经过审批

---

## 2. 3.0 最小审计字段

每次工具调用至少记录以下字段：

- `actorUserId`
- `agentSessionId`
- `taskId`
- `toolName`
- `requestedPermission`
- `effectivePermission`
- `approvalStatus`
- `policyDecision`
- `contractType`
- `policyPack`

这些字段作为 4.0 Audit Console 的事实表前置约束。

---

## 3. 事件与落库策略

P0 使用现有事件总线与 trajectory 侧车记录能力：

- 在工具调用开始时记录决策上下文
- 在工具调用结束时记录执行结果（成功/失败/耗时）
- 对于拒绝执行也必须记录一条完整决策事件

内容脱敏兼容要求：

- 当 `includeContent=false` 时保留上述结构化字段
- 可选正文（tool input/result preview）按现有脱敏策略裁剪

---

## 4. OutputGuard（P0 最小版）

P0 OutputGuard 的目标是阻止不可信输出直接进入自动行动链路，而不是实现完整内容安全平台。

最小能力：

1. 对高风险工具调用前后的关键输出进行规则校验（如权限冲突、未审批写动作）。
2. 命中阻断条件时返回可读 remediation，禁止继续执行该调用。
3. 阻断结果同样进入审计字段，保证可回放。

---

## 5. 验收标准

以下全部满足才算 P0 完成：

1. 至少有一个测试覆盖“未声明工具 -> 拒绝 + 审计字段齐全”。
2. 至少有一个测试覆盖“deny-list 命中 -> 拒绝 + 审计字段齐全”。
3. 至少有一个测试覆盖“L2/L3 需要审批 -> 审批通过后执行”。
4. 至少有一个测试覆盖“审批拒绝 -> 不执行工具但保留审计记录”。
