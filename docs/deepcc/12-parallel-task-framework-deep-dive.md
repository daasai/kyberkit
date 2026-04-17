# DeepCC-12: 并行任务框架与多 Agent 协调深度逆向工程

> 逆向目标:
> - `src/tasks/types.ts` (47行) — TaskState 联合类型定义
> - `src/tasks/LocalAgentTask/LocalAgentTask.tsx` (683行) — 本地 Agent 任务生命周期
> - `src/tasks/LocalMainSessionTask.ts` (480行) — 主 Session 后台化
> - `src/tasks/stopTask.ts` (101行) — 任务停止逻辑
> - `src/coordinator/coordinatorMode.ts` (370行) — Coordinator 模式系统 Prompt

---

## 1. 总体架构：任务体系全景

```
┌──────────────────────────────────────────────────────────────────┐
│                   Claude-Code 并行任务框架                        │
│                                                                  │
│  AppState.tasks: Record<string, TaskState>                       │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ LocalShellTask   │  │ LocalAgentTask   │  │ RemoteAgentTask  │ │
│  │ (Bash 后台命令)  │  │ (子 Agent 执行)  │  │ (远程 Agent)     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐ │
│  │ InProcessTeam-   │  │ MonitorMcpTask   │  │ DreamTask        │ │
│  │ mateTask (进程   │  │ (MCP 监控)       │  │ (记忆整理)       │ │
│  │ 内队友)          │  │                  │  │                  │ │
│  └─────────────────┘  └─────────────────┘  └──────────────────┘ │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ LocalMainSessionTask  (主 Session 后台化 — 特殊子类型)       │ │
│  │ agentType = 'main-session' (复用 LocalAgentTask 状态结构)   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Coordinator Mode:                                               │
│  主 Agent 作为协调器, 通过 AgentTool 派发子 Worker               │
│  子 Worker 完成后通过 <task-notification> XML 报告                │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. TaskState 类型层级

```typescript
TaskState = 
  | LocalShellTaskState     // Bash 后台命令
  | LocalAgentTaskState     // 本地子 Agent
  | RemoteAgentTaskState    // 远程子 Agent
  | InProcessTeammateTaskState  // 进程内队友
  | LocalWorkflowTaskState  // 本地工作流
  | MonitorMcpTaskState     // MCP 监控
  | DreamTaskState          // 记忆整理

BackgroundTaskState = TaskState  // 相同联合类型

isBackgroundTask(task):
  task.status === 'running' || 'pending'
  && !('isBackgrounded' in task && task.isBackgrounded === false)
  → 前台运行的任务不算后台任务
```

---

## 3. LocalAgentTask 核心状态机 (LocalAgentTask.tsx)

### 3.1 状态定义

```typescript
LocalAgentTaskState = TaskStateBase & {
  type: 'local_agent'
  agentId: string                    // 唯一标识
  prompt: string                     // 任务 Prompt
  selectedAgent?: AgentDefinition    // Agent 定义
  agentType: string                  // 'general-purpose' | 'main-session' | ...
  model?: string                     // 指定模型
  abortController?: AbortController  // 取消控制器
  unregisterCleanup?: () => void     // 清理回调
  error?: string                     // 错误信息
  result?: AgentToolResult           // 执行结果
  progress?: AgentProgress           // 进度追踪
  retrieved: boolean                 // 结果是否已取回
  messages?: Message[]               // 消息流
  lastReportedToolCount: number      // 上次报告的工具数
  lastReportedTokenCount: number     // 上次报告的 Token 数
  isBackgrounded: boolean            // 是否已后台化
  pendingMessages: string[]          // 排队中的消息 (SendMessage)
  retain: boolean                    // UI 是否持有 (阻止驱逐)
  diskLoaded: boolean                // Bootstrap 是否已加载 JSONL
  evictAfter?: number                // GC 截止时间戳
}
```

### 3.2 任务生命周期状态机

```
                    ┌─────────────┐
      register      │             │   register
      AsyncAgent ──→│   running   │←── AgentForeground
                    │             │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
            ▼              ▼              ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │completed │  │  failed  │  │  killed  │
      └──────────┘  └──────────┘  └──────────┘
            │              │              │
            └──────────────┼──────────────┘
                           │
                           ▼
                    evictAfter 设定
                    (retain ? 无期限 : PANEL_GRACE_MS)
                           │
                           ▼
                    从 AppState.tasks 中移除
```

### 3.3 注册路径

```
路径 1: registerAsyncAgent (直接后台)
  → isBackgrounded = true
  → 立即注册到 AppState
  → 子 Agent 的 abortController 可设 parentAbortController
    → createChildAbortController 确保父 abort → 子 abort

