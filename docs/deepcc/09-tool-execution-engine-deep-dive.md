# DeepCC-09: Tool 执行引擎深度逆向工程

> 逆向目标:
> - `src/services/tools/StreamingToolExecutor.ts` (531行) — 流式并发执行器
> - `src/services/tools/toolExecution.ts` (1746行) — 工具执行主管道
> - `src/services/tools/toolHooks.ts` (651行) — Hook 扩展体系
> - `src/services/tools/toolOrchestration.ts` (189行) — 编排调度层
> - `src/Tool.ts` (793行) — Tool Trait 接口契约

---

## 1. 总体架构：四层工具执行栈

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 1: Tool Trait Contract  (Tool.ts)                       │
│  40+ 方法定义: call, checkPermissions, isConcurrencySafe,      │
│  interruptBehavior, validateInput, mapToolResultToToolResult... │
├────────────────────────────────────────────────────────────────┤
│  Layer 2: Orchestration  (toolOrchestration.ts)                │
│  ← 遗留路径 (非流式), partitionToolCalls → Serial/Concurrent   │
├────────────────────────────────────────────────────────────────┤
│  Layer 3: StreamingToolExecutor  (StreamingToolExecutor.ts)    │
│  ← 主路径 (流式), addTool + processQueue + getRemainingResults │
│  并发控制 + 有序发射 + sibling abort cascade                    │
├────────────────────────────────────────────────────────────────┤
│  Layer 4: Tool Execution Pipeline  (toolExecution.ts)          │
│  runToolUse → checkPermissionsAndCallTool                      │
│  8-phase 生命周期: Validate → Hooks → Permission → Call → ...  │
└────────────────────────────────────────────────────────────────┘
```

**调用链路 (从 query.ts)**:
```
queryLoop (query.ts)
  │
  ├─ 流式路径 (主路径):
  │   StreamingToolExecutor.addTool(block, assistantMsg)
  │     → processQueue()
  │       → executeTool(tool) 
  │         → runToolUse(block, ...) [toolExecution.ts]
  │   StreamingToolExecutor.getRemainingResults()
  │     → yield { message, newContext }
  │
  └─ 非流式路径 (遗留/fallback):
      runTools(toolUseMessages, ...) [toolOrchestration.ts]
        → partitionToolCalls → Serial / Concurrent batches
          → runToolUse(block, ...) [toolExecution.ts]
```

---

## 2. Tool Trait 契约 (Tool.ts)

### 2.1 核心接口 (40+ 方法)

```typescript
Tool<Input extends AnyObject, Output, P extends ToolProgressData> = {
  // ─── 标识与元数据 ───
  name: string                           // 唯一标识
  aliases?: string[]                     // 向前兼容别名 (e.g., "KillShell" → "TaskStop")
  searchHint?: string                    // ToolSearch 关键词匹配 (3-10 词)
  isMcp?: boolean                        // 是否为 MCP 工具
  shouldDefer?: boolean                  // 是否延迟加载 (defer_loading: true)
  alwaysLoad?: boolean                   // 永不延迟 (_meta['anthropic/alwaysLoad'])

  // ─── 输入验证 ───
  inputSchema: Input                     // Zod Schema (类型安全)
  inputJSONSchema?: ToolInputJSONSchema  // MCP 工具的原始 JSON Schema  
  validateInput?(input, context)         // 业务级验证 (Schema 之后)
  backfillObservableInput?(input)        // 为观察者补充衍生字段 (不影响 call)

  // ─── 并发与中断 ───
  isConcurrencySafe(input): boolean      // 是否可并行执行
  interruptBehavior?(): 'cancel'|'block' // 用户中断策略
  isReadOnly(input): boolean             // 是否为只读操作
  isDestructive?(input): boolean         // 是否为不可逆操作

  // ─── 权限 ───
  checkPermissions(input, ctx)           // 工具特定权限检查
  requiresUserInteraction?(): boolean    // 是否需要用户交互
  preparePermissionMatcher?(input)       // Hook if 条件匹配器

  // ─── 执行 ───
  call(args, context, canUseTool, parentMsg, onProgress)  → ToolResult<Output>
  
  // ─── 结果处理 ───
  maxResultSizeChars: number             // 最大结果字符数 (超出则持久化到磁盘)
  mapToolResultToToolResultBlockParam(content, toolUseID)  // 转换为 API 格式
  
  // ─── UI 渲染 (10+ 方法) ───
  renderToolUseMessage(input, options)
  renderToolResultMessage?(content, progress, options)
  renderToolUseProgressMessage?(progress, options)
  renderGroupedToolUse?(toolUses, options)  // 并行工具组合渲染
  // ... + renderRejected, renderError, renderQueued, renderTag
}
```

### 2.2 buildTool 工厂 — 失败安全默认值

```typescript
const TOOL_DEFAULTS = {
  isEnabled:          () => true,
  isConcurrencySafe:  () => false,    // ← 保守: 假设不安全
  isReadOnly:         () => false,    // ← 保守: 假设有写操作
  isDestructive:      () => false,
  checkPermissions:   (input) => Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',    // ← 跳过分类器
  userFacingName:     () => name,
}

