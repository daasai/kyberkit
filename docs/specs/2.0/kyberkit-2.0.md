# KyberKit v2.0 架构升级建议 — 基于 DeepCC 14 章逆向工程综合分析

## 1. 背景与定位变迁

### 1.1 定位重定义

```
v1.2 (旧): "面向知识工作者的 Agent 助手底座" — 运行时基础设施
v2.0 (新): "面向知识工作者的 AI Agent Harness 框架" — 用户在使用中持续构建专属 Agent
```

**核心差异**: 从 "Developer builds Agent on KK" 转变为 "User grows Agent through KK"。框架的第一受众从**开发者**变为**知识工作者**，核心价值从**运行时可靠性**变为**资产积累与个性化演进**。

### 1.2 用户资产模型

新定位明确了 6 类用户可积累资产:

| 资产类型 | 定义 | 生命周期 | 积累方式 |
|----------|------|----------|----------|
| **Skills** | 领域工作流封装 (Markdown) | 持久 | 用户编写 / Agent 建议 |
| **Tools** | 原子能力 (MCP/Shell/函数) | 持久 | 开发者集成 / MCP 发现 |
| **Memories** | 领域知识与偏好 | 持久 (分层) | Agent 自动提取 / 用户手动 |
| **Commands** | 快捷交互指令 (/) | 持久 | 用户定义 / 内置 |
| **Prompts** | 行为规范与角色定义 | 持久 | 用户编写 (KK.md) |
| **Contexts** | 动态环境信息源 | 会话级 | 自动感知 / 声明注册 |

---

## 2. Gap Analysis: 当前 KyberKit vs DeepCC 实践

> [!IMPORTANT]
> 以下分析基于 14 章逆向工程文档与 KyberKit 现有 72 个源文件 (~5061 行) 的对比。

### 2.1 严重缺失 (Critical Gaps)

| 领域                | DeepCC 实现                                             | KyberKit 现状                | 影响             |
| ----------------- | ----------------------------------------------------- | -------------------------- | -------------- |
| **流式 Agent Loop** | `query()` async generator，流式处理 LLM 输出 + 流式工具执行        | `model.chat()` 批量调用，串行工具执行 | 用户无法看到实时响应，延迟高 |
| **动态 Prompt 组装**  | `getSystemPrompt()` 运行时组装，分段缓存控制                      | 静态 `systemPrompt` 字符串拼接    | 无法支持用户资产注入     |
| **上下文压缩**         | 6 级压缩 Pipeline（LLM 摘要 + 微压缩 + Session Memory Compact） | ✅ Sprint 4 已落地：`CompactionGuard` + `LLMSummaryCompactor` + `SessionMemoryCompactor` 双档策略，`/compact` 手动命令可用 | — |
| **记忆提取**          | `extractMemories` + `SessionMemory` 双引擎自动提取           | ✅ Sprint 4 已落地：`SessionMemoryExtractor` + `LongTermMemoryExtractor` 由 `MemoryTriggerMiddleware` 按阈值与节流自动触发，结果落盘 `.kyberkit/memories/` Markdown | — |
| **Hook/插件系统**     | 三层 Hook（PostSampling / Events / AsyncRegistry）        | 仅 EventBus 广播              | 用户无法扩展行为       |
| **环境感知**          | `CLAUDE.md` 多级目录扫描 + Git/OS/IDE 自动检测                  | 完全缺失                       | Agent 不了解工作环境  |

### 2.2 部分缺失 (Significant Gaps)

| 领域 | DeepCC 实现 | KyberKit 现状 | 影响 |
|------|------------|---------------|------|
| **流式工具执行** | `StreamingToolExecutor` 并发执行，concurrent slot 模型 | 串行 `for...of toolCalls` | 多工具场景延迟倍增 |
| **Token 预算管理** | 动态 `max_tokens` 计算 + 输出预算 + Turn 级别追踪 | 无预算概念 | 无法控制成本和上下文利用率 |
| **Prompt Cache** | `cache_control` 分段标记 + Sticky-On Latch + Break 检测 | 完全缺失 | API 成本浪费 |
| **Command 系统** | ~80 个斜杠命令，热加载 | 完全缺失 | 用户无法快捷操作 |
| **Session 恢复** | Checkpoint + Session 文件 + Conversation Recovery | 基础 CheckpointManager | 长任务恢复不可靠 |