路径 2: registerAgentForeground (前台 → 可后台)
  → isBackgrounded = false
  → 创建 backgroundSignal Promise
  → backgroundSignalResolvers.set(agentId, resolve)
  → autoBackgroundMs? → setTimeout 自动后台化
  → 完成时: unregisterAgentForeground (如未后台化 → 直接移除)
```

### 3.4 Progress Tracking

```
ProgressTracker:
  toolUseCount: number
  latestInputTokens: number       ← API input_tokens 是累积的, 取最新值
  cumulativeOutputTokens: number  ← output_tokens 是 per-turn 的, 求和

updateProgressFromMessage(tracker, message):
  usage = message.message.usage
  latestInputTokens = input + cache_creation + cache_read
  cumulativeOutputTokens += output
  
  对每个 tool_use block:
    toolUseCount++
    排除 SYNTHETIC_OUTPUT_TOOL (内部工具)
    记录最近 5 个活动 (MAX_RECENT_ACTIVITIES)
    附加 activityDescription (来自 Tool.getActivityDescription)
    附加 isSearch / isRead 分类
```

### 3.5 Pending Messages (SendMessage 队列)

```
queuePendingMessage(taskId, msg, setAppState):
  → task.pendingMessages.push(msg)
  
drainPendingMessages(taskId, getAppState, setAppState):
  → drained = task.pendingMessages
  → task.pendingMessages = []
  → return drained
  
appendMessageToLocalAgent(taskId, message, setAppState):
  → task.messages.push(message)  ← 显示层 (transcript)
  
语义:
  pendingMessages: 路由到 Agent 的 API 输入
  messages: 显示在 transcript 中的消息
  两者独立操作, 不耦合
```

### 3.6 通知与驱逐

```
enqueueAgentNotification():
  │
  ├─ 原子 check-and-set notified flag (防止重复通知)
  ├─ abortSpeculation() ← 后台任务状态变化 → 推测结果可能 stale
  │
  ├─ 构建 XML 通知:
  │   <task-notification>
  │     <task-id>{taskId}</task-id>
  │     <tool-use-id>{toolUseId}</tool-use-id>
  │     <output-file>{outputPath}</output-file>
  │     <status>completed|failed|killed</status>
  │     <summary>{summary}</summary>
  │     <result>{finalMessage}</result>
  │     <usage>...</usage>
  │     <worktree>...</worktree>
  │   </task-notification>
  │
  └─ enqueuePendingNotification({ value, mode: 'task-notification' })

驱逐:
  task terminal → evictAfter = task.retain ? undefined : Date.now() + PANEL_GRACE_MS
  → 超时后从 AppState 中移除
  → evictTaskOutput(taskId) 清理磁盘上的 sidechain JSONL
```

---

## 4. LocalMainSessionTask (主 Session 后台化)

### 4.1 触发条件

```
用户在查询运行时按 Ctrl+B 两次:
  → 当前查询"后台化"
  → UI 清空回到新提示
  → 查询继续在后台运行
  → 完成时发送通知
```

### 4.2 核心实现

```
registerMainSessionTask(description, setAppState, agentDef, existingAbortController):
  taskId = 's' + randomBytes(8)  ← 's' 前缀区分于 Agent 的 'a' 前缀
  
  initTaskOutputAsSymlink(taskId, agentTranscriptPath)
    → 使用隔离的 transcript 文件 (不使用主 session 的)
    → 防止 /clear 后后台查询破坏 post-clear 对话
  
  abortController = existingAbortController ?? createAbortController()
    → 重用现有控制器: 确保 abort 任务 = abort 实际查询
  
  taskState = { ...base, agentType: 'main-session', isBackgrounded: true }

startBackgroundSession({messages, queryParams, description, ...}):
  taskId = registerMainSessionTask(...)
  
  recordSidechainTranscript(messages, taskId)  ← 初始对话持久化
  
  runWithAgentContext(agentContext, async () => {
    for await (const event of query({messages, ...queryParams})) {
      if (abortSignal.aborted) → 处理中途取消
      bgMessages.push(event)
      recordSidechainTranscript([event], taskId, lastUuid)  ← 增量写入
      updateProgressFromMessage(tracker, event)
      setAppState(...)  ← 更新进度
    }
    completeMainSessionTask(taskId, true, setAppState)
  })
```

### 4.3 Foreground / Background 切换

```
foregroundMainSessionTask(taskId, setAppState):
  1. 获取 task.messages (累积的消息)
  2. 恢复之前 foreground 的任务为 background
  3. 设置 foregroundedTaskId = taskId
  4. task.isBackgrounded = false
  → UI 显示该任务的输出

