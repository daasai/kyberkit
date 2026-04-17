# DeepCC-10: 上下文压缩引擎深度逆向工程

> 逆向目标:
> - `src/services/compact/compact.ts` (1706行) — 核心压缩逻辑
> - `src/services/compact/autoCompact.ts` (352行) — 自适应触发器
> - `src/services/compact/microCompact.ts` (531行) — 微压缩 (确定性 + Cache Editing)
> - `src/services/compact/sessionMemoryCompact.ts` (631行) — Session Memory 特化压缩
> - `src/services/compact/prompt.ts` (375行) — 压缩用 Prompt 模板
> - `src/services/compact/grouping.ts` (64行) — API Round 分组
> - `src/services/compact/postCompactCleanup.ts` (78行) — 压缩后清理

---

## 1. 总体架构：七级压缩 Pipeline

> **关键洞察**: 第 06 章中概述的 "六级压缩 Pipeline" 在源码逆向后扩展为 **七级**，新增了 Session Memory Compact 作为独立层级。

```
┌───────────────────────────────────────────────────────────────────┐
│  queryLoop 每次迭代的上下文压缩管道 (query.ts 调用顺序)            │
│                                                                   │
│  L1  Tool Result Budget    │ 确定性  │ 裁剪单个 tool_result 大小   │
│  L2  Snip Compact          │ 确定性  │ 删除历史中的旧消息段        │
│  L3  Micro-Compact         │ 确定性  │ 删除旧 tool_result 内容     │
│      ├─ Time-Based MC      │         │ 基于时间间隔清理 (优先)     │
│      ├─ Cached MC          │         │ Cache Editing API 删除     │
│      └─ (Legacy MC)        │         │ 已移除, 总是返回 true      │
│  L4  Context Collapse      │ 确定性  │ 多轮 tool 交互折叠为摘要   │
│  L5  Session Memory Comp.  │ LLM辅助 │ 用 SM 替代 LLM 摘要压缩    │
│  L6  Auto-Compact          │ LLM驱动 │ 全量上下文 LLM 摘要压缩    │
│  L7  Reactive Compact      │ LLM驱动 │ PTL/Media 错误后的最后手段  │
└───────────────────────────────────────────────────────────────────┘
```

**执行原则**: 前四级是确定性、零 LLM 调用操作；L5 利用已有 Session Memory 避免 LLM 调用；L6-L7 涉及 LLM API 调用。瀑布式设计确保低成本手段优先执行。

---

## 2. Auto-Compact 自适应触发器 (autoCompact.ts)

### 2.1 阈值计算

```
getAutoCompactThreshold(model):
  effectiveContextWindow = getContextWindowForModel(model) - reservedForSummary
    │
    ├─ reservedForSummary = min(getMaxOutputTokensForModel(model), 20_000)
    │   (基于 p99.99 compact summary output = 17,387 tokens)
    │
    └─ CLAUDE_CODE_AUTO_COMPACT_WINDOW env 可覆盖 contextWindow

  threshold = effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS (13_000)

  示例 (200K context window):
    effectiveWindow = 200_000 - 20_000 = 180_000
    threshold = 180_000 - 13_000 = 167_000 tokens
```

### 2.2 触发决策链 (shouldAutoCompact)

```
shouldAutoCompact(messages, model, querySource, snipTokensFreed):
  │
  ├─ Guard 1: querySource === 'session_memory' || 'compact'
  │   → false (递归防护: 压缩 Agent 不能触发自我压缩)
  │
  ├─ Guard 2: querySource === 'marble_origami' (CONTEXT_COLLAPSE)
  │   → false (ctx-agent 压缩会破坏主线程的 committed log)
  │
  ├─ Guard 3: !isAutoCompactEnabled()
  │   → false (用户配置 / DISABLE_COMPACT / DISABLE_AUTO_COMPACT)
  │
  ├─ Guard 4: tengu_cobalt_raccoon (REACTIVE_COMPACT only mode)
  │   → false (抑制主动压缩, 让 reactive compact 在 PTL 时兜底)
  │
  ├─ Guard 5: isContextCollapseEnabled() 
  │   → false (CONTEXT_COLLAPSE 拥有上下文管理权, 两者会竞争)
  │
  └─ tokenCount = tokenCountWithEstimation(messages) - snipTokensFreed
     → tokenCount >= threshold → true
```