### 2.3 设计方向偏差 (Design Misalignment)

| 领域 | 当前设计 | 问题 | 建议方向 |
|------|---------|------|---------|
| **ToolDefinition 接口** | 要求实现 8 个方法 (description/call/isConcurrencySafe/isReadOnly 等) | 对知识工作者定义 Tool 门槛过高 | 分离 Schema (声明式) 和 Implementation (函数) |
| **Memory 三层架构** | Working/Session/LongTerm 三层 MemoryStore | 层级划分正确，但路由规则 "所有 learn() 写入全部三层" 不合理 | 参考 DeepCC: Working = 上下文窗口内容，Session = 结构化笔记，LongTerm = 跨会话提取 |
| **Phase 分层** | Phase 0-4 工程分阶段 | 分阶段适合开发者视角，但新定位下用户从第一天就需要 Memory + Prompt + Skill | 重新划分为 "Day 1 体验" 必需模块 |
| **ModelProvider 接口** | 极简 chat/chatStream | 缺少 Prompt Cache 控制、Usage 追踪、多模型路由 | 扩展为 Gateway 模式 |

---

## 3. 升级建议: 七大架构变更

### 3.1 [变更 A] 用户资产注册表 (User Asset Registry)

**问题**: 新定位的 6 类用户资产没有统一的发现、加载、注册、热更新机制。

**设计**:

```
.kyberkit/                          ← 用户级资产目录 (~/.kyberkit/)
├── KK.md                           ← 全局行为规范 (Prompts)
├── memories/                       ← 持久记忆 (Memories)
│   ├── MEMORY.md                   ← 记忆索引 (自动维护)
│   ├── user/                       ← 用户偏好
│   ├── project/                    ← 项目知识
│   └── reference/                  ← 参考资料
├── skills/                         ← 用户技能 (Skills)
│   └── weekly-report/SKILL.md
├── commands/                       ← 自定义命令 (Commands)
│   └── summarize.yaml
└── contexts/                       ← 上下文源声明 (Contexts)
    └── jira-board.yaml

项目级:
.kyberkit/                          ← 项目级资产 (项目根目录)
├── KK.md                           ← 项目行为规范
├── memories/
├── skills/
└── commands/
```

**核心接口**:

```typescript
interface AssetRegistry {
  /** 扫描并加载所有资产目录 */
  scan(paths: AssetPaths): Promise<AssetManifest>;
  /** 监听文件变更，热更新 */
  watch(paths: AssetPaths, onChange: (event: AssetChangeEvent) => void): Disposable;
  /** 查询资产 */
  query(filter: AssetFilter): AssetEntry[];
  /** 构建 System Prompt 注入块 */
  buildPromptInjection(): PromptSection[];
}

interface AssetPaths {
  user: string;      // ~/.kyberkit/
  project?: string;  // ./.kyberkit/
}
```

**来源**: DeepCC Ch09 (Environment Sensing) — `CLAUDE.md` 多级目录扫描; Ch11 (Memory) — `memoryScan.ts` frontmatter 解析。

---

### 3.2 [变更 B] 动态 Prompt 组装管线 (Prompt Assembly Pipeline)

**问题**: 当前 `systemPrompt` 是静态字符串，无法注入用户资产（Memories, Skills schema, KK.md, 环境信息）。

**设计**:

```
Prompt Assembly Pipeline:

  ┌─────────────────────────────────────────────────┐
  │  Section 1: Identity & Capabilities  [cacheable]│
  │  ── 角色定义 + 模型能力声明                      │
  ├─────────────────────────────────────────────────┤
  │  Section 2: Tool Schemas             [cacheable]│
  │  ── 所有可用 Tools/Skills 的 JSON Schema         │
  ├─────────────────────────────────────────────────┤
  │  Section 3: User Directives          [cacheable]│
  │  ── KK.md (用户级 + 项目级合并)                   │
  ├─────────────────────────────────────────────────┤
  │  Section 4: Memory Context         [uncacheable]│
  │  ── 相关记忆检索结果 (每次请求不同)               │
  ├─────────────────────────────────────────────────┤
  │  Section 5: Environment Snapshot   [uncacheable]│
  │  ── CWD, Git branch, OS, 活跃文件等              │
  └─────────────────────────────────────────────────┘
```

**核心接口**:

```typescript
interface PromptSection {
  id: string;
  content: string;
  cacheable: boolean;      // Anthropic cache_control 标记
  priority: number;        // 预算不足时的剪裁优先级
  source: 'system' | 'user' | 'project' | 'dynamic';
}

interface PromptAssembler {
  /** 注册 section provider */
  register(provider: PromptSectionProvider): void;
  /** 在 Token 预算内组装完整 System Prompt */
  assemble(budget: number, context: AssemblyContext): AssembledPrompt;
}

interface AssembledPrompt {
  sections: PromptSection[];
  totalTokens: number;
  cacheBreakpoints: number[];  // cache_control 插入位置
}
```

**来源**: DeepCC Ch08 (Prompt Builder) — `systemPromptSection()` DSL + `buildEffectiveSystemPrompt()` 组装; Ch13 (State) — 环境信息采集。

---

### 3.3 [变更 C] 流式 Agent Loop 重构 (Streaming Agent Loop)

**问题**: 当前 `AgentLoop.ts` 使用 `model.chat()` 批量调用，用户必须等待完整响应才能看到输出；工具串行执行。

**设计**:

```
新 Agent Loop (async generator + middleware pipeline):

  用户输入
    ↓
  PromptAssembler.assemble()        ← [变更 B]
    ↓
  model.chatStream() → AsyncIterable<StreamEvent>
    ↓
  ┌── StreamProcessor (middleware chain) ──┐
  │  1. TokenCounter middleware            │  ← 实时 Token 追踪
  │  2. ContentAccumulator middleware      │  ← 文本/工具块聚合
  │  3. ToolDispatcher middleware          │  ← 流式工具执行
  │  4. MemoryTrigger middleware           │  ← 记忆提取触发
  │  5. CompactionGuard middleware         │  ← 上下文压缩检查
  │  6. HookRunner middleware              │  ← PostSampling 钩子
  └─────────────────────────────────────────┘
    ↓
  yield StreamEvent (to UI / consumer)
    ↓
  StopCondition check → 继续 or 结束
```

**核心接口**:

```typescript
/** Agent Loop 的核心 — async generator */
async function* agentLoop(
  deps: AgentLoopDeps
): AsyncGenerator<AgentEvent, void, void> {
  while (!isTerminal(deps.state)) {
    const prompt = await deps.assembler.assemble(deps.budget, deps.context);
    
    for await (const chunk of deps.model.chatStream({...})) {
      // Middleware pipeline processes each chunk
      const processed = await deps.pipeline.process(chunk);
      if (processed) yield processed;
    }
    
    // Tool execution phase
    for await (const toolEvent of deps.toolExecutor.executeAll(pendingTools)) {
      yield toolEvent;
    }
    
    // Stop condition check
    if (await deps.stopGuard.shouldStop()) break;
  }
}

/** Middleware 接口 */
interface StreamMiddleware {
  name: string;
  process(event: StreamEvent, next: () => Promise<StreamEvent | null>): Promise<StreamEvent | null>;
}
```

**来源**: DeepCC Ch06 (Agentic Loop) — `query()` async generator; Ch09 (Tool Engine) — `StreamingToolExecutor` 并行执行。

**与当前实现的差异**:
- `model.chat()` → `model.chatStream()` (流式)
- 串行 tool execution → 并行 `ToolExecutor.executeAll()`
- 硬编码逻辑 → Middleware pipeline (可插拔)

---

### 3.4 [变更 D] 记忆自动提取引擎 (Memory Extraction Engine)

**问题**: 当前 `MemoryStore.learn()` 仅支持手动写入。新定位要求 "用户在使用中持续构建 Memories"，需要 Agent 自动从对话中提取有价值的知识。

**设计**:

```
双引擎记忆架构:

  Engine 1: Session Memory (会话笔记)
  ├─ 触发条件: Token 累积 > 阈值 OR 工具调用 > N 次 (每 Turn 评估)
  ├─ 执行方式: Fork 子 Agent (独立 Token 预算，后台运行)
  ├─ 输出格式: 结构化 Markdown (sections: 目标/进度/决策/发现/问题)
  └─ 用途: 上下文压缩时替代 LLM 摘要 (Deterministic fallback)

  Engine 2: Long-term Memory Extractor (持久知识)
  ├─ 触发条件: Query Loop 结束时
  ├─ 执行方式: Fork 子 Agent + 互斥锁 (防并发写入)
  ├─ 分类体系: user (偏好) / project (项目知识) / reference (参考)
  └─ 存储: .kyberkit/memories/ (Markdown + YAML frontmatter)
```

