# DeepCC-07: LLM Gateway 深度逆向工程

> 逆向目标: `src/services/api/claude.ts` (3420行) + `src/services/api/withRetry.ts`
> 这是 Claude-Code 中信息密度最高的文件 — LLM API 网关层

---

## 1. 总体架构：四层 API 调用栈

Claude-Code 的 LLM API 交互被组织为 **四层嵌套的 async generator 调用栈**：

```
Layer 1: queryModelWithStreaming() / queryModelWithoutStreaming()
  │  公开接口层 — 被 query.ts 的 deps.callModel 调用
  │  职责: 通过 withStreamingVCR 包装 (测试录制/回放)
  │
  └─→ Layer 2: queryModel()  [核心协调器, L1017-2892]
       │  请求构建 + 流式处理 + 错误恢复 + 日志
       │  职责:
       │  • Tool Schema 构建 & 动态 Tool Search
       │  • 消息规范化 (normalizeMessagesForAPI)
       │  • System Prompt 块构建 (buildSystemPromptBlocks)
       │  • Prompt Cache Breakpoint 注入
       │  • Beta Header 管理 (Sticky Latch 策略)
       │  • 流式事件状态机处理
       │  • Streaming → Non-Streaming Fallback
       │  • 成本计算 & Usage 累计
       │
       └─→ Layer 3: withRetry()  [重试编排器]
            │  指数退避 + 模型降级 + 529 限流处理
            │  职责:
            │  • 可重试错误判定 (429, 529, 5xx, 连接重置)
            │  • 指数退避延迟 (500ms base)
            │  • 连续 529 三次后触发模型 Fallback
            │  • Fast Mode 冷却感知
            │
            └─→ Layer 4: anthropic.beta.messages.create()
                 │  Anthropic SDK 原始调用
                 │  { ...params, stream: true }.withResponse()
                 └─→ HTTP/TLS → API 服务器
```

---

## 2. 请求构建 Pipeline (paramsFromContext)

`paramsFromContext()` 是每次 API 请求的参数工厂函数 (L1538-1729)，在重试时被多次调用：

```
输入: RetryContext { model, thinkingConfig, fastMode, maxTokensOverride }
  │
  ├─ 1. Beta Headers 组装
  │     基础: getModelBetas(model) + getMergedBetas()
  │     动态:
  │     ├─ Advisor → ADVISOR_BETA_HEADER
  │     ├─ Tool Search → getToolSearchBetaHeader()
  │     ├─ 1M Context → CONTEXT_1M_BETA_HEADER
  │     ├─ Effort → EFFORT_BETA_HEADER
  │     ├─ Fast Mode → FAST_MODE_BETA_HEADER  [Sticky Latch]
  │     ├─ AFK Mode → AFK_MODE_BETA_HEADER    [Sticky Latch]
  │     ├─ Cache Editing → CACHE_EDITING_BETA  [Sticky Latch]
  │     ├─ Structured Output → STRUCTURED_OUTPUTS_BETA_HEADER
  │     ├─ Task Budget → TASK_BUDGETS_BETA_HEADER
  │     └─ Prompt Cache Scope → PROMPT_CACHING_SCOPE_BETA_HEADER
  │
  ├─ 2. Output Config 组装
  │     ├─ Effort (string 'low'|'medium'|'high' 或 numeric override)
  │     ├─ Task Budget (type='tokens', total, remaining)
  │     ├─ Output Format (JSON Schema for structured output)
  │     └─ Speed ('fast' when fast mode active)
  │
  ├─ 3. Thinking 配置
  │     ├─ adaptive → { type: 'adaptive' }  (优先, 免设 budget)
  │     └─ enabled → { type: 'enabled', budget_tokens: min(maxOutput-1, budget) }
  │
  ├─ 4. Context Management (API 微压缩策略)
  │     └─ getAPIContextManagement({ hasThinking, isRedactThinking, clearAllThinking })
  │
  ├─ 5. Prompt Cache 断点注入
  │     └─ addCacheBreakpoints(messages, enableCaching, querySource,
  │                            useCachedMC, cacheEdits, pinnedEdits, skipCacheWrite)
  │
  └─ 6. 最终请求体
        {
          model, messages, system, tools, tool_choice,
          betas, metadata, max_tokens, thinking,
          temperature, context_management, output_config,
          speed, ...extraBodyParams
        }
```

---

## 3. Sticky Latch Beta Header 策略

> **关键洞察**: Beta Headers 一旦首次发送，在整个会话期间持续发送，即使触发条件已关闭。