### 2.3 autoCompactIfNeeded 执行链

```
autoCompactIfNeeded(messages, toolUseContext, cacheSafeParams, ...):
  │
  ├─ Circuit Breaker: consecutiveFailures >= 3
  │   → skip (BQ 发现 1,279 个 session 有 50+ 连续失败, 浪费 ~250K API calls/day)
  │
  ├─ 优先尝试: trySessionMemoryCompaction()  [L5]
  │   → 如果成功: 重置 lastSummarizedMessageId + runPostCompactCleanup
  │   → return { wasCompacted: true, compactionResult }
  │
  └─ Fallback: compactConversation()          [L6]
     → 成功: consecutiveFailures = 0
     → 失败: consecutiveFailures++ (circuit breaker 冒泡)
```

> [!IMPORTANT]
> **Circuit Breaker 模式**: `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3`。连续失败超过 3 次后，该 session 内不再尝试自动压缩。此设计来自生产数据——有些 session 上下文不可恢复地超出限制，持续重试只是浪费 API 调用。

---

## 3. Micro-Compact 微压缩 (microCompact.ts)

### 3.1 三条执行路径

```
microcompactMessages(messages, toolUseContext, querySource):
  │
  ├─ Path 1: Time-Based Microcompact (优先级最高)
  │   条件: 上次 assistant 消息距今 > gapThresholdMinutes
  │   行为: 内容清理所有旧 tool_result (服务器缓存已冷, 无需保护)
  │   互斥: 跳过 Cached MC (缓存冷状态下 cache editing 无意义)
  │
  ├─ Path 2: Cached Microcompact (仅 ant 用户)
  │   条件: isCachedMicrocompactEnabled() + isModelSupported + isMainThread
  │   行为: 通过 Cache Editing API 删除旧 tool_result (不修改本地消息)
  │   机制: cache_reference + cache_edits 在 API 层注入
  │
  └─ Path 3: No-Op
     条件: 以上都不满足 (外部用户, 子 Agent, 不支持的模型)
     行为: 返回原始消息, 依赖 autocompact 处理上下文压力
```

### 3.2 可压缩工具清单

```typescript
COMPACTABLE_TOOLS = {
  FileRead, Bash, PowerShell,
  Grep, Glob,
  WebSearch, WebFetch,
  FileEdit, FileWrite
}
// 注意: AgentTool, TaskCreateTool 等不在列表中
// 这些工具的结果通常较小且对上下文连续性关键
```

### 3.3 Time-Based Microcompact 详解

```
evaluateTimeBasedTrigger(messages, querySource):
  │
  ├─ 必须有显式 querySource (排除 /context, /compact 等分析调用)
  ├─ querySource 必须以 'repl_main_thread' 开头
  ├─ 找到最后一条 assistant 消息
  └─ gapMinutes = (now - lastAssistant.timestamp) / 60_000
     → gapMinutes >= config.gapThresholdMinutes → 触发
  
maybeTimeBasedMicrocompact:
  collectCompactableToolIds(messages)
    → keepSet = 最近 N 个 (keepRecent, 最小为 1)
    → clearSet = 其余
  
  对 clearSet 中每个 tool_result:
    block.content = '[Old tool result content cleared]'
  
  副作用:
    ├─ resetMicrocompactState() (清除 Cached MC 状态, 防止 stale 引用)
    └─ notifyCacheDeletion() (告知 cache break detector 预期缓存下降)
```

### 3.4 Cached Microcompact (Cache Editing API)