**核心接口**:

```typescript
interface MemoryExtractionEngine {
  /** 评估是否应该触发 Session Memory 提取 */
  shouldExtractSession(metrics: TurnMetrics): boolean;
  /** 执行 Session Memory 提取 (后台) */
  extractSession(messages: Message[], existingNotes: string): Promise<string>;
  
  /** 评估是否应该提取长期记忆 */
  shouldExtractLongTerm(sessionMetrics: SessionMetrics): boolean;
  /** 执行长期记忆提取 */
  extractLongTerm(messages: Message[], existingMemories: MemoryManifest): Promise<MemoryEntry[]>;
}

interface TurnMetrics {
  totalInputTokens: number;
  toolCallCount: number;
  turnNumber: number;
  lastExtractionTurn: number;
}
```

**来源**: DeepCC Ch11 (Memory) — `SessionMemory.shouldExtractMemory()` 触发逻辑; `extractMemories.ts` 长期记忆提取 + 互斥 + 频率节流。

---

### 3.5 [变更 E] 上下文压缩引擎 (Context Compression Engine)

**问题**: 当前完全缺失上下文压缩能力，长对话必然导致 Token 溢出。

**设计**:

```
压缩触发链:

  每次 API 调用前:
    if (contextTokens > threshold):
      1. 尝试 Session Memory Compact (如有 Session Memory 可用)
         → 用已有笔记替代 LLM 摘要调用 (零 API 成本)
      2. 否则: LLM Summary Compact
         → 调用轻量模型压缩早期消息
      3. 保留 API Round 完整性:
         → tool_use 和 tool_result 配对不可拆分
         → 计算 keepIndex 时按 Round 边界对齐
```

**核心接口**:

```typescript
interface ContextCompressor {
  /** 评估是否需要压缩 */
  shouldCompact(messages: Message[], budget: TokenBudget): boolean;
  /** 执行压缩 */
  compact(messages: Message[], options: CompactOptions): Promise<CompactResult>;
}

interface CompactResult {
  /** 压缩后的消息列表 */
  messages: Message[];
  /** 被压缩的摘要 (注入为 system message) */
  summary: string;
  /** 压缩前后 Token 差 */
  tokensSaved: number;
}

interface CompactOptions {
  /** 优先使用 Session Memory (如可用) */
  preferSessionMemory: boolean;
  /** 保留最近 N 个 API Round */
  keepRecentRounds: number;
  /** 压缩用模型 (可使用轻量模型) */
  compactModel?: string;
}
```

**来源**: DeepCC Ch10 (Compression) — `sessionMemoryCompact` 零成本压缩; `grouping.ts` API Round 完整性; `calculateMessagesToKeepIndex` 保留策略。

---

### 3.6 [变更 F] 用户 Hook 与 Command 系统

**问题**: 新定位要求用户可以通过 Commands 快捷操作，通过 Hooks 扩展行为。当前仅有 EventBus 无法支撑。

**设计**:

```
Command 系统:

  /compact          ← 手动触发上下文压缩
  /memory list      ← 查看所有记忆
  /memory add       ← 手动添加记忆
  /skill create     ← 创建新 Skill
  /model switch     ← 切换模型
  /cost             ← 查看本次会话成本
  /export           ← 导出对话
  /help             ← 显示所有命令

  用户自定义: .kyberkit/commands/xxx.yaml
  ├─ name: summarize
  ├─ description: "总结当前对话要点"
  ├─ prompt: "请总结本次对话的关键决策和行动项..."
  └─ allowedTools: [read_file, write_file]

Hook 系统 (三层):

  Layer 1: Internal Hooks (框架内部)
  ├─ PostSampling: 每次 LLM 响应后 (记忆提取、成本追踪)
  ├─ PreToolExecution: 工具执行前 (权限检查、日志)
  └─ OnCompact: 上下文压缩后 (缓存清理)

  Layer 2: Event Hooks (SDK 消费者)
  ├─ SessionStart / SessionEnd
  ├─ ToolUseStart / ToolUseComplete
  └─ MemoryExtracted

  Layer 3: User Hooks (知识工作者)
  ├─ Shell-based: .kyberkit/hooks/pre-tool.sh
  ├─ 协议: JSON stdin/stdout
  └─ 超时控制 + 进程轮询
```