```
设计目的: 避免 mid-session header 变更导致服务端 Prompt Cache 失效
         (每次 header 变更会 bust 约 50-70K tokens 的缓存)

实现方式:
  1. 首次条件满足 → setXxxHeaderLatched(true) 写入全局 STATE
  2. 后续请求 → 直接读取 latched 值，不再检查实时条件
  3. /clear 和 /compact 重置 latch (clearBetaHeaderLatches)

Latch 清单:
  ┌──────────────────────┬────────────────────────────────┐
  │ Header               │ 首次触发条件                     │
  ├──────────────────────┼────────────────────────────────┤
  │ FAST_MODE_BETA       │ fast mode 激活                  │
  │ AFK_MODE_BETA        │ auto mode + ant + agentic query │
  │ CACHE_EDITING_BETA   │ cached MC + 1P + repl_main     │
  │ THINKING_CLEAR       │ 距上次 API 完成 > 1h          │
  └──────────────────────┴────────────────────────────────┘

对比: speed='fast' 是动态的 (cooldown 仍然抑制)
      header 是 latched (缓存安全)
```

---

## 4. 流式事件状态机

`queryModel` 的核心是一个 **流式 SSE 事件处理状态机** (L1940-2304)：

```
for await (const part of stream) {

  message_start (L1980)
    → 初始化 partialMessage
    → 记录 TTFB
    → 提取 usage (input_tokens, cache_*)
    → 提取 research (ant-only)

  content_block_start (L1995)
    → 按 type 初始化 contentBlocks[index]:
      ├─ tool_use → { ...block, input: '' }  (string 累积)
      ├─ server_tool_use → 同上 + advisor 检测
      ├─ text → { ...block, text: '' }
      ├─ thinking → { ...block, thinking: '', signature: '' }
      └─ default → { ...block } (clone 防止 SDK 变异)

  content_block_delta (L2053)
    → 按 delta.type 累积到对应 block:
      ├─ input_json_delta → block.input += delta.partial_json
      ├─ text_delta → block.text += delta.text
      ├─ thinking_delta → block.thinking += delta.thinking
      ├─ signature_delta → block.signature = delta.signature
      ├─ connector_text_delta → block.connector_text += delta
      └─ citations_delta → (TODO)
    → 注意: 不使用 BetaMessageStream 的 partialParse
            因为其对每个 input_json_delta 的 O(n^2) 解析开销

  content_block_stop (L2171)
    → normalizeContentFromAPI([contentBlock], tools, agentId)
    → 创建 AssistantMessage { message, requestId, uuid, timestamp }
    → newMessages.push(m)
    → yield m                ← 这是 query.ts 消费的核心 yield 点

  message_delta (L2213)
    → updateUsage(usage, part.usage)
    → stopReason = part.delta.stop_reason
    → 直接变异 lastMsg.message.usage 和 .stop_reason
      (不创建新对象 — 保证 transcript 写队列的引用一致性)
    → calculateUSDCost + addToTotalSessionCost
    → 检测 max_tokens / model_context_window_exceeded
      → yield createAssistantAPIErrorMessage (apiError='max_output_tokens')

  message_stop (L2295)
    → (空操作)

  所有事件:
    → yield { type: 'stream_event', event: part }
      (转发原始 SSE 事件给 SDK 消费方)
}
```

**设计要点**：
- **手动 JSON 累积而非 SDK 自动解析**: `input_json_delta` 的 `partial_json` 被当作字符串拼接，最终在 `normalizeContentFromAPI` 中统一解析。避免了 BetaMessageStream 的 O(n²) full-document re-parse。
- **直接引用变异**: `message.usage` 和 `message.stop_reason` 使用直接属性赋值而非对象替换，因为 transcript 写队列持有引用，100ms 延迟写入时需要读到最新值。

---

## 5. Streaming → Non-Streaming Fallback

```
流式请求失败时:

  catch (streamingError) {
    │
    ├─ APIUserAbortError + signal.aborted → 真实用户中断, 抛出
    ├─ APIUserAbortError + !signal.aborted → SDK 内部超时, 当作 timeout
    │
    ├─ 检查 disableFallback flag
    │   (CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK 或 GrowthBook)
    │   → true: 直接抛出 (防止流式 Tool 执行的 double execution)
    │
    └─ Fallback 路径:
         1. options.onStreamingFallback() → 通知 query.ts 清理 orphaned 消息
         2. executeNonStreamingRequest() [L818-917]
            → withRetry + anthropic.beta.messages.create (非流式)
            → adjustParamsForNonStreaming (max_tokens → 64K cap)
            → bounded timeout (120s remote / API_TIMEOUT_MS)
         3. normalizeContentFromAPI → yield AssistantMessage
  }

  catch (errorFromRetry) 外层:
    ├─ FallbackTriggeredError → 传播到 query.ts 做模型切换
    ├─ 404 CannotRetryError → Non-Streaming Fallback (代理网关兼容)
    └─ 其他 → logAPIError + yield getAssistantMessageFromError
```