```
cachedMicrocompactPath:
  1. 遍历消息, 注册未登记的 tool_result (by tool_use_id)
  2. 按 user 消息分组 (registerToolMessage)
  3. getToolResultsToDelete(state) 基于 count-based 阈值
  4. 创建 cache_edits block (pendingCacheEdits)
  5. 返回原始消息 (不修改!) + compactionInfo

关键设计差异:
  ├─ 不修改本地消息内容 (cache_reference/cache_edits 在 API 层注入)
  ├─ pendingCacheEdits 延迟到 API 响应后确认
  │   (使用 API 返回的 cache_deleted_input_tokens 而非客户端估算)
  ├─ 仅限主线程 (防止子 Agent 污染全局 cachedMCState)
  └─ pinCacheEdits: 已发送的 edits 必须在后续请求中重新发送
```

> [!TIP]
> **为什么 Cached MC 不修改本地消息?** 因为 cache editing 是服务端操作——客户端只需告诉 API "删除这些 cache_reference 指向的内容"。如果同时修改本地消息，缓存前缀就会变化，反而导致 cache bust。

---

## 4. compactConversation 核心压缩逻辑 (compact.ts)

### 4.1 完整生命周期

```
compactConversation(messages, context, cacheSafeParams, ...):
  │
  │ Phase 0: 预处理
  │   preCompactTokenCount = tokenCountWithEstimation(messages)
  │   executePreCompactHooks() → 可注入 customInstructions
  │
  │ Phase 1: 压缩 Prompt 构建
  │   compactPrompt = getCompactPrompt(customInstructions)
  │   summaryRequest = createUserMessage({ content: compactPrompt })
  │
  │ Phase 2: LLM 摘要生成 (带 PTL 重试)
  │   for (;;) {
  │     summaryResponse = await streamCompactSummary({
  │       messages, summaryRequest, cacheSafeParams
  │     })
  │     if (!summary.startsWith(PROMPT_TOO_LONG)) break
  │
  │     // CC-1180 修复: 压缩请求本身 PTL
  │     // 按 API Round 分组 → 丢弃最老的 groups → 重试
  │     truncated = truncateHeadForPTLRetry(messages, response)
  │     if (!truncated || ptlAttempts > MAX_PTL_RETRIES=3) → throw
  │   }
  │
  │ Phase 3: 状态清理
  │   context.readFileState.clear()     ← 文件读取缓存
  │   context.loadedNestedMemoryPaths?.clear()  ← 嵌套记忆路径
  │   // 注意: 不重置 sentSkillNames (~4K tokens 节省)
  │
  │ Phase 4: 压缩后附件生成 (并行)
  │   Promise.all([
  │     createPostCompactFileAttachments()   ← 最近读取的文件 (top 5)
  │     createAsyncAgentAttachmentsIfNeeded() ← 异步 Agent 状态
  │   ])
  │   + createPlanAttachmentIfNeeded()       ← Plan 文件
  │   + createPlanModeAttachmentIfNeeded()   ← Plan Mode 指令
  │   + createSkillAttachmentIfNeeded()      ← 已调用技能
  │   + getDeferredToolsDeltaAttachment()    ← 延迟工具 Schema
  │   + getAgentListingDeltaAttachment()     ← Agent 列表
  │   + getMcpInstructionsDeltaAttachment()  ← MCP 指令
  │
  │ Phase 5: Session Start Hooks
  │   processSessionStartHooks('compact')    ← 恢复 CLAUDE.md 等上下文
  │
  │ Phase 6: Boundary Marker 创建
  │   boundaryMarker = createCompactBoundaryMessage(
  │     trigger, preCompactTokenCount, lastMsgUuid
  │   )
  │   preCompactDiscoveredTools → 保留工具发现状态
  │
  │ Phase 7: 遥测 & 清理
  │   logEvent('tengu_compact', { ... 30+ 指标 })
  │   notifyCompaction() → 重置缓存基线
  │   reAppendSessionMetadata() → 保持 --resume 可用
  │   executePostCompactHooks()
  │
  └─ return CompactionResult {
       boundaryMarker,       ← 压缩边界标记
       summaryMessages,      ← [user 消息含摘要]
       attachments,          ← 恢复附件
       hookResults,          ← SessionStart Hook 结果
       preCompactTokenCount, ← 压缩前 Token 数
       postCompactTokenCount,← 压缩 API 调用的 Token 使用
       truePostCompactTokenCount ← 压缩后实际上下文大小
     }
```