**核心接口**:

```typescript
interface CommandRegistry {
  register(command: Command): void;
  execute(name: string, args: string, context: CommandContext): Promise<CommandResult>;
  list(): Command[];
}

interface Command {
  name: string;
  description: string;
  /** 解析用户输入为结构化参数 */
  parse?(input: string): Record<string, unknown>;
  /** 执行命令 */
  execute(args: Record<string, unknown>, context: CommandContext): Promise<CommandResult>;
  /** 是否在当前上下文中可用 */
  isEnabled?(context: CommandContext): boolean;
}

interface HookRegistry {
  /** 注册内部 hook */
  on<K extends keyof HookEvents>(event: K, handler: HookHandler<K>): Disposable;
  /** 注册用户 shell hook */
  registerShellHook(path: string, config: ShellHookConfig): Promise<void>;
  /** 触发 hook */
  emit<K extends keyof HookEvents>(event: K, payload: HookEvents[K]): Promise<void>;
}
```

**来源**: DeepCC Ch13 (Hooks) — 三层 Hook 系统; DeepCC Ch06 (query.ts) — 内置 commands 架构。

---

### 3.7 [变更 G] LLM Gateway 升级

**问题**: 当前 `ModelProvider` 过于简化，缺少 Prompt Cache、Token 预算、Usage 追踪、多模型路由。

**设计**:

```
ModelProvider → LLMGateway 升级:

  ┌───────────────────────────────┐
  │  LLMGateway                    │
  │  ├─ routeModel(request)       │  ← 根据任务类型选择模型
  │  ├─ chatStream(request)       │  ← 流式调用 (主路径)
  │  ├─ chat(request)             │  ← 批量调用 (兼容)
  │  ├─ applyCacheControl(prompt) │  ← 自动插入 cache breakpoints
  │  ├─ trackUsage(response)      │  ← Token 计费追踪
  │  └─ withRetry(fn, strategy)   │  ← 重试 + Fallback
  └───────────────────────────────┘

  新增能力:
  1. cache_control: 在 AssembledPrompt 的 cacheable sections 上标记
  2. Usage tracking: 每次调用后累积 inputTokens/outputTokens/cacheRead/cacheCreation
  3. Model routing: 主模型 (Sonnet 4) / 压缩模型 (Haiku) / 标题模型 (Haiku)
  4. Fallback: 主模型不可用时降级
```

**来源**: DeepCC Ch07 (LLM Gateway) — `claude.ts` 流式处理管道; Prompt Cache 分段控制; Usage 追踪。

---

## 4. 重构后的 Phase 划分

> [!WARNING]
> 原 Phase 0-4 的线性划分不适合新定位。知识工作者从 Day 1 就需要 Memory + Prompt + Skill 的基础体验。建议重划分为 **"Day 1 Core"** + **"Enhancement"** + **"Scale"**。

```
Day 1 Core (MVP — 目标: 用户可立即开始积累资产)
├── Streaming Agent Loop [变更 C]
│   ├── async generator 核心循环
│   ├── model.chatStream() 流式调用
│   └── 基础 Middleware (TokenCounter, ContentAccumulator, ToolDispatcher)
│
├── Prompt Assembly Pipeline [变更 B]
│   ├── KK.md 加载 (用户级 + 项目级)
│   ├── Tool Schema 注入
│   └── 静态 Section 组装
│
├── User Asset Registry [变更 A]
│   ├── .kyberkit/ 目录结构
│   ├── Skill 加载 (复用现有 SkillRegistry)
│   ├── Memory 目录扫描
│   └── 文件 Watcher (热更新)
│
├── Command System [变更 F 部分]
│   ├── /help, /compact, /memory, /cost
│   └── Command 注册框架
│
├── Tool Integration [现有 Phase 0]
│   ├── ShellExecutor (现有)
│   ├── MCPToolRegistry (现有)
│   └── SkillRegistry (现有)
│
└── LLM Gateway 基础 [变更 G 部分]
    ├── chatStream() 流式接口
    └── Usage tracking

Enhancement (体验升级 — 目标: 长对话可靠性 + 自动知识积累)
├── Context Compression Engine [变更 E]
├── Memory Extraction Engine [变更 D]
├── Prompt Cache 优化 [变更 G 完整]
├── Hook System [变更 F 完整]
├── 并行工具执行 (StreamingToolExecutor)
└── Session 恢复 + Checkpoint (现有, 增强)

Scale (多 Agent + 长时运行)
├── Coordinator Mode (参考 DeepCC Ch12)
├── 并行任务框架 (LocalAgentTask)
├── 安全域 + TrustBroker (现有 Phase 4)
└── 资源管理 (现有 Phase 4)
```