// 所有 60+ 工具通过 buildTool() 构建:
export const MyTool = buildTool({ name: 'MyTool', ... })
// → { ...TOOL_DEFAULTS, userFacingName: () => 'MyTool', ...def }
```

> [!IMPORTANT]
> **关键设计**: `isConcurrencySafe` 默认 `false` (fail-closed)。只有工具显式声明 `true` 且 `inputSchema.safeParse` 成功时，才允许并行执行。这是确定性优先原则的体现。

---

## 3. StreamingToolExecutor 深度解析

### 3.1 状态机

```
TrackedTool 状态转换:

  queued ──→ executing ──→ completed ──→ yielded
    │                         │
    │ (abort/discard)         │ (abort/discard)
    └──→ completed            └──→ (synthetic error injected)
         (synthetic error)
```

### 3.2 并发控制算法

```
canExecuteTool(isConcurrencySafe):
  正在执行的工具 = tools.filter(t => t.status === 'executing')
  
  return 没有正在执行的工具
      || (当前工具 concurrency-safe && 所有正在执行的工具也 concurrency-safe)
```

**调度规则**:
- 连续的 concurrency-safe 工具可以并行执行
- 非 concurrency-safe 工具必须独占执行
- 当遇到不可并行工具时, 阻断调度队列 (`break`)

```
示例:
  Tool A (safe) → 立即执行
  Tool B (safe) → 并行执行 (A 还在运行)
  Tool C (unsafe) → 等待 A, B 完成
  Tool D (safe) → 等待 C 完成
```

### 3.3 Sibling Abort Cascade

```
executeTool(tool):
  toolAbortController = createChildAbortController(siblingAbortController)
    │
    │  toolAbortController.signal → 'abort' event listener:
    │    if reason !== 'sibling_error' && parent 没被 abort && 没被 discard:
    │      → 冒泡到 toolUseContext.abortController (结束整个 Turn)
    │
    └─ for await (update of runToolUse(...)):
         │
         ├─ 检测到错误结果 && tool.name === BASH_TOOL_NAME:
         │    → this.hasErrored = true
         │    → siblingAbortController.abort('sibling_error')
         │    → 所有兄弟子进程被杀死
         │
         ├─ 非 Bash 工具错误:
         │    → 仅影响自身, 不取消兄弟
         │
         └─ progress 消息:
              → 加入 pendingProgress (立即发射)
              → 唤醒 progressAvailableResolve