### 4.2 PTL 重试算法 (truncateHeadForPTLRetry)

```
当压缩请求本身触发 PromptTooLong 时:

  1. 按 API Round 分组 (groupMessagesByApiRound)
     分组规则: 每当新的 assistant message.id 出现 → 新组
     
  2. 计算需要丢弃的组数:
     if tokenGap 可解析:
       从最老的组开始累积, 直到累积 Token >= tokenGap
     else:
       丢弃 20% 的组 (保守 fallback)
     
  3. 约束: 至少保留 1 组用于摘要
  
  4. 如果丢弃后第一条是 assistant:
     → 插入 synthetic user marker (API 要求首条必须是 user)
     
  最多重试: MAX_PTL_RETRIES = 3
```

### 4.3 streamCompactSummary 的双路径执行

```
streamCompactSummary():
  │
  ├─ Path A: Forked Agent (Cache Sharing) — 默认启用
  │   目的: 复用主对话的 Prompt Cache (系统提示+工具+消息前缀)
  │   
  │   runForkedAgent({
  │     promptMessages: [summaryRequest],
  │     cacheSafeParams,      ← 包含主对话的消息用于缓存配
  │     maxTurns: 1,
  │     skipCacheWrite: true, ← 不写新缓存 (避免 cache 泄漏)
  │   })
  │   
  │   关键约束: 不设 maxOutputTokens
  │     → 因为 fork 必须使用与主线程相同的 thinking config
  │     → 设置 maxOutputTokens 会改变 budget_tokens 计算
  │     → 导致 thinking config 不匹配 → cache bust
  │
  │   失败时 → 自动 fallback 到 Path B
  │
  └─ Path B: Regular Streaming (Fallback)
     queryModelWithStreaming({
       systemPrompt: ['You are a helpful AI assistant...'],
       thinkingConfig: { type: 'disabled' },
       tools: [FileReadTool, ToolSearchTool?, ...mcpTools],
       maxOutputTokensOverride: COMPACT_MAX_OUTPUT_TOKENS,
       querySource: 'compact',
     })
     
     重试: MAX_COMPACT_STREAMING_RETRIES = 2
     Session Activity Keep-Alive: 每 30s 发送一次心跳
       → 防止远程 WebSocket 空闲超时
```

### 4.4 压缩后附件恢复策略

```
Post-Compact File Restoration:
  排序: 按最近访问时间降序
  限制: 最多 5 个文件 (POST_COMPACT_MAX_FILES_TO_RESTORE)
  单文件上限: 5,000 tokens (POST_COMPACT_MAX_TOKENS_PER_FILE)
  总预算: 50,000 tokens (POST_COMPACT_TOKEN_BUDGET)
  
  排除项:
    ├─ Plan 文件 (单独通过 planAttachment 注入)
    ├─ CLAUDE.md 记忆文件 (通过 SessionStart Hooks 注入)
    └─ 已在 preservedMessages 中的文件 (dedup)

Skill 恢复:
  排序: 按 invokedAt 降序 (最近使用优先)
  单技能上限: 5,000 tokens (截断保留头部)
  总预算: 25,000 tokens (POST_COMPACT_SKILLS_TOKEN_BUDGET)
  截断标记: '[... skill content truncated for compaction]'
```

---

## 5. Partial Compact 部分压缩 (compact.ts L772-1106)

```
partialCompactConversation(allMessages, pivotIndex, context, direction):
  │
  ├─ direction = 'from' (默认):
  │   压缩 allMessages[pivotIndex:]
  │   保留 allMessages[:pivotIndex]
  │   → Prompt Cache 友好 (保留前缀不变)
  │
  └─ direction = 'up_to':
      压缩 allMessages[:pivotIndex]
      保留 allMessages[pivotIndex:]
      → Prompt Cache 失效 (摘要插入到保留消息之前)
      → 保留消息需过滤掉旧 compact boundaries

  messagesToKeep 处理:
    'from': 保留原始消息 (仅过滤 progress 类型)
    'up_to': 过滤 progress + 旧 compact boundaries + 旧 compact summaries
    
  Boundary 注解:
    annotateBoundaryWithPreservedSegment(boundary, anchorUuid, messagesToKeep)
    → 在 boundary 上记录 preservedSegment { headUuid, anchorUuid, tailUuid }
    → 用于 session loader 在加载时修补消息链
```