---

## 6. 重试策略 (withRetry)

```typescript
// withRetry.ts 核心参数:
MAX_529_RETRIES = 3
BASE_DELAY_MS = 500

// 可重试错误类型:
isTransientCapacityError: 529 (overload) 或 429 (rate_limit)
isStaleConnectionError: ECONNRESET | EPIPE (连接回收)
5xx 服务端错误

// 重试流程:
for (attempt = 1; attempt <= maxRetries + 1; attempt++) {
  try {
    return await operation(client, attempt, retryContext)
  } catch (error) {

    if (is529 && consecutive529 >= MAX_529_RETRIES && fallbackModel) {
      throw new FallbackTriggeredError(originalModel, fallbackModel)
      // → 传播到 query.ts 执行模型切换
    }

    if (isRetryable) {
      delay = BASE_DELAY_MS * 2^(attempt-1)  // 指数退避
      await sleep(delay)
      continue
    }

    throw new CannotRetryError(error, retryContext)
  }
}
```

**529 → Fallback 链**: Streaming 529 → Non-Streaming Fallback（如果启用）→ withRetry 内部重试 → consecutive529 计数 → FallbackTriggeredError → query.ts 切换 fallbackModel + tombstone orphaned messages + 重新 continue。

---

## 7. Prompt Cache 精细控制

### 7.1 System Prompt Cache 策略

```
buildSystemPromptBlocks(systemPrompt, enableCaching, options)
  │
  └─ splitSysPromptPrefix(systemPrompt, { skipGlobalCache })
      │
      ├─ 第一段 (stable prefix): { text, cacheScope: 'global' }
      │   → { cache_control: { type: 'ephemeral', scope: 'global' } }
      │   → 全局共享缓存 (所有会话)
      │
      └─ 后续段 (session-specific): { text, cacheScope: null }
          → { cache_control: { type: 'ephemeral' } }
          → 会话级缓存
```

### 7.2 消息级 Cache Breakpoint 策略

```
addCacheBreakpoints(messages, enableCaching, querySource, ...)
  │
  ├─ 策略 1: 单一断点 (One marker per request)
  │   正常: 最后一条消息添加 cache_control
  │   skipCacheWrite: 倒数第二条 (避免 fork 留下独占 tail)
  │
  ├─ 策略 2: 1h TTL (长时间缓存)
  │   条件: ant 用户 或 subscriber 未超量 + querySource 在白名单
  │   → { type: 'ephemeral', ttl: '1h' }
  │
  ├─ 策略 3: Global Cache Scope
  │   条件: shouldUseGlobalCacheScope() + 无 MCP 工具渲染
  │   → system prompt 添加 scope: 'global'
  │
  └─ 策略 4: Cached Microcompact (cache_edits + cache_reference)
      条件: cachedMCEnabled + 1P + repl_main_thread
      → tool_result 上添加 cache_reference: tool_use_id
      → 在最后 user 消息中插入 cache_edits: [{ type: 'delete', cache_reference }]
      → pinCacheEdits 确保后续请求重发同一 edit
```

### 7.3 Cache Break Detection

```
recordPromptState({system, tools, model, betas, ...})
  → 每次请求记录缓存相关的所有输入
  → hash 比较检测 prompt 结构变更

checkResponseForCacheBreak(querySource, cache_read, cache_create, ...)
  → 分析 API 响应中的 cache invalidation
  → 输出 diagnostics 用于调优缓存策略
```

---

## 8. Tool Search 与动态 Tool 加载

```
Tool 注册 Pipeline:
  全部 tools
    │
    ├─ isDeferredTool(t) → deferredToolNames (by GrowthBook config)
    ├─ shouldDeferLspTool(t) → LSP 未初始化完成时延迟
    │
    ├─ filteredTools = tools.filter(t => {
    │     非 deferred → 保留
    │     ToolSearchTool → 保留
    │     deferred + 已被 tool_reference 发现 → 保留
    │     deferred + 未发现 → 过滤
    │   })
    │
    ├─ toolSchemas = filteredTools.map(t => toolToAPISchema(t, {
    │     deferLoading: willDefer(t)  → API 中标记 defer_loading
    │   }))
    │
    └─ allTools = [...toolSchemas, ...extraToolSchemas]
         (extraToolSchemas 包含 advisor server tool)

消息注入:
  useToolSearch && !isDeferredToolsDeltaEnabled()
    → 在消息头部注入 <available-deferred-tools> XML
```

---

## 9. 资源管理与内存泄漏防护