```

> [!TIP]
> **为什么只有 Bash 错误会 cascade?** 注释中解释: "Bash commands often have implicit dependency chains (e.g. mkdir fails → subsequent commands pointless). Read/WebFetch/etc are independent — one failure shouldn't nuke the rest."

### 3.4 有序发射机制

```
getCompletedResults():  // 同步 Generator
  for each tool in insertion order:
    1. 先发射所有 pendingProgress (立即, 不受顺序限制)
    2. if status === 'yielded': skip
    3. if status === 'completed': yield results, mark 'yielded'
    4. if status === 'executing' && !concurrencySafe: BREAK
       ↑ 非并发工具阻断后续工具的结果发射

getRemainingResults():  // 异步 Generator
  while 有未完成的工具:
    processQueue()
    yield* getCompletedResults()
    if 仍有执行中 && 没有完成的:
      await Promise.race([
        ...executingPromises,    // 任一工具完成
        progressPromise,         // 有新 progress 到达
      ])
```

**设计意义**:
- **Progress 消息实时泄露**: 不受顺序约束，可以立即向 UI 传递进度
- **Result 消息有序发射**: 保持工具结果的确定性顺序
- **两种唤醒源**: 工具完成 OR Progress 到达，避免饥饿等待

### 3.5 discard() — Streaming Fallback 生命线

```
discard():
  this.discarded = true
  
效果:
  getAbortReason() → return 'streaming_fallback'
  getCompletedResults() → return (空)
  getRemainingResults() → return (空)
  
  所有 queued 的工具永远不启动
  所有 executing 的工具收到 synthetic 错误消息
```

---

## 4. Tool Execution Pipeline (toolExecution.ts)

### 4.1 单工具执行生命周期 — 8 阶段

```
runToolUse(toolUse, assistantMsg, canUseTool, context)
  │
  │ Phase 0: Tool Resolution
  │   findToolByName(tools, name)
  │   如果找不到 → fallback 到 aliases (向前兼容旧 transcript)
  │   如果仍找不到 → yield tool_use_error
  │
  │ Phase 1: Abort Check
  │   if abortController.signal.aborted → yield CANCEL_MESSAGE
  │
  └─→ streamedCheckPermissionsAndCallTool(...)
       │
       │ 内部使用 Stream<MessageUpdateLazy> 将 progress 和 result
       │ 统一为 AsyncIterable (实现上是 Promise → stream 的桥接)
       │
       └─→ checkPermissionsAndCallTool(...)
            │
            │ Phase 2: Input Validation (Zod)
            │   parsedInput = tool.inputSchema.safeParse(input)
            │   如果失败 → 检查 ToolSearch schema-not-sent hint
            │   → yield InputValidationError
            │
            │ Phase 3: Business Validation
            │   tool.validateInput?.(parsedInput.data, context)
            │   如果 result === false → yield error
            │
            │ Phase 4: Speculative Classifier (Bash only)
            │   startSpeculativeClassifierCheck(command, ...)
            │   在后台预热 allow 分类器
            │
            │ Phase 5: PreToolUse Hooks
            │   for await (result of runPreToolUseHooks(...)):
            │     → hookPermissionResult / hookUpdatedInput
            │     → preventContinuation / stopReason
            │     → additionalContext / stop
            │
            │ Phase 6: Permission Resolution
            │   resolveHookPermissionDecision(hookResult, tool, input, ...)
            │     │
            │     ├─ hook.allow + rule check null → bypass prompt
            │     ├─ hook.allow + rule.deny → deny overrides hook
            │     ├─ hook.allow + rule.ask → dialog required
            │     ├─ hook.deny → immediate deny
            │     ├─ hook.ask → forceDecision dialog
            │     └─ no hook → normal canUseTool()
            │
            │   if permission !== 'allow' → yield error + PermissionDenied hooks
            │
            │ Phase 7: Tool Execution
            │   result = await tool.call(callInput, context, canUseTool, msg, onProgress)
            │   带计时、OTel span、session activity
            │   结果通过 mapToolResultToToolResultBlockParam 转换
            │   超大结果通过 processToolResultBlock 持久化到磁盘
            │
            │ Phase 8: PostToolUse Hooks
            │   for await (hookResult of runPostToolUseHooks(...)):
            │     → hook_additional_context
            │     → hook_stopped_continuation  
            │     → hook_blocking_error
            │     → updatedMCPToolOutput (MCP 工具特有)
            │
            └─ return resultingMessages[]