---

## 5. 需要用户决策的问题

> [!IMPORTANT]
> **Q1: UI 选择** — DeepCC 使用深度魔改的 Ink (React for Terminal) 作为 TUI。KyberKit 是选择:
> - (a) 终端 TUI (类 claude-code，面向开发者/高级知识工作者)
> - (b) Web UI (面向更广泛的知识工作者)
> - (c) Headless SDK (仅提供 API，UI 由上层实现)
>
> 这决定了是否需要投入 TUI 渲染层 (DeepCC 仅此层就 ~10K 行)。

> [!IMPORTANT]
> **Q2: 记忆提取的自动化程度** — DeepCC 的 `extractMemories` 使用 Fork Agent 自动提取。需要确认:
> - (a) 全自动: Agent 后台提取，用户无需操作 (DeepCC 模式)
> - (b) 半自动: Agent 建议提取内容，用户确认后持久化
> - (c) 手动: 仅 `/memory add` 命令

> [!IMPORTANT]
> **Q3: 多模型支持优先级** — 当前仅 AnthropicProvider。是否需要在 Day 1 Core 阶段支持:
> - (a) 仅 Anthropic (快速推进)
> - (b) Anthropic + OpenAI (覆盖主流)
> - (c) 通用 Provider SPI + 社区贡献

---

## 6. 与现有代码的兼容性分析

| 现有模块 | 处置 | 说明 |
|---------|------|------|
| `AgentStateMachine.ts` | **保留** | 状态机设计合理，无需变更 |
| `AgentInstance.ts` | **重构** | 需增加 streaming 支持、资产引用 |
| `AgentLoop.ts` | **重写** | 从批量模式改为 async generator + middleware |
| `KyberRuntime.ts` | **重构** | 增加 AssetRegistry、PromptAssembler、HookRegistry 的初始化 |
| `ToolIntegrationFacade.ts` | **保留** | 三层门面设计无需变更 |
| `ShellExecutor.ts` | **保留** | 已有基础实现 |
| `MCPToolRegistry.ts` | **保留** | 已有基础实现 |
| `SkillRegistry.ts` | **保留** | 已有基础实现 |
| `MemoryStore.ts` | **重构** | learn() 路由逻辑需改为分层触发 |
| `SessionMemory.ts` | **重构** | 增加结构化 Markdown 模板 |
| `LongTermMemory.ts` | **重写** (Sprint 4) | 弃用 SQLite，改为 `.kyberkit/memories/<category>/<slug>.md` + YAML frontmatter，委托 `MarkdownMemoryStore` |
| `CheckpointManager.ts` | **保留** | 已有基础实现 |
| `ExceptionHandler.ts` | **保留** | 已有基础实现 |
| `VerificationPipeline.ts` | **保留** | 已有基础实现 |
| `EventBus.ts` | **保留** | 作为 Hook Layer 2 的基础 |
| `types/*.ts` | **扩展** | 新增 Prompt/Command/Hook/Asset 类型 |

**统计**: 保留 11/16 模块，重构 4/16，重写 1/16。现有代码资产保留率 **~70%**。

---

## 7. 验证计划

### 7.1 Day 1 Core 验收标准

```
1. 用户创建 `.kyberkit/KK.md` → Agent 行为符合规范
2. 用户在 .kyberkit/skills/ 创建 Skill → Agent 可调用
3. 对话中使用 /memory add → 下次对话中 Agent 引用该记忆
4. 用户可看到流式输出 (非批量等待)
5. /help 显示所有可用命令
6. /cost 显示当前会话 Token 用量
```

### 7.2 自动化测试

```bash
# 现有测试保持通过
bun test

# 新增集成测试
bun test:integration -- --filter "streaming-loop"
bun test:integration -- --filter "prompt-assembly"
bun test:integration -- --filter "asset-registry"
```