---

## 6. Session Memory Compact (sessionMemoryCompact.ts)

### 6.1 核心理念

Session Memory Compact 是 Claude-Code 的**实验性优化路径**，利用已有的 Session Memory (由 `extractMemories` 模块在每个 Turn 后台提取) 替代昂贵的 LLM 摘要 API 调用。

```
传统 Compact:
  messages → LLM API 调用 (3419行 claude.ts) → summary → 替换 messages
  成本: 完整 API 调用 (input_tokens ≈ preCompactTokenCount)

Session Memory Compact:
  messages → 读取已有 SessionMemory 文件 → 替换 messages
  成本: 零 API 调用 (文件 I/O only)
```

### 6.2 触发条件

```
trySessionMemoryCompaction(messages, agentId, autoCompactThreshold):
  │
  ├─ Gate 1: shouldUseSessionMemoryCompaction()
  │   → tengu_session_memory 且 tengu_sm_compact 两个 Feature Flag 都为 true
  │
  ├─ Gate 2: waitForSessionMemoryExtraction()
  │   → 等待进行中的 SM 提取完成 (带超时)
  │
  ├─ Gate 3: sessionMemory 文件存在且非空模板
  │
  ├─ Case A: lastSummarizedMessageId 存在 (正常场景)
  │   → 精确定位已被摘要覆盖的消息边界
  │
  └─ Case B: 无 lastSummarizedMessageId (恢复的 session)
     → 所有消息都被视为可压缩
```

### 6.3 消息保留算法

```
calculateMessagesToKeepIndex(messages, lastSummarizedIndex):
  config = {
    minTokens: 10_000,             // 保留最少 10K tokens
    minTextBlockMessages: 5,        // 保留最少 5 条含文本的消息
    maxTokens: 40_000,             // 保留最多 40K tokens (hard cap)
  }
  
  startIndex = lastSummarizedIndex + 1
  
  从 startIndex 开始向后扫描:
    totalTokens += estimateMessageTokens([msg])
    textBlockMessageCount++ (if hasTextBlocks(msg))
    
  if totalTokens >= maxTokens → 返回
  if totalTokens >= minTokens && textBlocks >= minTextBlocks → 返回
  
  否则向前扩展 (直到 min 条件满足 或 maxTokens 达到):
    floor = 最后一个 compact boundary + 1 (不跨越压缩边界)
    for i = startIndex-1 downto floor:
      totalTokens += estimateMessageTokens([msg])
      if totalTokens >= maxTokens → break
      if totalTokens >= minTokens && textBlocks >= minTextBlocks → break
  
  最后: adjustIndexToPreserveAPIInvariants()
    → 确保 tool_use/tool_result 配对完整
    → 确保 thinking block 与同 message.id 的 assistant 消息不分离
```

### 6.4 API 不变量保护

```
adjustIndexToPreserveAPIInvariants(messages, startIndex):
  │
  │ 问题 1: Orphaned tool_result
  │   session storage 中:
  │     Index N:   assistant [tool_use: ID_A]
  │     Index N+1: user [tool_result: ID_A]
  │   如果 startIndex = N+1 → tool_result 找不到对应 tool_use
  │   修复: 向前扫描, 包含匹配的 assistant 消息
  │
  │ 问题 2: Divided thinking blocks
  │   streaming 产生:
  │     Index N:   assistant (message.id=X) [thinking]
  │     Index N+1: assistant (message.id=X) [tool_use]
  │   如果 startIndex = N+1 → thinking 与 tool_use 分离
  │   修复: 向前扫描同 message.id 的 assistant 消息
  │
  └─ 返回 adjustedIndex (总是 <= 原始 startIndex)
```

---

## 7. 压缩 Prompt 模板 (prompt.ts)

### 7.1 Prompt 结构