```

### 4.2 Input 处理的精细控制

```
三种 Input 指针:

processedInput  ← hooks/permission 可能修改
  │
  ├─ backfilledClone
  │   tool.backfillObservableInput(clone)
  │   用于 hooks/canUseTool/telemetry (观察者看到的版本)
  │   目的: 补充 legacy/derived 字段, 不影响 call()
  │
  └─ callInput  ← 传递给 tool.call() 的最终版本
      │
      ├─ 如果 processedInput 没被 hook/permission 改过:
      │    callInput = 原始 input (保留模型原始 file_path)
      │
      └─ 如果被改过:
           callInput = processedInput (使用 hook 提供的版本)
           特殊: 如果 file_path 和 backfill 扩展结果相同 → 恢复原始
           原因: 保持 transcript/VCR fixture hash 稳定性
```

> [!IMPORTANT]
> **设计哲学**: 区分 Observable Input (hooks 看到的) 和 Call Input (工具执行的)。Observer 可以看到更丰富的信息，但执行侧保持原始语义。这是一种 CQRS-like 的关注点分离。

---

## 5. Hook 扩展体系 (toolHooks.ts)

### 5.1 四类 Hook 事件

```
┌───────────────────────────┬──────────────────────────────────────┐
│ Hook 事件                  │ 触发时机与能力                         │
├───────────────────────────┼──────────────────────────────────────┤
│ PreToolUse                │ 工具执行前                             │
│                           │ 能力: allow/deny/ask, updatedInput,  │
│                           │ preventContinuation, additionalContext│
├───────────────────────────┼──────────────────────────────────────┤
│ PostToolUse               │ 工具成功执行后                         │
│                           │ 能力: additionalContext,              │
│                           │ updatedMCPToolOutput (MCP only),     │
│                           │ preventContinuation, blockingError    │
├───────────────────────────┼──────────────────────────────────────┤
│ PostToolUseFailure        │ 工具执行失败后                         │
│                           │ 能力: additionalContext,              │
│                           │ blockingError                        │
├───────────────────────────┼──────────────────────────────────────┤
│ PermissionDenied          │ auto 模式分类器拒绝后                  │
│                           │ 能力: retry=true → 告知模型可重试      │
└───────────────────────────┴──────────────────────────────────────┘
```

### 5.2 Permission Resolution 决策树

```
resolveHookPermissionDecision(hookResult, tool, input, ctx, canUseTool):
  │
  ├─ hookResult.behavior === 'allow'
  │   ├─ requiresInteraction && hook 提供 updatedInput
  │   │   → hook 作为交互代理 (e.g., 无头模式收集 AskUserQuestion 答案)
  │   │   → 标记 interactionSatisfied = true
  │   │
  │   ├─ requiresInteraction || requireCanUseTool (未满足)
  │   │   → 仍需走 canUseTool() 交互路径
  │   │
  │   └─ checkRuleBasedPermissions(tool, input, ctx)
  │       ├─ null → hook 直接生效, bypass 交互
  │       ├─ deny → deny 规则覆盖 hook (安全优先)
  │       └─ ask  → 仍需弹出权限对话框
  │
  ├─ hookResult.behavior === 'deny'
  │   → 立即拒绝
  │
  └─ hookResult.behavior === 'ask' 或无 hook
      → 正常 canUseTool() 流程
      → 如果有 ask, 将 forceDecision 传递给对话框
```

> [!WARNING]
> **安全不变量**: Hook `allow` 永远不能绕过 settings.json 中的 `deny/ask` 规则。这是 inc-4788 事件后的深度防御措施。

---

## 6. Orchestration 编排层 (toolOrchestration.ts)

### 6.1 分区算法 (partitionToolCalls)

```
输入: [A(safe), B(safe), C(unsafe), D(safe), E(unsafe)]

