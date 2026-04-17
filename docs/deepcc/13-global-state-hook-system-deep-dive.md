# DeepCC-13: 全局状态与 Hook 系统深度逆向工程

> 逆向目标:
> - `src/bootstrap/state.ts` (1759行) — 全局单例状态 (Session 核心)
> - `src/state/AppState.tsx` — React 层 AppState (UI 状态)
> - `src/utils/hooks/postSamplingHooks.ts` (71行) — Post-Sampling Hook 注册表
> - `src/utils/hooks/hookEvents.ts` (193行) — Hook 事件广播系统
> - `src/utils/hooks/AsyncHookRegistry.ts` (310行) — 异步 Hook 生命周期管理
> - `src/hooks/` — 权限、工具、UI 层 Hook

---

## 1. 双层状态架构

```
┌──────────────────────────────────────────────────────────────────┐
│                   Claude-Code 状态体系                            │
│                                                                  │
│  Layer 1: Bootstrap State (bootstrap/state.ts)                   │
│    ├─ 类型: 模块级单例 const STATE: State                         │
│    ├─ 访问: 纯函数 getter/setter (无 React 依赖)                 │
│    ├─ 作用域: 进程生命周期                                        │
│    ├─ 约束: DAG 叶节点 — 不导入 src/ 下的非 bootstrap 模块        │
│    └─ 内容: Session ID, 成本, 模型, 遥测, 缓存 Latch 等          │
│                                                                  │
│  Layer 2: AppState (state/AppState.tsx)                          │
│    ├─ 类型: React useState / useReducer 管理                     │
│    ├─ 访问: setAppState(prev => next)                            │
│    ├─ 作用域: Ink render tree                                    │
│    ├─ 约束: React 一致性 — updater 中无副作用                     │
│    └─ 内容: tasks, messages, foregroundedTaskId, UI 状态          │
└──────────────────────────────────────────────────────────────────┘

关键隔离:
  Bootstrap State 是 import DAG 的叶节点
  → 所有模块都可安全导入
  → 避免循环依赖
  
  AppState 是 React 上下文感知的
  → 仅 Ink 组件树内可用
  → Task framework 通过 setAppState 注入
```

---

## 2. Bootstrap State 深度分析 (state.ts)

### 2.1 State 类型结构 (~100 字段)

```
State 字段分类:

┌─ 身份 & 路径 ─────────────────────────────────┐
│ originalCwd, projectRoot, cwd                 │
│ sessionId: SessionId (UUID)                   │
│ parentSessionId (session 血统追踪)             │
│ sessionProjectDir (transcript 所在目录)        │
└───────────────────────────────────────────────┘

┌─ 成本 & 计量 ─────────────────────────────────┐
│ totalCostUSD, totalAPIDuration                │
│ totalAPIDurationWithoutRetries                │
│ totalToolDuration, totalLinesAdded/Removed    │
│ modelUsage: { [model]: ModelUsage }           │
│ turnHookDurationMs, turnToolDurationMs        │
│ turnToolCount, turnHookCount                  │
└───────────────────────────────────────────────┘

┌─ 模型配置 ────────────────────────────────────┐
│ mainLoopModelOverride, initialMainLoopModel   │
│ modelStrings                                  │
└───────────────────────────────────────────────┘

┌─ 遥测 & 可观测 ──────────────────────────────┐
│ meter, sessionCounter, locCounter, prCounter  │
│ commitCounter, costCounter, tokenCounter      │
│ codeEditToolDecisionCounter, activeTimeCounter│
│ loggerProvider, eventLogger, meterProvider     │
│ tracerProvider, statsStore                     │
│ inMemoryErrorLog, slowOperations              │
└───────────────────────────────────────────────┘

┌─ 缓存 Latch (Sticky-On 模式) ───────────────┐
│ afkModeHeaderLatched                         │
│ fastModeHeaderLatched                        │
│ cacheEditingHeaderLatched                    │
│ thinkingClearLatched                         │
│ promptCache1hEligible                        │
│                                              │
│ 语义: 一旦激活, 整个 Session 保持激活        │
│ 原因: 防止 Prompt Cache 被中途切换破坏        │
└──────────────────────────────────────────────┘

┌─ Session 控制 ────────────────────────────────┐
│ isInteractive, isRemoteMode                   │
│ clientType ('cli' | 'sdk' | ...)              │
│ sessionBypassPermissionsMode                  │
│ sessionTrustAccepted                          │
│ sessionPersistenceDisabled                    │
│ pendingPostCompaction                         │
│ lastMainRequestId, lastApiCompletionTimestamp  │
└───────────────────────────────────────────────┘

┌─ Hook & Plugin ───────────────────────────────┐
│ registeredHooks: Partial<Record<HookEvent, Matcher[]>> │
│ inlinePlugins: string[]                       │
│ allowedChannels: ChannelEntry[]               │
│ invokedSkills: Map<string, SkillInfo>         │
└───────────────────────────────────────────────┘
```