completeMainSessionTask(taskId, success, setAppState):
  if wasBackgrounded:
    → enqueueMainSessionNotification() 发送 XML 通知
  else (foregrounded):
    → 无 XML 通知 (用户正在看)
    → task.notified = true
    → emitTaskTerminatedSdk() (SDK 消费者需要看到结束)
```

---

## 5. Coordinator Mode (coordinatorMode.ts)

### 5.1 启用条件

```
isCoordinatorMode():
  feature('COORDINATOR_MODE')
  && isEnvTruthy(process.env.CLAUDE_CODE_COORDINATOR_MODE)
```

### 5.2 Coordinator 系统 Prompt 结构

```
getCoordinatorSystemPrompt():
  │
  │ Section 1: 角色定义
  │   "You are a coordinator"
  │   "Direct workers to research, implement and verify"
  │   "Answer questions directly when possible — don't delegate trivially"
  │   "Worker results are internal signals — never thank them"
  │
  │ Section 2: 可用工具
  │   AgentTool — 创建新 Worker
  │   SendMessageTool — 继续已有 Worker
  │   TaskStopTool — 停止运行中的 Worker
  │   subscribe_pr_activity — (如果可用) GitHub PR 事件
  │
  │   关键约束:
  │     - 不要用 Worker 检查另一个 Worker
  │     - 不要用 Worker 简单读取文件/执行命令
  │     - 不要设置 model 参数
  │     - 启动后告诉用户启动了什么, 然后结束响应
  │     - 永远不要编造/预测 Agent 结果
  │
  │ Section 3: Worker 类型
  │   subagent_type: 'worker'
  │   Worker 拥有标准工具 + MCP + Skills
  │
  │ Section 4: 任务工作流
  │   ┌──────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐
  │   │ Research  │→│ Synthesis│→│Implementation│→│ Verification │
  │   │ (Workers) │  │ (YOU!)   │  │ (Workers)    │  │ (Workers)    │
  │   └──────────┘  └──────────┘  └──────────────┘  └──────────────┘
  │
  │   并发规则:
  │     只读任务 → 自由并行
  │     写入任务 → 同一文件集串行
  │     验证 → 可与不同区域的实现并行
  │
  │ Section 5: Writing Worker Prompts
  │   "Workers can't see your conversation"
  │   → 每个 Prompt 必须自包含
  │   → 必须综合研究成果, 不能说 "based on your findings"
  │   → 包含目的声明 (purpose statement)
  │   → 根据上下文重叠度选择 Continue vs Spawn
  │
  │ Section 6: 示例 Session
  │   Research → Notification → Synthesis → SendMessage → Fix
  │
  └── Worker Context (用户上下文)
      getCoordinatorUserContext(mcpClients, scratchpadDir):
        → workerToolsContext: Worker 可用工具列表
        → MCP 服务器列表
        → Scratchpad 目录 (跨 Worker 持久共享)
```

### 5.3 Coordinator 的 Synthesis 原则

```
核心反模式:
  ✗ "Based on your findings, fix the auth bug"  (懒惰委托)
  ✗ "The worker found an issue. Please fix it." (模糊转发)

正确做法:
  ✓ "Fix the null pointer in src/auth/validate.ts:42. 
     The user field on Session (src/auth/types.ts:15) is undefined 
     when sessions expire but the token remains cached.
     Add a null check before user.id access — if null, return 401."

原则: Coordinator 必须真正理解研究结果
  → 综合后的 Prompt 应包含具体文件路径、行号、类型签名
  → "证明你理解了" 而非 "让 Worker 理解"
```

### 5.4 Continue vs Spawn 决策矩阵

| 场景 | 机制 | 原因 |
|---|---|---|
| 研究者探索了即将编辑的文件 | **Continue** (SendMessage) | Worker 已有文件上下文 |
| 研究广泛但实现窄深 | **Spawn** (AgentTool) | 避免探索噪声污染 |
| 纠正失败或扩展近期工作 | **Continue** | Worker 有错误上下文 |
| 验证他人写的代码 | **Spawn** | 验证者应有新视角 |
| 首次实现用了错误方法 | **Spawn** | 错误方法上下文会锚定重试 |
| 完全无关的任务 | **Spawn** | 无可复用上下文 |

---

## 6. 任务停止机制 (stopTask.ts)

```
stopTask(taskId, context):
  │
  ├─ Guard: task 存在且 status === 'running'
  │
  ├─ taskImpl = getTaskByType(task.type)
  │   → 从任务注册表查找实现
  │
  ├─ taskImpl.kill(taskId, setAppState)
  │   → LocalAgentTask: abortController.abort() + cleanup
  │   → LocalShellTask: signal SIGTERM/SIGKILL
  │
  ├─ 通知处理:
  │   if LocalShellTask:
  │     → 抑制 "exit code 137" 通知 (噪声)
  │     → 直接 emitTaskTerminatedSdk() (SDK 消费者仍需看到)
  │   if LocalAgentTask:
  │     → 不抑制 (AbortError catch 发送携带 extractPartialResult 的通知)
  │
  └─ return { taskId, taskType, command }