```
完整压缩 Prompt = NO_TOOLS_PREAMBLE + BASE_COMPACT_PROMPT + [custom] + NO_TOOLS_TRAILER

NO_TOOLS_PREAMBLE (强制无工具):
  "CRITICAL: Respond with TEXT ONLY. Do NOT call any tools."
  原因: Sonnet 4.6+ adaptive-thinking 模型在有工具 Schema 时
        仍尝试 tool_call, 被 deny 后无文本输出 → fallback 率 2.79%
  
BASE_COMPACT_PROMPT (9 节摘要指令):
  1. Primary Request and Intent
  2. Key Technical Concepts
  3. Files and Code Sections (含完整代码片段)
  4. Errors and fixes
  5. Problem Solving
  6. All user messages (非 tool_result 的用户消息)
  7. Pending Tasks
  8. Current Work (最近工作的精确描述)
  9. Optional Next Step (含最近对话的 verbatim 引用)

NO_TOOLS_TRAILER (尾部强化):
  "REMINDER: Do NOT call any tools..."
```

### 7.2 <analysis> 作为 Drafting Scratchpad

```
LLM 被指令在 <summary> 之前先输出 <analysis>:
  → <analysis> 是"草稿纸", 帮助 LLM 组织思维确保完整性
  → formatCompactSummary() 在最终摘要中 strip 掉 <analysis>
  → 仅 <summary> 内容被注入到压缩后的上下文中
  
设计意义: LLM "先分析后总结" 显著提升摘要质量
          但 <analysis> 本身是冗余的, 不应占用后续上下文空间
```

### 7.3 Partial Compact 的三种 Prompt 变体

| 变体 | 场景 | 分析指令 | 关键差异 |
|---|---|---|---|
| `BASE_COMPACT_PROMPT` | 全量压缩 | `INSTRUCTION_BASE` | "conversation so far" |
| `PARTIAL_COMPACT_PROMPT` | direction='from' | `INSTRUCTION_PARTIAL` | "RECENT portion", 排除保留的早期消息 |
| `PARTIAL_COMPACT_UP_TO_PROMPT` | direction='up_to' | `INSTRUCTION_BASE` | 第 9 节改为 "Context for Continuing Work" |

---

## 8. Post-Compact Cleanup (postCompactCleanup.ts)

```
runPostCompactCleanup(querySource):
  │
  ├─ 判断: isMainThreadCompact
  │   querySource === undefined || startsWith('repl_main_thread') || === 'sdk'
  │   原因: 子 Agent 与主线程共享模块级状态, 只有主线程可安全重置
  │
  ├─ resetMicrocompactState()          ← 清除 Cached MC 追踪状态
  ├─ resetContextCollapse()            ← [仅主线程] 重置上下文折叠
  ├─ getUserContext.cache.clear()      ← [仅主线程] 清除记忆 memoize 缓存
  ├─ resetGetMemoryFilesCache()        ← [仅主线程] 重置记忆文件缓存
  ├─ clearSystemPromptSections()       ← 清除 Section Registry 缓存
  ├─ clearClassifierApprovals()        ← 清除分类器审批记录
  ├─ clearSpeculativeChecks()          ← 清除 Bash 推测性检查
  ├─ clearBetaTracingState()           ← 清除 Beta 追踪
  ├─ sweepFileContentCache()           ← [COMMIT_ATTRIBUTION] 清理文件内容缓存
  └─ clearSessionMessagesCache()       ← 清除 session 消息缓存
  
  **不重置**: sentSkillNames
    → 避免重新注入 ~4K tokens 的 skill_listing (纯 cache_creation 浪费)
    → 模型仍有 SkillTool Schema + invoked_skills 附件
```

---

## 9. CompactionResult 数据结构