### 2.2 Sticky-On Latch 模式

```
问题: 
  Prompt Cache 的 key 包括 beta headers
  中途切换 beta header → 破坏已有 Prompt Cache (~50-70K tokens)

解决方案: Latch 模式
  afkModeHeaderLatched: null → true (首次激活 auto mode)
  → 此后 Session 内始终发送该 header
  → 即使用户 Shift+Tab 切换 auto mode off/on
  → 不会因为 header 变化导致 cache miss

  thinkingClearLatched: null → true (>1h 无 API 调用)
  → 确认 cache 已 miss → 清理 thinking tokens 无成本
  → 此后保持清理, 让新 cache warm up

语义: "单向阀" — 只能从 null → true, 不可反转
```

### 2.3 Session ID 管理

```
sessionId 生命周期:
  启动时: randomUUID() 
  /clear: regenerateSessionId({ setCurrentAsParent: true })
    → parentSessionId = 旧 sessionId
    → 新 sessionId = randomUUID()
    → 清理 planSlugCache
  /resume: switchSession(targetId, projectDir)
    → 原子切换 sessionId + sessionProjectDir
    → 触发 sessionSwitched signal
    → concurrentSessions.ts 监听以更新 PID 文件

Signal 模式:
  sessionSwitched = createSignal<[id: SessionId]>()
  onSessionSwitch = sessionSwitched.subscribe
  → 观察者模式, bootstrap 不导入监听者
```

### 2.4 Token Budget 追踪

```
outputTokensAtTurnStart = 0         ← Turn 开始时快照
currentTurnTokenBudget: null        ← 当前 Turn 的 Token 上限
budgetContinuationCount = 0         ← Budget 续接次数

snapshotOutputTokensForTurn(budget):
  → 记录 Turn 开始点的 output tokens 总量
  → 设置本 Turn 的预算
  → 重置续接计数

getTurnOutputTokens():
  → totalOutputTokens - outputTokensAtTurnStart
  → 本 Turn 已消耗的 output tokens

incrementBudgetContinuationCount():
  → 当已达到 Budget 但用户允许继续时
```

### 2.5 Scroll Drain Suspension

```
问题: 
  背景 interval (定时器) 与 scroll frame 竞争事件循环
  → scroll 时 UI 卡顿

解决方案:
  markScrollActivity():
    scrollDraining = true
    debounce 150ms → scrollDraining = false
  
  getIsScrollDraining():
    → background intervals 在循环开始时检查
    → true → 跳过本次 work, 下次 tick 再执行
    
  waitForScrollIdle():
    → 异步等待 scroll 结束
    → 用于昂贵的一次性操作 (网络, 子进程)
```

---

## 3. Hook 系统三层架构

### 3.1 层次总览

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1: Post-Sampling Hooks (内部程序化注册)                  │
│    注册: registerPostSamplingHook(fn)                           │
│    触发: 每次 LLM 采样完成后                                    │
│    用途: SessionMemory 提取, Confidence Rating                  │
│    错误处理: catch + logError (不阻断主流程)                     │
│    存储: 模块级 array                                           │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Layer 2: Hook Events (事件广播系统)                            │
│    注册: registerHookEventHandler(handler)                     │
│    触发: Hook 执行生命周期 (started → progress → response)      │
│    用途: SDK 消费者 (VS Code), 调试日志                         │
│    过滤: shouldEmit() — ALWAYS_EMITTED + allHookEventsEnabled  │
│    缓冲: pendingEvents[] (handler 注册前最多 100 条)            │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│  Layer 3: Async Hook Registry (异步 Shell Hook 管理)           │
│    注册: registerPendingAsyncHook({processId, shellCommand...})│
│    轮询: checkForAsyncHookResponses() — 检查子进程完成          │
│    用途: settings.json 中配置的 Shell 命令 Hook                 │
│    生命周期: started → running → completed/killed/timeout       │
│    清理: finalizePendingAsyncHooks() — 进程退出时               │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 Post-Sampling Hooks

