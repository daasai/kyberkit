# 三种合约调度器 (3.0 P1)

状态: Draft  
范围: P1 核心 — ContractRegistry + RecurringScheduler + TriggeredScheduler

---

## 1. 目标

让 Agent 不依赖用户手动触发，按预定节奏或事件条件自主运行。三种合约共享同一套 schema（P0 已定义），P1 在此之上实现运行时调度层。

---

## 2. 组件架构

```
ContractRegistry          // 合约生命周期状态机 + 持久化
  ├── activate(contract)  // draft → active
  ├── pause(id, reason)   // active → paused
  ├── revoke(id)          // any → revoked
  └── expire(id)          // active → expired (自动到期)

RecurringScheduler        // cron 轮询调度器
  ├── CronParser          //   5-field cron 解析器
  ├── DriftDetector       //   漂移检测（token + 失败率）
  └── tick every 60s      //   遍历 active recurring 合约

TriggeredScheduler        // 事件驱动调度器
  ├── 订阅 external.event //   来自 Connector 的外部事件
  ├── pattern matching    //   trigger.match 模式匹配
  └── backoff throttle    //   trigger.backoff 节流

/contract command         // 用户操作入口
  ├── list                //   列出所有合约
  ├── activate <draftId>  //   从草稿激活
  ├── pause <contractId>  //   暂停
  └── revoke <contractId> //   撤销
```

---

## 3. CronParser

支持标准 5-field cron 语法（`minute hour day month weekday`）：

| 语法 | 示例 | 含义 |
|---|---|---|
| `*` | `* * * * *` | 每分钟 |
| 数值 | `0 1 * * *` | 每天 1:00 |
| 范围 | `0 9 * * 1-5` | 工作日 9:00 |
| 步长 | `*/30 * * * *` | 每 30 分钟 |
| 列表 | `0 9,18 * * *` | 9:00 和 18:00 |

`nextRunAfter(cron, after: Date): Date`：暴力搜索下一个匹配时间（逐分钟，上限 1 年）。

---

## 4. DriftDetector

监控两个漂移维度，对应 `ScopeDriftLimit` schema：

| 维度 | 字段 | 逻辑 |
|---|---|---|
| Token 日预算 | `dailyTokenBudget` | 当日 token 累计超限 → 发 `contract.drift.detected` + 暂停 |
| 失败连续次数 | `failureStreak` | 连续 N 次失败 → 暂停 |

每次合约执行后调用 `recordRun(contractId, { success, tokensUsed })`，检查是否超阈值后由 `RecurringScheduler` 决定是否暂停。

---

## 5. ContractRegistry

### 状态机

```
draft → active → paused → active (resume)
                 ↓
              revoked / expired
```

### 持久化

合约状态保存到 `<userRoot>/.kyberkit/contracts/registry.json`（JSON array of TaskPermissionContract）。进程启动时自动加载，每次状态变更后写入。

### 事件

| 事件 | 触发条件 |
|---|---|
| `contract.activated` | draft/paused → active |
| `contract.paused` | active → paused（含 reason） |
| `contract.revoked` | → revoked |
| `contract.expired` | → expired（到期自动） |

---

## 6. RecurringScheduler

### 执行流程（每分钟 tick）

1. 获取所有 `status=active` 且 `contractType=recurring` 的合约
2. 对每个合约：检查当前时间是否匹配 `cron.matches(now)`
3. 若匹配：
   a. 检查漂移（`DriftDetector.checkDrift()`）
   b. 若漂移超限：暂停合约 + 发 `contract.drift.detected`
   c. 否则：发 `contract.run.due` 事件
4. 合约有 `expires_at` 且已过期 → 调用 `ContractRegistry.expire()`

### 去重保障

每个合约同一分钟内只触发一次（用 `lastFiredAt` 记录）。

---

## 7. TriggeredScheduler

### 触发流程

1. 订阅 `external.event` 总线事件（P1D Connector 推送来源）
2. 对每个 `status=active && contractType=triggered` 合约：
   - 检查 `trigger.source` 是否匹配事件 `source` 字段
   - 检查 `trigger.match` 是否在事件 payload JSON 中出现
3. 若匹配：
   - 检查 backoff（上次触发时间 + backoff 时长 < now → 跳过）
   - 发 `contract.run.due` 事件（含 `triggeredBy: 'event'`）

---

## 8. `contract.run.due` 事件

```ts
{
  contractId: string;
  contractType: 'recurring' | 'triggered';
  triggeredBy: 'schedule' | 'event';
  eventPayload?: unknown;  // TriggeredScheduler 时附带原始事件数据
  scheduledAt: number;     // 预期触发时间
}
```

此事件由 WorkspaceAgent（P0.5B，待实现）或其他消费者执行实际 AgentSession 调用。

---

## 9. `external.event` 事件（新增到 KyberEvents）

```ts
'external.event': {
  source: string;    // e.g. "logs.alert", "wecom.mention"
  payload: unknown;  // raw event data from Connector
  receivedAt: number;
}
```

---

## 10. `/contract` 命令

```
/contract list                    # 列出所有合约（按 status 分组）
/contract activate <draftId>      # 从草稿激活（读 ContractDraftStore）
/contract pause <contractId>      # 暂停（保留状态可恢复）
/contract revoke <contractId>     # 撤销（不可恢复）
```

---

## 11. 验收标准

1. `RecurringScheduler` tick 时，cron 匹配的合约发出 `contract.run.due`
2. cron 不匹配时不发事件
3. `DriftDetector` 连续 3 次失败 → `checkDrift` 返回 drifted=true
4. `DriftDetector` 当日 token 超限 → drifted=true
5. `TriggeredScheduler` 收到匹配 `external.event` → 发 `contract.run.due`
6. backoff 窗口内第二次事件 → 不重复触发
7. `ContractRegistry` 状态转换正确持久化