```typescript
CompactionResult = {
  boundaryMarker: SystemMessage      // compact_boundary 标记消息
    compactMetadata: {
      trigger: 'auto' | 'manual'
      preCompactTokenCount: number
      preCompactDiscoveredTools?: string[]  // 保留工具发现状态
      preservedSegment?: {                 // SM-compact 独有
        headUuid, anchorUuid, tailUuid
      }
    }
  summaryMessages: UserMessage[]         // 含格式化摘要的 user 消息
    isCompactSummary: true
    isVisibleInTranscriptOnly: true
  attachments: AttachmentMessage[]       // 文件/Plan/Skill 恢复附件
  hookResults: HookResultMessage[]       // SessionStart hook 结果
  messagesToKeep?: Message[]             // SM-compact/Partial: 保留的原始消息
  preCompactTokenCount?: number          // 压缩前 Token 数
  postCompactTokenCount?: number         // 压缩 API 调用 Token 使用量
  truePostCompactTokenCount?: number     // 压缩后实际上下文大小
  compactionUsage?: TokenUsage           // 压缩 API 的 usage 统计
}

buildPostCompactMessages(result):
  → [boundary, ...summaries, ...messagesToKeep, ...attachments, ...hookResults]
```

---

## 10. 核心设计模式归纳

### 10.1 瀑布式降级 Pipeline

七级压缩按成本递增排列：确定性操作 → Session Memory (文件 I/O) → LLM 摘要 → 反应式 LLM 摘要。每级独立判断是否需要执行，低成本手段优先消耗上下文压力。

### 10.2 PTL 自救循环

压缩请求本身可能因上下文过大而 PTL。Claude-Code 通过 `groupMessagesByApiRound` 按 API Round 分组，然后从最老的 Round 开始丢弃，最多重试 3 次。这是 "压缩无法压缩的上下文" 的递归问题的工程解法。

### 10.3 Forked Agent Cache Sharing

压缩 LLM 调用通过 `runForkedAgent` 复用主对话的 Prompt Cache 前缀，避免为压缩请求单独构建缓存 (~50-70K tokens 的 cache_creation 开销)。但代价是不能设置 `maxOutputTokens` (否则 thinking config 不匹配)。

### 10.4 Session Memory 作为 Zero-Cost Compact

SM-compact 的核心洞察：Session Memory 已经是 LLM 驱动的对话摘要 (由 `extractMemories` 在每个 Turn 后台提取)。用已有的 SM 替代额外的 LLM 调用进行压缩，理论上实现零 API 成本的上下文压缩。

### 10.5 子 Agent 状态隔离

`postCompactCleanup` 精确区分主线程和子 Agent 的清理范围。子 Agent 共享进程级模块状态 (context-collapse store, getMemoryFiles cache, getUserContext cache)，只有主线程 compact 才能安全重置这些状态。

---

## 11. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| 七级瀑布式 Pipeline | 设计分层上下文管理策略，确定性手段优先 |
| Circuit Breaker (3次) | 对重复失败的操作实施断路器，避免 API 浪费 |
| PTL 自救循环 | 为压缩请求本身预留错误恢复路径 |
| Forked Agent Cache Sharing | 子 Agent 调用复用主对话缓存，最大化 cache 命中率 |
| Session Memory Zero-Cost Compact | 利用后台记忆提取结果替代显式 LLM 摘要调用 |
| API 不变量保护 | 压缩前验证 tool_use/tool_result 配对和 message.id 分组完整性 |
| Post-Compact Attachment Restoration | 压缩后主动恢复关键上下文 (文件/Plan/Skill/Agent 状态) |
| 主线程 vs 子 Agent 状态隔离 | 共享进程模块状态的清理必须区分调用上下文 |
| <analysis> Drafting Scratchpad | 利用 LLM 的 "先分析后输出" 在不增加上下文消耗的前提下提升摘要质量 |

> [!IMPORTANT]
> **关键发现**: 压缩引擎的代码总量约 3700 行 (compact.ts 1706 + autoCompact.ts 352 + microCompact.ts 531 + sessionMemoryCompact.ts 631 + prompt.ts 375 + misc ~100)。其中**约 40% 的代码用于处理边界条件**——PTL 自救、Session Memory fallback、子 Agent 状态隔离、API 不变量保护。这验证了生产级上下文管理系统中，"正常路径只是冰山一角" 的工程现实。KyberKit 应在上下文管理的初期设计中就为边界条件预留架构空间。