```typescript
// 注册表 — 极简: 数组 + push
const postSamplingHooks: PostSamplingHook[] = []

// 注册
registerPostSamplingHook(hook: PostSamplingHook): void
  → postSamplingHooks.push(hook)

// 执行 — 串行, 容错
executePostSamplingHooks(messages, systemPrompt, ...):
  for (const hook of postSamplingHooks) {
    try { await hook(context) }
    catch { logError(error) }  // 吞异常, 不阻断
  }

// REPLHookContext — Hook 的输入
{
  messages: Message[]              // 完整消息历史
  systemPrompt: SystemPrompt       // 当前系统 Prompt
  userContext: { [k: string]: string }  // 用户上下文
  systemContext: { [k: string]: string } // 系统上下文
  toolUseContext: ToolUseContext    // 工具执行上下文
  querySource?: QuerySource        // 'repl_main_thread' | 'session_memory' | ...
}
```

### 3.3 Hook 事件广播

```
HookExecutionEvent =
  | HookStartedEvent   { type:'started',  hookId, hookName, hookEvent }
  | HookProgressEvent  { type:'progress', hookId, hookName, hookEvent, stdout, stderr, output }
  | HookResponseEvent  { type:'response', hookId, hookName, hookEvent, output, exitCode, outcome }

事件过滤:
  ALWAYS_EMITTED = ['SessionStart', 'Setup']
  → 始终发送, 向后兼容
  
  其他事件 → 仅当 allHookEventsEnabled = true
  → SDK 的 includeHookEvents 选项
  → 或 CLAUDE_CODE_REMOTE 模式

缓冲机制:
  handler 注册前事件进入 pendingEvents[] (最多 100 条)
  handler 注册时 → flush 全部 pending events
  → 解决初始化时序问题
```

### 3.4 Async Hook Registry

```
PendingAsyncHook:
  processId: string           // 子进程 PID 标识
  hookId: string              // Hook 唯一 ID
  hookName: string            // Hook 名称 (settings.json 中的 key)
  hookEvent: HookEvent        // 触发事件类型
  startTime: number           // 启动时间戳
  timeout: number             // 超时 (默认 15s)
  shellCommand: ShellCommand  // 子进程封装
  responseAttachmentSent: bool // 是否已发送响应

生命周期:
  registerPendingAsyncHook() → Map 注册
    → startHookProgressInterval() 启动进度轮询 (1s 间隔)
    
  checkForAsyncHookResponses() → 轮询检查
    → 子进程完成? → 解析 JSON stdout
    → killed? → 清理移除
    → 运行中? → skip
    
  finalizePendingAsyncHooks() → 进程退出时
    → completed 的 → finalize + 发送 response 事件
    → 运行中的 → kill + 发送 cancelled 事件
    → pendingHooks.clear()

JSON 协议:
  子进程 stdout 中输出 JSON:
    { "async": true, asyncTimeout: 15000 } → 异步模式声明
    { ... } (无 "async" 字段) → 同步响应结果
  → 逐行解析, 找到第一个非 async 的 JSON 作为响应
```

---

## 4. Hook 事件类型全景

```
HookEvent 类型 (settings.json 可配置):

  SessionStart       — Session 启动
  Setup             — 初始化完成
  PreToolUse        — 工具执行前
  PostToolUse       — 工具执行后
  Notification      — 通知事件
  Stop              — 查询结束
  StatusLine        — 状态栏更新 (内部)
  FileSuggestion    — 文件建议 (内部)

Hook 执行模式:
  1. Shell 命令 (settings.json hooks 配置):
     → 启动子进程, JSON stdin/stdout 协议
     → 可同步 (阻塞等待) 或异步 (注册到 AsyncHookRegistry)
     
  2. HTTP 回调 (execHttpHook):
     → POST 到指定 URL
     → 用于 SDK 消费者
     
  3. 程序化 Hook (postSamplingHooks):
     → 直接函数注册
     → SessionMemory, extractMemories 等
     
  4. SDK 注册 Hook (registeredHooks in bootstrap state):
     → HookCallbackMatcher | PluginHookMatcher
     → VS Code extension 等消费者
```

---

## 5. 状态重置与测试隔离