分区结果:
  Batch 1: { isConcurrencySafe: true,  blocks: [A, B] }
  Batch 2: { isConcurrencySafe: false, blocks: [C]    }
  Batch 3: { isConcurrencySafe: true,  blocks: [D]    }
  Batch 4: { isConcurrencySafe: false, blocks: [E]    }

执行:
  Batch 1 → runToolsConcurrently (max_concurrency=10)
  Batch 2 → runToolsSerially
  Batch 3 → runToolsConcurrently
  Batch 4 → runToolsSerially
```

### 6.2 对比: Orchestration vs StreamingToolExecutor

| 特性 | toolOrchestration (旧) | StreamingToolExecutor (新) |
|---|---|---|
| 工具到达时机 | 全部到达后再执行 | 工具流式到达即开始执行 |
| 并发模型 | 分区→批量执行 | 单工具级别动态调度 |
| Progress 传递 | 不支持 | 实时泄露 pendingProgress |
| 中断行为 | 不支持 interruptBehavior | 支持 cancel/block |
| Sibling Abort | 不支持 | Bash 错误 → 取消兄弟 |
| Context Modifier | 支持 | 支持 (仅非并发) |
| 使用方 | fallback 路径 | 主路径 (query.ts) |

---

## 7. 异常处理与遥测

### 7.1 三类 Synthetic Error

```typescript
createSyntheticErrorMessage(toolUseId, reason, assistantMsg):
  │
  ├─ 'user_interrupted'
  │   → REJECT_MESSAGE + withMemoryCorrectionHint
  │   → UI 显示 "User rejected edit" (而非 "Error editing file")
  │
  ├─ 'sibling_error'
  │   → "Cancelled: parallel tool call {description} errored"
  │   → 包含失败工具的摘要 (e.g., "Bash(git push...)")
  │
  └─ 'streaming_fallback'
      → "Streaming fallback - tool execution discarded"
      → 流式→非流式降级时触发
```

### 7.2 Tool Error 分类器 (Telemetry-Safe)

```typescript
classifyToolError(error):
  ├─ TelemetrySafeError → 使用 telemetryMessage (已审查)
  ├─ Node.js fs error   → "Error:ENOENT" / "Error:EACCES"
  ├─ 有稳定 .name 的 Error → error.name (e.g., "ShellError")
  ├─ 通用 Error → "Error"
  └─ 非 Error → "UnknownError"

设计: 避免将混淆后的构造函数名 (如 "nJT") 发送到遥测
```

### 7.3 OTel Span 结构

```
startToolSpan(name, attributes, input)
  ├─ startToolBlockedOnUserSpan()     // 等待用户权限决策
  │   └─ endToolBlockedOnUserSpan(decision, source)
  ├─ startToolExecutionSpan()         // 实际执行阶段
  │   └─ endToolExecutionSpan({ success, error? })
  └─ endToolSpan(toolResultStr)

时间分布:
  [-------- Tool Span ------------------------------------------]
  [-- BlockedOnUser --][-- Execution --------][-- PostHooks ---]
```

### 7.4 Timing Thresholds

```
HOOK_TIMING_DISPLAY_THRESHOLD_MS = 500     // 显示 hook 计时
SLOW_PHASE_LOG_THRESHOLD_MS      = 2000    // 记录慢阶段日志
MAX_TOOL_USE_CONCURRENCY         = 10      // 默认并行度 (env 可覆盖)
```

---

## 8. MCP 工具特殊处理

```
MCP 工具 vs 内置工具的差异:

┌───────────────────────┬─────────────────────────────────┐
│ 差异点                 │ 说明                             │
├───────────────────────┼─────────────────────────────────┤
│ Hook 输出变更          │ PostToolUse hook 可通过           │
│                       │ updatedMCPToolOutput 修改输出     │
├───────────────────────┤                                 │
│ 结果发送时机           │ 内置: 先发送结果, 再跑 hooks      │
│                       │ MCP: 先跑 hooks (可能修改输出),   │
│                       │ 再发送最终结果                    │
├───────────────────────┤                                 │
│ Auth Error 处理        │ McpAuthError → 更新 client 状态   │
│                       │ 为 'needs-auth', UI 显示重新授权   │
├───────────────────────┤                                 │
│ Schema 来源            │ inputJSONSchema (原始 JSON)       │
│                       │ 而非 Zod Schema 转换              │
├───────────────────────┤                                 │
│ 结果元数据             │ mcpMeta: { _meta, structuredContent } │
│                       │ 传递给 SDK 消费者                  │
└───────────────────────┴─────────────────────────────────┘
```

---

## 9. 核心设计模式归纳

### 9.1 Streaming-First Tool Scheduling

传统 Agent 框架等待所有工具参数解析完毕再执行。Claude-Code 的 `StreamingToolExecutor` 实现了**流式到达即执行**的调度：

```
LLM 流式输出:
  tool_use_block(A) ──→ addTool(A) ──→ 立即开始执行 A
  tool_use_block(B) ──→ addTool(B) ──→ 检查能否并行, 如果可以→并行
  tool_use_block(C) ──→ addTool(C) ──→ 如需独占, 等待前序完成
  message_stop      ──→ getRemainingResults() → yield 所有剩余结果
```

### 9.2 Fail-Closed Concurrency

默认 `isConcurrencySafe: false`。并发安全性由工具自己声明，且只在 Zod parse 成功后才信任声明。两层防御确保即使工具 bug，也不会导致并发安全问题。

### 9.3 权限的三层融合

```
Layer 1: PreToolUse Hook → allow/deny/ask → 可被 deny 规则覆盖
Layer 2: Rule-Based Permissions (settings.json) → deny 优先级最高
Layer 3: Interactive canUseTool() → 用户最终裁决
```

### 9.4 Stream 桥接模式

`streamedCheckPermissionsAndCallTool` 使用自定义 `Stream` 类将 progress 回调和最终结果统一为 `AsyncIterable`。这解决了 "progress 是 callback, result 是 Promise" 的异构通信问题。

### 9.5 Observable Input vs Call Input 分离

Hooks、权限系统、遥测看到的 input (含 backfill) 与传给 `tool.call()` 的 input (原始) 是分离的。这种 CQRS 分离保持了 transcript hash 的稳定性。

---

## 10. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| StreamingToolExecutor | 实现流式工具调度器, 工具参数到达即可开始执行 |
| Tool Trait + buildTool | 设计统一的 Tool 接口契约 + 工厂函数, fail-closed defaults |
| isConcurrencySafe | 工具级并发声明, 保守默认值 |
| Sibling Abort Cascade | 只有真正有依赖链的工具(Bash)才级联取消 |
| Hook Pre/Post 体系 | 实现可组合的 Hook Pipeline, 支持权限决策注入 |
| Permission 三层融合 | Hook → Rule → Interactive, deny 优先级全局最高 |
| Observable vs Call Input | 区分观察者看到的版本和执行使用的版本 |
| Stream 桥接 | 将 callback 和 Promise 统一为 AsyncIterable |
| buildSchemaNotSentHint | Deferred 工具 schema 缺失时提供恢复指导 |
| classifyToolError | 遥测安全的错误分类 (避免混淆名泄漏) |

> [!IMPORTANT]
> **关键发现**: Tool 执行引擎的代码量 (3113行) 中, **约 60% 是权限检查、Hook 处理和遥测代码**。实际的 `tool.call()` 执行只占一小部分。这验证了生产级 Agent 系统中, "控制逻辑远多于执行逻辑" 的工程现实。KyberKit 应从设计初期就为权限、Hook 和遥测预留架构空间。