```
releaseStreamResources():
  1. cleanupStream(stream)
     → stream.controller.abort() (如果未 abort)
  2. streamResponse.body?.cancel() (释放 native TLS/socket buffer)
  3. stream = undefined, streamResponse = undefined

调用时机:
  ├─ try/finally 块 (L2808-2815) → 所有退出路径
  ├─ 正常完成后 (L2891) → 防御性冗余调用
  └─ Stream idle timeout (L1926) → watchdog 触发

Idle Watchdog:
  STREAM_IDLE_TIMEOUT_MS = 90s (可配置)
  每次收到 chunk → resetStreamIdleTimer()
  超时 → streamIdleAborted = true → releaseStreamResources()
  → 抛出 Error → 触发 non-streaming fallback

Stall Detection:
  STALL_THRESHOLD_MS = 30s
  每个 chunk 到达时检测两个 chunk 间的时间差
  超过阈值 → logEvent('tengu_streaming_stall')
  (不中断, 仅监控)
```

---

## 10. 成本追踪架构

```
成本计算链:
  message_delta 事件
    → calculateUSDCost(resolvedModel, usage)
    → addToTotalSessionCost(cost, usage, model)
    → costUSD 累加

Non-streaming fallback:
  finally 块中
    → fallbackMessage.message.usage
    → calculateUSDCost + addToTotalSessionCost
    (在 yield 前完成, 防止 .return() 导致丢失)

Usage 累积模型 (updateUsage):
  input_tokens: 非零覆写 (>0 才更新)
  cache_*: 非零覆写
  output_tokens: 直接覆写
  server_tool_use: 直接覆写
  service_tier: 保留最新
  iterations: 保留最新 (server tool loop count)
```

---

## 11. 核心设计模式归纳

### 11.1 参数工厂函数 (paramsFromContext)

请求参数不是一次性构建的静态对象，而是一个 **闭包工厂函数**。理由：
- withRetry 在重试时可能改变 model / maxTokensOverride / fastMode
- RetryContext 提供运行时可变参数
- 工厂函数每次调用生成当前正确的参数快照

### 11.2 Escape Hatch Pattern (Non-Streaming Fallback)

当 streaming 失败时（代理 404、超时、SSE 断流），自动降级为 non-streaming + 重试。关键细节：
- 流式 529 计入 non-streaming 的 consecutive529 计数
- 降级后 max_tokens 上限 64K (API 10分钟超时限制)
- onStreamingFallback 回调通知 query.ts 清理 orphaned 消息和 StreamingToolExecutor

### 11.3 Cumulative Usage 而非 Delta

```
Anthropic 的流式 API 返回的是 **累积值**，不是增量:
  message_start: { input_tokens: 5000, output_tokens: 0 }
  message_delta:  { input_tokens: 0,    output_tokens: 234 }
                    ↑ 注意这里是 0, 不是 null

因此 updateUsage 使用 "non-null and > 0" 策略:
  只有 > 0 时才更新 input_tokens (防止 message_delta 的 0 覆盖)
  output_tokens 直接覆写 (总是最新的)
```

### 11.4 引用变异策略 vs 不可变策略 的选择

```
直接变异 (mutable):
  lastMsg.message.usage = usage
  lastMsg.message.stop_reason = stopReason
  原因: transcript 写队列持有同一引用

不可变 (immutable):
  contentBlocks[i] = { ...part.content_block, text: '' }
  原因: 防止 SDK 内部变异影响已累积的状态
```

---

## 12. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| 四层 API 调用栈 | 将 VCR、重试、参数构建、流处理明确分层 |
| Sticky Latch Headers | 会话级别的 header/config 锁存，避免 cache bust |
| 手动 JSON 累积 | 避免使用 SDK 的高层 Stream 封装（O(n²) parsing） |
| paramsFromContext 工厂 | 请求参数用闭包工厂而非静态构建，支持 retry context |
| Streaming → Non-Streaming Fallback | 网关兼容降级策略 (404/SSE 断流/超时) |
| 529 → Model Fallback 链 | 连续过载自动降级到替代模型 |
| releaseStreamResources | 显式释放 native socket/TLS buffer 防止 OOM |
| 单一 cache_control marker | 精确控制 KV cache 页面回收 |
| Prompt Cache Break Detection | 主动检测并记录缓存失效原因 |

> [!IMPORTANT]
> **最大教训**: `claude.ts` 的 3420 行中有一半以上用于处理 **异常路径**（重试、降级、超时、资源泄漏防护、缓存失效检测）。这说明在生产级 LLM 网关中，**Happy Path 只占整个实现的 30-40%**。KyberKit 的 LLM Provider SPI 设计必须在初期就为错误恢复和降级预留充分的扩展点。