```
resetStateForTests():
  Guard: NODE_ENV === 'test'
  
  Object.entries(getInitialState()).forEach(([key, value]) => {
    STATE[key] = value
  })
  
  outputTokensAtTurnStart = 0
  currentTurnTokenBudget = null
  budgetContinuationCount = 0
  sessionSwitched.clear()

设计意义:
  1. 测试隔离: 每个 test case 获得干净的全局状态
  2. 显式枚举: 重置所有字段, 不遗漏
  3. Guard: 生产代码调用 → throw Error
  4. 对比 extractMemories 的 initExtractMemories() 闭包模式:
     → 两种并行的状态隔离策略
     → 全局单例: 适合真正的全局状态
     → 闭包封装: 适合功能级有界状态
```

---

## 6. 全局状态的 "Don't Touch" 约束

```
源码中的约束注释:

Line 31: "// DO NOT ADD MORE STATE HERE - BE JUDICIOUS WITH GLOBAL STATE"
Line 259: "// ALSO HERE - THINK THRICE BEFORE MODIFYING"
Line 429: "// AND ESPECIALLY HERE"

State 准入标准 (逆向推导):
  ✓ 进程级生命周期 (Session ID, Start Time)
  ✓ 跨模块累积指标 (Cost, Duration, Token Usage)
  ✓ 一次性初始化后只读 (Initial Model, Project Root)
  ✓ Latch (单向激活, 不可逆)
  ✓ 遥测基础设施 (Meter, Logger, Tracer)
  
  ✗ 业务逻辑状态 (Task 进度 → AppState)
  ✗ 可从其他源推导的状态 (当前文件内容 → readFileState)
  ✗ 短 TTL 缓存 (GrowthBook feature flags → 专门模块)
```

---

## 7. 设计模式归纳

### 7.1 DAG 叶节点模式

`bootstrap/state.ts` 被设计为 import DAG 的叶节点——它不导入 `src/` 下其他模块 (除了类型导入和少量 utility)。这解除了全局状态的循环依赖风险，任何模块都可以安全导入 `bootstrap/state.ts`。

### 7.2 Getter/Setter 封装

不导出 `STATE` 对象本身，而是为每个字段提供独立的 `getXXX()` / `setXXX()` 函数。这: (a) 确保每次状态变更有明确的调用点可追溯, (b) 允许添加验证/副作用逻辑, (c) 支持精确的重置 (`resetStateForTests`)。

### 7.3 Sticky-On Latch

对于影响 Prompt Cache key 的 beta headers，采用 "一旦激活则不可逆" 的 Latch 模式。这牺牲了灵活性来换取缓存稳定性——50-70K tokens 的 Prompt Cache 比 mid-session header 切换的灵活性更有价值。

### 7.4 三层 Hook 架构

Hook 系统按使用场景分三层，而非单一统一的 Hook 注册表:
- L1 (Post-Sampling): 纯编程注册，最简单
- L2 (Hook Events): 事件广播，支持缓冲
- L3 (Async Registry): 子进程管理，复杂生命周期

### 7.5 事件缓冲与延迟注册

`hookEvents.ts` 的 `pendingEvents` 解决了经典的 "handler-not-yet-registered" 问题——在 handler 注册前发生的事件被缓冲，handler 注册时自动 flush。

---

## 8. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| Bootstrap State 作为 DAG 叶节点 | 全局状态模块不依赖业务模块，消除循环依赖 |
| Getter/Setter 封装 (非导出对象) | 状态变更可追踪，支持验证和日志 |
| Sticky-On Latch | 影响缓存 key 的配置项采用单向阀策略 |
| 双层状态 (Bootstrap + AppState) | 分离进程级状态和 UI 级状态 |
| 三层 Hook (PostSampling/Events/Async) | 按复杂度分层，不强求统一抽象 |
| 事件缓冲 + 延迟注册 | 解耦初始化时序，Handler 晚注册不丢事件 |
| resetStateForTests | 测试隔离: 全局单例用显式重置, 功能级用闭包 |
| Scroll Drain Suspension | 高频 UI 事件时暂停后台工作，避免事件循环竞争 |

> [!IMPORTANT]
> **核心发现**: `bootstrap/state.ts` 有 1759 行、约 100 个字段，但源码中有 **3 条显式警告注释**阻止随意添加字段。这反映了全局可变状态的管理哲学: **存在但严格受控**。Claude-Code 并没有采用 "零全局状态" 的纯函数主义，而是承认某些状态 (Session ID, 成本累积, 遥测) 天然是全局的，但通过 DAG 叶节点隔离 + Getter/Setter 封装 + 显式准入标准将其控制在安全边界内。KyberKit 应采纳 "受控全局状态" 而非 "零全局状态" 的工程立场。