```

---

## 7. 子 Agent 的 Abort 级联

```
Parent-Child Abort 链:

  Coordinator (主线程)
    └─ AbortController (主)
        └─ createChildAbortController(parent)
            └─ Worker Agent 的 AbortController
                └─ 当 parent.abort() → child 自动 abort

registerAsyncAgent({ parentAbortController }):
  abortController = parentAbortController
    ? createChildAbortController(parentAbortController)
    : createAbortController()

  → InProcessTeammate abort → 所有其子 Worker abort
  → ESC 取消 → killAllRunningAgentTasks → 所有 Agent abort
```

---

## 8. 任务通知与消息队列

```
Worker 完成 → enqueueAgentNotification()
  → 构建 <task-notification> XML
  → enqueuePendingNotification({ value, mode: 'task-notification' })
  → 消息队列 → 注入到主 Agent 的下一个 Turn
  → 主 Agent 看到 user-role message 包含 XML
  → 解析后综合结果, 告知用户

关键设计:
  通知通过 user-role message 投递
  → API 要求 assistant/user 交替
  → 通知看起来像用户消息但不是
  → Coordinator Prompt 教模型识别 <task-notification> 标签
```

---

## 9. 设计模式归纳

### 9.1 Foreground/Background 双模态任务

任务不是非此即彼的 "前台" 或 "后台"——它们可以在生命周期中 **动态切换**。`isBackgrounded` flag + `backgroundSignal` Promise 实现了异步的 "放到后台" 操作，而 `foregroundMainSessionTask` 实现了 "拉回前台"。

### 9.2 Coordinator 模式的 "综合即理解"

Coordinator 系统 Prompt 中最核心的设计约束是: **Coordinator 必须真正综合 (synthesize) Worker 的研究结果**。Prompt 显式禁止 "based on your findings" 这类懒惰委托模式，要求 Coordinator 产出包含具体路径/行号的指令。这在 Prompt 层面执行了 "理解 → 指挥" 的单向数据流。

### 9.3 Parent-Child Abort 级联

通过 `createChildAbortController` 建立 AbortController 的父子关系，确保取消操作级联传播。这是 Agent 并行化的基础安全机制——无论是用户按 ESC、父 Agent 被 kill、还是进程退出，所有子 Agent 都会被正确停止。

### 9.4 Notification-as-Message

Worker 完成通知通过 `enqueuePendingNotification` 注入消息队列，最终以 **user-role XML message** 的形式被主 Agent "看到"。这复用了 LLM 的消息处理能力，无需专门的 "任务完成" 处理通道。

### 9.5 Disk-Backed Task Output

每个 Agent Task 通过 `initTaskOutputAsSymlink` 将其 transcript 链接到隔离的文件路径。主 Session 后台化时使用独立路径而非 `getTranscriptPath()`，避免 `/clear` 后后台查询破坏新对话。

---

## 10. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| 7 种 TaskState 联合类型 | 设计可扩展的 Task 类型注册表，支持异构任务 |
| Foreground ↔ Background 动态切换 | 实现 "put-to-background" 和 "bring-to-foreground" 操作 |
| Coordinator Synthesis | 多 Agent 协调中强制综合步骤，禁止盲目转发 |
| Continue vs Spawn 决策 | 提供上下文重叠度评估，指导复用还是新建 |
| Parent-Child Abort 级联 | 使用 AbortController 树实现取消传播 |
| Notification-as-Message | 利用消息队列注入通知，复用 LLM 消息处理能力 |
| ProgressTracker 分离 input/output | API input_tokens 累积 vs output_tokens 增量的正确处理 |
| Scratchpad 目录 | 跨 Worker 的持久共享存储 (无权限提示) |
| Sidechain Transcript | 每个 Task 独立 transcript 文件，支持 /clear 后存活 |

> [!IMPORTANT]
> **核心发现**: Coordinator Mode 的 370 行系统 Prompt 中，**约 40% 用于定义 "Synthesis" 原则**——如何从 Worker 研究结果中提炼出高质量的实现指令。这揭示了多 Agent 系统中最关键的瓶颈不是任务分发或结果收集，而是**中间综合步骤的质量**。KyberKit 的多 Agent 设计应将 "Coordinator 综合" 视为第一等架构决策。
