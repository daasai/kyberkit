# KyberKit：下一代通用 AI Agent 控制论底座 (Harness Framework)

**版本**: 1.2 (工程规范)
**日期**: 2026-04-01
**运行时**: Node.js / Bun (与 Claude Code 技术栈对齐)
**目标用户**: 面向知识工作者的垂直 Agent 底座

---

## 目录

1. [设计哲学与核心原则](#1-设计哲学与核心原则)
2. [目标用户与产品定位](#2-目标用户与产品定位)
3. [总体架构分层](#3-总体架构分层)
4. [Phase 0 — 微内核 (Kernel)](#4-phase-0--微内核-kernel)
5. [Phase 1 — 可靠性层 (Reliability)](#5-phase-1--可靠性层-reliability)
6. [Phase 2 — 可观测性层 (Observability)](#6-phase-2--可观测性层-observability)
7. [Phase 3 — 智能增强层 (Intelligence)](#7-phase-3--智能增强层-intelligence)
8. [Phase 4 — 规模化层 (Scale)](#8-phase-4--规模化层-scale)
9. [三大工程支柱](#9-三大工程支柱)
10. [安全威胁模型](#10-安全威胁模型)
11. [并发与资源管理模型](#11-并发与资源管理模型)
12. [部署模型](#12-部署模型)
13. [分阶段交付路线图](#13-分阶段交付路线图)
14. [附录：关键 SPI 定义](#14-附录关键-spi-定义)

---

## 1. 设计哲学与核心原则

### 1.1 操作系统隐喻 (The OS Metaphor)

KyberKit 定位为"AI Agent 的操作系统"。它不提供智能（那是模型的职责），也不定义业务逻辑（那是垂直 Agent 的职责），而是提供让智能体安全、稳定、高效运行的资源调度、进程管理、设备驱动（工具）和安全隔离。

### 1.2 控制论范式 (Cybernetics Paradigm)

框架本质是一个闭环反馈系统。每个组件设计为可观测、可调节的节点，通过持续收集运行时数据（轨迹）并反馈给系统本身或上游模型训练，形成自我优化的数据飞轮。

### 1.3 轻量与可剥离 (Lightweight & Strippable)

框架核心极度轻量。所有"智能逻辑"（如复杂的编排规则）以可插拔模块或外部配置文件形式存在。当模型能力迭代时，可快速移除过时的编排层，仅保留必要的可靠性基础设施。

### 1.4 可观测性优先 (Observability First)

可观测性（追踪、指标、日志）不是附加功能，而是框架的一等公民和所有组件的基础依赖。

### 1.5 确定性优先 (Deterministic First)

**新增原则**。框架严格区分确定性组件（Deterministic）和概率性组件（Probabilistic）：

- **确定性组件**：凡是能用确定性逻辑（类型校验、AST 分析、正则匹配、状态机）解决的功能，严禁使用 LLM
- **概率性组件**：必须提供 Deterministic Fallback；不得出现在关键路径（Critical Path）上
- **架构图标注**：所有组件在架构图中标注 `[D]` (Deterministic) 或 `[P]` (Probabilistic)

---

## 2. 目标用户与产品定位

### 2.1 核心定位

KyberKit 是面向**知识工作者**的 Agent 助手底座。它作为一系列垂直专用 Agent 的运行时基础设施，与垂直 Agent 一起帮助用户完成事务性工作。

### 2.2 目标垂直场景

| 垂直场景 | Agent 类型 | 典型任务 |
|----------|-----------|---------|
| 代码执行 | Coding Agent | 代码生成、重构、调试、测试 |
| 数据分析 | Analytics Agent | 数据清洗、统计分析、可视化报告 |
| 知识管理 | Knowledge Agent | 文档整理、知识图谱构建、信息检索 |
| 内容创作 | Content Agent | 文案生成、编辑润色、多格式输出 |

### 2.3 设计约束

- **不兼容第三方 Framework**: KyberKit 不提供 LangChain 等第三方 Framework 的适配层。垂直 Agent 直接基于 KyberKit SDK 开发
- **运行时环境**: Node.js / Bun，与 Claude Code 技术栈完全对齐
- **开源策略**: 暂不确定，不影响当前架构设计

---

## 3. 总体架构分层

KyberKit 采用四层架构，明确各层职责：

```
┌─────────────────────────────────────────────────────────┐
│  L4  Agent (智能体)                                      │
│  ── 垂直业务逻辑：Coding / Analytics / Knowledge / Content│
├─────────────────────────────────────────────────────────┤
│  L3  KyberKit SDK (开发套件)                              │
│  ── 构建 Agent 的高级抽象、工具函数、类型定义               │
├─────────────────────────────────────────────────────────┤
│  L2  KyberKit Harness (核心运行时)              ◄ 本框架  │
│  ── 生命周期、工具注册、权限沙箱、状态管理、可观测性         │
├─────────────────────────────────────────────────────────┤
│  L1  Model & Context (模型与上下文)                      │
│  ── 标准化 LLM 接口、上下文窗口管理                       │
└─────────────────────────────────────────────────────────┘
```

**关键约束**：

- 依赖方向严格单向：L4 → L3 → L2 → L1，禁止反向依赖
- L2 是本框架的核心交付物
- L3 SDK 为可选的开发效率层，不提供运行时能力
- L1 通过标准化 `ModelProvider` SPI 接入各类 LLM

---

## 4. Phase 0 — 微内核 (Kernel)

Phase 0 定义 KyberKit 的最小可行内核，是所有后续阶段的基础。

### 4.1 运行时生命周期管理 (Runtime Lifecycle) `[D]`

Agent 实例遵循以下状态机：

```
                    ┌──────────────────────────────┐
                    │                              │
     ┌──────┐   start()   ┌──────────────┐  ready  ┌─────────┐
     │Created├────────────►│ Initializing ├────────►│ Running │
     └──────┘             └──────┬───────┘         └────┬────┘
                                 │                      │
                           init_error              ┌────┴────┐
                                 │          pause()│         │task_done
                                 ▼                 ▼         ▼
                            ┌────────┐       ┌────────┐ ┌───────────┐
                            │ Failed │       │ Paused │ │Completing │
                            └────────┘       └───┬────┘ └─────┬─────┘
                                                 │            │
                                          resume()│    ┌───────┴───────┐
                                                 │    │verified       │verification_failed
                                                 ▼    ▼               ▼
                                            ┌─────────┐         ┌─────────┐
                                            │ Running │         │ Running │
                                            └─────────┘         └─────────┘
                            
     任意运行态 ──── kill() ────► Killed
```

**状态定义**：

```typescript
type AgentStatus =
  | 'created'       // 实例已创建，尚未初始化
  | 'initializing'  // 正在加载配置、注册工具、建立模型连接
  | 'running'       // 正常执行任务
  | 'paused'        // 暂停执行（等待人工输入或资源释放）
  | 'completing'    // 任务声称完成，正在执行验证循环
  | 'completed'     // 验证通过，任务完成
  | 'failed'        // 不可恢复的异常
  | 'killed'        // 外部强制终止

function isTerminalStatus(status: AgentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}
```

**生命周期 Hook**：

```typescript
interface LifecycleHooks {
  onCreated?(agent: AgentInstance): Promise<void>;
  onInitialized?(agent: AgentInstance): Promise<void>;
  onRunning?(agent: AgentInstance): Promise<void>;
  onPaused?(agent: AgentInstance, reason: PauseReason): Promise<void>;
  onResumed?(agent: AgentInstance): Promise<void>;
  onCompleting?(agent: AgentInstance, result: TaskResult): Promise<void>;
  onCompleted?(agent: AgentInstance, result: VerifiedResult): Promise<void>;
  onFailed?(agent: AgentInstance, error: AgentError): Promise<void>;
  onKilled?(agent: AgentInstance, reason: KillReason): Promise<void>;
}
```

### 4.2 工具集成层 (Tool Integration Layer) `[D]`

工具集成层支持三个抽象层级，**每个层级都是一等公民**：

```
┌─────────────────────────────────────────────────────┐
│  L2 意图层 — Skill Registry                         │  "完成一个任务"
│  ── 领域工作流封装 (Markdown + YAML Frontmatter)     │  面向知识工作者
│  ── 内部可调用 MCP Tools + Shell                    │
├─────────────────────────────────────────────────────┤
│  L1 能力层 — MCP Tool Registry                      │  "调用一个能力"
│  ── 标准化跨进程工具协议 (JSON Schema + RPC)        │  面向集成开发者
│  ── 动态发现、安全隔离（进程边界）                   │
├─────────────────────────────────────────────────────┤
│  L0 原语层 — Shell Executor                         │  "执行一个命令"
│  ── 任意 Shell 命令执行                              │  面向系统操作
│  ── 最大灵活性 + 最大安全防护成本                    │
└─────────────────────────────────────────────────────┘

依赖方向：Skill → MCP → Shell（单向，禁止反向调用）
```

> **设计依据**: Claude Code 源码分析表明，BashTool (~500KB，其中 87% 为安全防护代码)、
> MCP (~300KB，完整 RPC 协议栈)、Skills (~90KB，Markdown 工作流引擎) 三者在功能上不可替代、
> 层级上互补。将 MCP 独立作为唯一一等公民是不充分的。知识工作者场景下，Skills（意图层）
> 对领域知识沉淀和工作流复用的价值尤为关键。

#### 4.2.1 统一门面 (Tool Integration Facade)

```typescript
/** 工具集成层的统一入口 */
interface ToolIntegrationFacade {
  /** 原语层：Shell 执行 */
  readonly shell: ShellExecutor;
  /** 能力层：MCP 工具注册表 */
  readonly mcp: MCPToolRegistry;
  /** 意图层：Skill 注册表 */
  readonly skills: SkillRegistry;
  /** 统一查询：跨三层搜索工具/技能 */
  findTool(query: string): ToolDefinition | SkillDefinition | null;
  /** 统一工具列表（合并三层） */
  listAll(filter?: ToolFilter): Array<ToolDefinition | SkillDefinition>;
}
```

#### 4.2.2 L0 原语层 — Shell Executor `[D]`

提供系统命令执行的基础设施，包含严格的安全防护：

```typescript
interface ShellExecutor {
  /** 执行 Shell 命令 */
  exec(command: string, options: ShellOptions): Promise<ShellResult>;
  /** 后台执行（长时运行命令） */
  execBackground(command: string, options: ShellOptions): Promise<BackgroundTask>;
  /** 只读命令检测 */
  isReadOnly(command: string): boolean;
  /** 破坏性命令检测 */
  isDestructive(command: string): boolean;
}

interface ShellOptions {
  /** 超时 (ms) */
  timeoutMs?: number;
  /** 工作目录 */
  cwd?: string;
  /** 是否启用沙箱 */
  sandbox?: boolean;
  /** 结果大小上限 (chars) */
  maxResultSizeChars?: number;
}

interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  interrupted: boolean;
}
```

> **安全约束**: Shell Executor 是攻击面最大的组件。必须内置：
> - 命令 AST 解析与安全分析
> - 路径逃逸检测
> - 只读/破坏性命令分类
> - 可选的进程沙箱化执行（参考 Claude Code 的 SandboxManager）

#### 4.2.3 L1 能力层 — MCP Tool Registry `[D]`

内置 Model Context Protocol (MCP) 的完整客户端支持：

```typescript
interface MCPToolRegistry {
  /** 连接 MCP Server */
  connect(server: MCPServerConfig): Promise<MCPConnection>;
  /** 断开连接 */
  disconnect(serverName: string): Promise<void>;
  /** 获取所有已连接 Server 暴露的工具 */
  listTools(): ToolDefinition[];
  /** 按名称查找工具 */
  findTool(name: string): ToolDefinition | undefined;
  /** 热加载/卸载 MCP Server（无需重启 Agent） */
  reload(serverName: string): Promise<void>;
  /** 连接状态变更事件 */
  onConnectionChanged(listener: (event: MCPConnectionEvent) => void): Disposable;
}

interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'streamable-http';
  command?: string;                 // stdio transport
  url?: string;                     // HTTP transport
  auth?: MCPAuthConfig;             // OAuth 配置
  /** 该 Server 的信任级别 */
  trustLevel: 'trusted' | 'sandboxed' | 'untrusted';
}
```

#### 4.2.4 L2 意图层 — Skill Registry `[D]`

Skill 是领域知识与工作流的声明式封装。面向知识工作者的 KyberKit 中，
Skill 是团队专家知识编码的核心载体。

```typescript
interface SkillRegistry {
  /** 从目录加载 Skills (skill-name/SKILL.md 格式) */
  loadFromDirectory(path: string, source: SkillSource): Promise<void>;
  /** 注册内置 Skill */
  registerBundled(definition: BundledSkillDefinition): void;
  /** 按名称查找 */
  find(name: string): SkillDefinition | undefined;
  /** 列出所有已注册 Skills */
  list(filter?: SkillFilter): SkillDefinition[];
  /** 条件激活：当触碰到匹配路径的文件时自动激活 */
  activateConditional(touchedPaths: string[]): SkillDefinition[];
  /** Skill 变更事件 */
  onChanged(listener: (event: SkillChangeEvent) => void): Disposable;
}

/** Skill 定义 (Markdown + YAML Frontmatter) */
interface SkillDefinition {
  name: string;
  displayName?: string;
  description: string;
  /** 模型何时应该调用此 Skill 的语义提示 */
  whenToUse?: string;
  /** 该 Skill 可调用的工具白名单 */
  allowedTools: string[];
  /** 条件激活路径模式 (glob) */
  activationPaths?: string[];
  /** 执行模式 */
  executionMode: 'inline' | 'fork';
  /** inline: 将 Prompt 注入当前上下文 */
  /** fork:   在独立子代理中执行（隔离上下文，有独立 Token 预算） */
  /** 使用哪个 Agent 角色执行 (仅 fork 模式) */
  agent?: string;
  /** 模型配置覆盖 */
  model?: string;
  /** 生命周期钩子 */
  hooks?: SkillHooks;
  /** 来源 */
  source: SkillSource;
  /** 执行逻辑：返回 Prompt 内容 */
  execute(args: string, context: ToolUseContext): Promise<SkillResult>;
}

type SkillSource =
  | 'bundled'     // 框架内置
  | 'user'        // 用户级 (~/.kyberkit/skills/)
  | 'project'     // 项目级 (.kyberkit/skills/)
  | 'plugin'      // 插件提供
  | 'mcp';        // MCP Server 提供
```

> **Skill 与 MCP Tool 的区别**:
> - MCP Tool 回答"我能做什么"（能力声明），Skill 回答"如何完成某个任务"（工作流封装）
> - MCP Tool 是原子操作（单次 RPC），Skill 可以编排多个工具调用
> - MCP Tool 的消费者是 Agent Runtime，Skill 的消费者是最终用户（通过 `/skill-name` 调用）

#### 4.2.5 统一工具定义接口

三层共享的底层工具类型契约（参考 Claude Code 的 `Tool` 类型）：

```typescript
interface ToolDefinition<Input = unknown, Output = unknown> {
  /** 工具唯一标识 */
  readonly name: string;
  /** 向后兼容别名 */
  readonly aliases?: string[];
  /** 结构化输入 Schema (Zod) */
  readonly inputSchema: ZodType<Input>;
  /** 结构化输出 Schema (Zod) */
  readonly outputSchema?: ZodType<Output>;
  /** 机器可读的语义描述 */
  description(input: Input, context: ToolContext): Promise<string>;
  /** 工具执行逻辑 */
  call(input: Input, context: ToolUseContext): Promise<ToolResult<Output>>;
  /** 并发安全标记 */
  isConcurrencySafe(input: Input): boolean;
  /** 只读操作标记 */
  isReadOnly(input: Input): boolean;
  /** 破坏性操作标记 */
  isDestructive?(input: Input): boolean;
  /** 工具启用/禁用状态 */
  isEnabled(): boolean;
  /** 输入校验 */
  validateInput?(input: Input, context: ToolUseContext): Promise<ValidationResult>;
  /** 权限检查 */
  checkPermissions(input: Input, context: ToolUseContext): Promise<PermissionResult>;
  /** 工具调用超时 (ms) */
  readonly timeoutMs?: number;
  /** 结果大小上限 (chars) */
  readonly maxResultSizeChars: number;
}
```

#### 4.2.6 权限沙箱 `[D]`

每项工具附带细粒度的权限标签：

```typescript
type PermissionTag =
  | 'read_fs'      // 文件系统读
  | 'write_fs'     // 文件系统写
  | 'read_net'     // 网络读
  | 'write_net'    // 网络写
  | 'exec_code'    // 代码执行
  | 'exec_shell'   // Shell 执行
  | 'read_env'     // 环境变量读
  | 'write_env'    // 环境变量写
  | 'read_memory'  // 记忆系统读
  | 'write_memory' // 记忆系统写

interface PermissionGrant {
  /** 允许的权限标签集 */
  allowed: Set<PermissionTag>;
  /** 拒绝的权限标签集 (优先级高于 allowed) */
  denied: Set<PermissionTag>;
  /** 文件系统访问的白名单路径 */
  allowedPaths?: string[];
  /** 网络访问的白名单域名 */
  allowedDomains?: string[];
}
```

Agent 或子代理在创建时被授予明确的 `PermissionGrant`，违反权限的调用被底层拦截并返回 `PermissionDeniedError`。

### 4.3 模型接口层 (Model Provider) `[D]`

标准化接入各类 LLM 的适配器：

```typescript
interface ModelProvider {
  readonly name: string;
  readonly supportedModels: string[];

  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;

  /** 模型能力探测 */
  capabilities(): ModelCapabilities;
  /** Token 计数 */
  countTokens(content: MessageContent): Promise<number>;
}

interface ModelCapabilities {
  maxContextTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
}
```

### 4.4 `kyberkit init` CLI `[D]`

快速生成项目脚手架：

```bash
kyberkit init [project-name]
```

生成结构：
```
my-agent/
├── kyberkit.config.yaml       # Harness 配置 (工具层级、权限、预算)
├── AGENTS.md               # Agent 行为规范 (Single Source of Truth)
├── src/
│   ├── agent.ts            # Agent 入口
│   ├── tools/              # L1 自定义 MCP/函数式工具
│   └── prompts/            # Prompt 模板目录
├── skills/                 # L2 Skill 定义 (skill-name/SKILL.md)
│   └── example/
│       └── SKILL.md        # 示例 Skill
├── mcp/                    # L1 MCP Server 配置
│   └── servers.yaml        # MCP Server 连接定义
├── tests/                  # 测试目录
├── .env.example            # 环境变量模板
├── package.json
└── tsconfig.json
```

---

## 5. Phase 1 — 可靠性层 (Reliability)

### 5.1 记忆与状态管理 (Memory & State Management)

#### 5.1.1 分层记忆系统

```
┌──────────────────────────────────────────────┐
│  Working Memory (工作记忆)                    │  易失性
│  ── 当前上下文窗口内的中间状态                  │  生命周期 = 单次推理调用
├──────────────────────────────────────────────┤
│  Session Memory (会话记忆)                    │  半持久化
│  ── 跨上下文窗口的任务进度、决策、模式           │  生命周期 = 单次任务
│  ── 存储后端: JSON 文件 (progress.json)        │  (可跨多个上下文窗口)
├──────────────────────────────────────────────┤
│  Long-term Memory (长期记忆)                  │  持久化
│  ── 跨任务、跨会话的领域知识、用户偏好           │  生命周期 = 无限期
│  ── 存储后端: SQLite (默认) 或 Vector DB       │  (带 GC 策略)
└──────────────────────────────────────────────┘
```

**一致性规则**: 当 Session Memory 与 Long-term Memory 存在矛盾时，**Session Memory 优先**（更高的时间局部性 = 更高的相关性）。

**统一存储 SPI**：

```typescript
interface MemoryStore<T> {
  read(query: MemoryQuery): Promise<MemoryEntry<T>[]>;
  write(entry: MemoryEntry<T>): Promise<void>;
  update(id: string, patch: Partial<T>): Promise<void>;
  evict(policy: EvictionPolicy): Promise<number>;
  snapshot(): Promise<MemorySnapshot>;
  restore(snapshot: MemorySnapshot): Promise<void>;
}

interface MemoryEntry<T> {
  id: string;
  content: T;
  metadata: {
    createdAt: number;
    updatedAt: number;
    accessCount: number;
    lastAccessedAt: number;
    source: 'agent' | 'user' | 'system';
    tags: string[];
  };
}

type EvictionPolicy =
  | { type: 'lru'; maxEntries: number }
  | { type: 'ttl'; maxAgeMs: number }
  | { type: 'capacity'; maxSizeBytes: number }
  | { type: 'composite'; policies: EvictionPolicy[] };
```

#### 5.1.2 状态快照与恢复 `[D]`

轻量级 JSON checkpoint 机制（不使用 Git 作为默认快照后端，避免大型仓库的 I/O 开销）：

```typescript
interface CheckpointManager {
  /** 在关键节点创建快照 */
  save(agentId: string, state: AgentState): Promise<CheckpointId>;
  /** 从快照恢复 */
  restore(checkpointId: CheckpointId): Promise<AgentState>;
  /** 列出可用快照 */
  list(agentId: string): Promise<CheckpointInfo[]>;
  /** 清理过期快照 */
  prune(policy: RetentionPolicy): Promise<number>;
}

interface AgentState {
  agentId: string;
  status: AgentStatus;
  sessionMemory: Record<string, unknown>;
  taskProgress: TaskProgress;
  toolState: Record<string, unknown>;
  timestamp: number;
  checksum: string;  // 完整性校验
}
```

**Git 集成**作为可选的 `CheckpointProvider` 实现，适用于代码类 Agent 的版本化需求。

### 5.2 Schema 验证器 (Schema Validator) `[D]`

对所有工具调用的输入/输出、Agent 的中间输出进行强类型校验：

```typescript
interface SchemaValidator {
  /** 注册 Schema */
  register(name: string, schema: ZodType): void;
  /** 校验数据 */
  validate<T>(name: string, data: unknown): ValidationResult<T>;
  /** 批量校验 */
  validateBatch(entries: Array<{ name: string; data: unknown }>): ValidationResult[];
}

type ValidationResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: ValidationError[] };

interface ValidationError {
  path: string[];
  message: string;
  code: string;
  expected?: string;
  received?: string;
}
```

### 5.3 异常处理器 (Exception Handler) `[D]`

定义清晰的异常分类与处理策略：

```typescript
/** 异常分类 */
type ErrorCategory =
  | 'transient'        // 瞬态异常 (网络超时、速率限制)
  | 'input_invalid'    // 输入不合法
  | 'permission_denied'// 权限不足
  | 'resource_exhausted'// 资源耗尽 (Token预算、时间预算)
  | 'tool_failure'     // 工具执行失败
  | 'model_failure'    // 模型调用失败
  | 'state_corrupted'  // 状态损坏
  | 'unrecoverable'    // 不可恢复异常

/** 处理策略 */
type RecoveryStrategy =
  | { type: 'retry'; maxAttempts: number; backoffMs: number; backoffMultiplier: number }
  | { type: 'fallback'; fallbackFn: () => Promise<unknown> }
  | { type: 'context_supplement'; additionalContext: string }
  | { type: 'checkpoint_restore'; checkpointId?: string }
  | { type: 'escalate_to_human'; message: string }
  | { type: 'abort'; reason: string }

interface ExceptionHandler {
  /** 注册特定异常类别的处理策略 */
  registerStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void;
  /** 处理异常 */
  handle(error: AgentError): Promise<RecoveryAction>;
  /** 异常事件订阅 */
  onError(listener: (error: AgentError, recovery: RecoveryAction) => void): Disposable;
}
```

### 5.4 自我验证循环 (Self-Verification Loop) `[D]`

Agent 声称任务完成前，强制执行一组确定性验证：

```typescript
interface VerificationPipeline {
  /** 注册验证步骤 */
  addStep(step: VerificationStep): void;
  /** 执行全部验证 */
  run(context: VerificationContext): Promise<VerificationReport>;
}

interface VerificationStep {
  name: string;
  /** 验证执行逻辑（必须是确定性的） */
  verify(context: VerificationContext): Promise<StepResult>;
  /** 超时 (ms)，防止验证循环无限运行 */
  timeoutMs: number;
  /** 是否阻断（false = warning only） */
  blocking: boolean;
}

interface VerificationReport {
  passed: boolean;
  steps: Array<{
    name: string;
    passed: boolean;
    duration: number;
    message?: string;
  }>;
  /** 框架生成的加密 nonce，不可由模型伪造 */
  completionToken: string;
  timestamp: number;
}
```

**完成信号安全**: 使用框架生成的加密 nonce 作为完成令牌，而非模型生成的文本标记，防止模型在非完成状态下伪造完成信号。

---

## 6. Phase 2 — 可观测性层 (Observability)

### 6.1 轻量级轨迹追踪 (Lightweight Trajectory Tracing) `[D]`

参照 claude-code 的极简设计，摒弃重度依赖的 OpenTelemetry SDK，采用内置的轻量级事件追踪 SPI。所有追踪数据将默认以结构化日志（结合本地 SQLite）落地，并可按需通过解耦的插件机制导出。

```typescript
interface TracingProvider {
  /** 记录轨迹事件 */
  recordEvent(event: TrajectoryEvent): void;
  /** 获取当前运行时的 Trace ID */
  getTraceId(): string;
  /** 标记子步骤上下文级联 */
  withContext<T>(contextName: string, fn: () => Promise<T>): Promise<T>;
}

/** 预定义的轨迹事件类型 */
type TrajectoryEventKind =
  | 'agent.lifecycle'    // Agent 生命周期事件
  | 'model.request'      // 模型调用序列
  | 'tool.execution'     // 工具执行
  | 'memory.operation'   // 记忆读写落盘
  | 'validation.step'    // 验证管线断言
```

**微内核零依赖原则**：系统的每一个核心决策（如模型响应、异常熔断、检查点恢复）都被封装为类型安全的 `TrajectoryEvent`，不再依赖外部的复杂 Span/Context 链配置。追求极致的极简冷启动速度和零外部库污染。

### 6.2 健康度仪表盘 `[D]`

提供纯确定性的代码库和运行时健康度指标：

```typescript
interface HealthMetrics {
  /** 运行时指标 */
  runtime: {
    activeAgents: number;
    taskSuccessRate: number;       // 最近 N 次任务的成功率
    avgTaskDuration: number;       // 平均任务耗时 (ms)
    tokenBudgetUtilization: number;// Token 预算使用率
    errorRate: number;             // 异常率
    memoryUsage: MemoryUsageBreakdown;
  };
  /** 代码库指标 (仅 Coding Agent 场景) */
  codebase?: {
    duplicateRate: number;         // 重复率
    docCoverage: number;           // 文档覆盖率
    constraintViolations: number;  // 架构约束违反数
    testCoverage: number;          // 测试覆盖率
  };
}
```

### 6.3 轨迹数据仓库 `[D]`

结构化存储所有运行轨迹，用于后续分析和模型微调：

```typescript
interface TrajectoryStore {
  /** 记录单次 Agent 执行轨迹 */
  record(trajectory: Trajectory): Promise<void>;
  /** 查询轨迹 */
  query(filter: TrajectoryFilter): Promise<Trajectory[]>;
  /** 导出为微调数据集格式 */
  export(format: 'jsonl' | 'parquet', filter?: TrajectoryFilter): Promise<string>;
}

interface Trajectory {
  traceId: string;
  agentId: string;
  taskDescription: string;
  startTime: number;
  endTime: number;
  status: 'success' | 'failure' | 'timeout';
  steps: TrajectoryStep[];
  tokenUsage: { input: number; output: number };
  errorInfo?: { category: ErrorCategory; message: string };
}
```

---

## 7. Phase 3 — 智能增强层 (Intelligence)

> **注意**: 本层的组件均为概率性组件 `[P]`，必须提供确定性降级路径。当模型能力提升使得特定编排逻辑过时时，本层组件可被首先剥离。

### 7.1 上下文注册表与预算管理 (Context Registry & Budget) `[D]+[P]`

采用**声明式上下文绑定**（v0.1），而非动态路由：

```typescript
/** 上下文源注册（声明式） [D] */
interface ContextRegistry {
  /** 注册静态上下文源 (如 AGENTS.md, project docs) */
  registerStatic(source: StaticContextSource): void;
  /** 注册动态上下文源 (如 CI/CD 状态、监控数据) */
  registerDynamic(source: DynamicContextSource): void;
  /** 基于规则筛选上下文 */
  resolve(selector: ContextSelector): Promise<ContextEntry[]>;
}

/** 上下文预算管理 [D] */
interface ContextBudget {
  /** 设置总 Token 预算 */
  setLimit(maxTokens: number): void;
  /** 当前已用 Token */
  used(): number;
  /** 剩余可用 Token */
  remaining(): number;
  /** 在预算内装配上下文 */
  assemble(entries: ContextEntry[], priority: PriorityOrder): AssembledContext;
}

/** 上下文提供者 SPI（供高级用户自定义路由逻辑）[P] */
interface ContextProvider {
  readonly name: string;
  readonly priority: number;
  canProvide(query: ContextQuery): boolean;
  provide(query: ContextQuery, budget: number): Promise<ContextEntry[]>;
}
```

**上下文压缩**：集成基于 LLM 的上下文压缩，在上下文窗口将满时自动将早期对话摘要为结构化要点。降级策略：当 LLM 压缩失败时，回退到基于 token 位置的截断。

### 7.2 规划器模块 (Planner Module) `[P]`

可插拔的规划器，将模糊需求转化为结构化任务清单：

```typescript
interface Planner {
  /** 将自然语言需求转化为结构化 TaskGraph */
  plan(request: PlanRequest): Promise<TaskGraph>;
  /** 在执行过程中动态调整计划 */
  replan(current: TaskGraph, feedback: ExecutionFeedback): Promise<TaskGraph>;
}

/** TaskGraph Schema 定义 */
interface TaskGraph {
  id: string;
  description: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
}

interface TaskNode {
  id: string;
  type: 'atomic' | 'composite';
  description: string;
  /** 所需工具权限 */
  requiredPermissions: PermissionTag[];
  /** 预估 Token 预算 */
  estimatedTokens?: number;
  /** 超时 (ms) */
  timeoutMs?: number;
  /** 验证条件 */
  acceptanceCriteria?: string[];
}

interface TaskEdge {
  from: string;
  to: string;
  type: 'sequential' | 'parallel' | 'conditional';
  condition?: string;  // 条件分支表达式
}
```

### 7.3 工作流引擎 (Workflow Engine) `[D]`

轻量级 DAG 执行器（纯确定性，不包含任何 LLM 调用）：

```typescript
interface WorkflowEngine {
  /** 执行 TaskGraph */
  execute(graph: TaskGraph, context: WorkflowContext): Promise<WorkflowResult>;
  /** 获取实时状态 */
  getStatus(workflowId: string): WorkflowStatus;
  /** 暂停/恢复/终止 */
  pause(workflowId: string): Promise<void>;
  resume(workflowId: string): Promise<void>;
  kill(workflowId: string): Promise<void>;
}

interface WorkflowStatus {
  workflowId: string;
  nodes: Map<string, NodeStatus>;
  overallProgress: number;  // 0.0 ~ 1.0
  startTime: number;
  elapsed: number;
}

type NodeStatus =
  | { state: 'pending' }
  | { state: 'running'; startTime: number }
  | { state: 'completed'; result: unknown; duration: number }
  | { state: 'failed'; error: AgentError; duration: number }
  | { state: 'skipped'; reason: string }
  | { state: 'blocked'; waitingOn: string[] };
```

---

## 8. Phase 4 — 规模化层 (Scale)

### 8.1 多智能体协作架构

#### 8.1.1 角色定义

支持定义不同的 Agent 角色，每个角色拥有专属的系统提示、工具权限和专业知识：

```typescript
interface AgentRole {
  name: string;
  systemPrompt: string;
  permissions: PermissionGrant;
  /** 角色专属工具集（在全局工具集基础上的白名单过滤） */
  allowedTools?: string[];
  /** 角色专属模型配置 */
  modelConfig?: { model: string; temperature?: number };
}
```

#### 8.1.2 通信总线 `[D]`

轻量级消息通信机制，基于发布/订阅的结构化事件：

```typescript
interface MessageBus {
  /** 发布事件 */
  publish(event: AgentEvent): void;
  /** 订阅特定类型的事件 */
  subscribe(eventType: string, handler: EventHandler): Disposable;
  /** 点对点消息 */
  send(to: AgentId, message: AgentMessage): Promise<void>;
  /** 接收消息 */
  receive(agentId: AgentId): AsyncIterable<AgentMessage>;
}

interface AgentEvent {
  type: string;              // e.g., 'task.completed', 'task.failed', 'file.modified'
  source: AgentId;
  timestamp: number;
  payload: Record<string, unknown>;
}
```

#### 8.1.3 内建编排模式

- **Generator-Evaluator**: 生成-评审对抗循环
- **Plan-Execute-Review**: 规划-执行-验证流水线
- **Fan-out/Fan-in**: 并行扇出、结果汇聚

参考 Claude Code 的 `coordinatorMode.ts`，Coordinator 负责：
- 将用户需求分解为子任务
- 分配 Worker 并行或串行执行
- 综合 Worker 结果并与用户交互

### 8.2 长时间运行保障

#### 8.2.1 会话持久化 `[D]`

整个运行时状态（所有智能体的记忆、工作流状态）定期持久化到外部存储：

```typescript
interface SessionPersistence {
  /** 持久化完整运行时状态 */
  save(runtimeState: RuntimeState): Promise<SessionId>;
  /** 从持久化状态恢复 */
  restore(sessionId: SessionId): Promise<RuntimeState>;
  /** 自动持久化配置 */
  configure(options: {
    intervalMs: number;        // 持久化间隔
    maxSnapshots: number;      // 最大快照数
    storageBackend: 'fs' | 'sqlite';
  }): void;
}
```

#### 8.2.2 上下文重置策略 `[D]`

当检测到上下文窗口将满时，自动执行"软重置"：

1. 保存当前 `AgentState` 到 checkpoint
2. 开启全新 LLM 会话
3. 通过 `progress.json` 和 Session Memory 将上下文无缝传递给新会话
4. Agent 在新会话中从 checkpoint 恢复执行

#### 8.2.3 资源与成本管控 `[D]`

```typescript
interface ResourceBudget {
  /** Token 预算 */
  tokenBudget: { max: number; used: number; alertThreshold: number };
  /** 时间预算 */
  timeBudget: { maxMs: number; elapsed: number; alertThreshold: number };
  /** 成本预算 (USD) */
  costBudget?: { maxUsd: number; spent: number; alertThreshold: number };
  /** 超限时的降级策略 */
  onExceeded: 'alert' | 'pause' | 'graceful_stop' | 'force_kill';
}
```

---

## 9. 三大工程支柱

### 9.1 上下文工程 (Context Engineering)

- **Context SDK**: 让开发者声明静态上下文（项目文档）、连接动态上下文源（CI/CD 状态、监控系统）
- **`kyberkit init` 自动生成**: 初始化时扫描项目结构并生成 `project_context.md`，作为 Agent 的入职手册
- **唯一真实来源约定**: `AGENTS.md` 作为 Agent 行为规范的权威文档

### 9.2 架构约束 (Architectural Constraints)

不依赖 Agent 自觉，通过机械手段强制执行：

| 工具 | 类型 | 阶段 |
|------|------|------|
| 确定性 Linter | `[D]` 规则引擎 | Phase 0 (核心价值) |
| 结构测试框架集成 (类似 ArchUnit) | `[D]` 可执行的架构约束测试 | Phase 1 |
| LLM 辅助审计器 | `[P]` 可选模块，HITL 模式 | Phase 3+ |

**依赖规则示例**：
```yaml
# kyberkit.config.yaml
constraints:
  - rule: "no-reverse-dependency"
    from: "L2:harness"
    to: "L4:agent"
    severity: "error"
  - rule: "no-direct-model-call"
    layer: "L2:harness"
    except: ["ModelProvider"]
    severity: "error"
```

### 9.3 熵管理 (Entropy Management)

主动治理 AI 生成代码的质量衰减：

| 特性 | 类型 | 阶段 | 说明 |
|------|------|------|------|
| 健康度仪表盘 | `[D]` | Phase 2 | 重复率、文档覆盖率、约束违反数的量化与趋势可视化 |
| 定时清理 Agent (Janitor) | `[P]` | Phase 4+ | 必须运行在 HITL 模式，人工审批所有变更 |

---

## 10. 安全威胁模型

### 10.1 识别的攻击面

| 威胁类别 | 场景 | 影响 | 缓解措施 |
|----------|------|------|----------|
| 工具供应链攻击 | 恶意 MCP Server 注册后执行任意代码 | 系统接管 | MCP Server 签名验证 + 沙箱化执行 |
| Agent 间权限升级 | 低权限子代理通过消息总线注入指令给高权限代理 | 权限升级 | 安全域隔离 + 消息签名 |
| 记忆污染 | 恶意输入通过记忆系统持久化，影响后续决策 | 持久化后门 | 记忆写入的内容审计 + 来源标记 |
| 资源耗尽 | Agent 无限递归创建子代理 | DoS | 子代理深度限制 + 全局 Agent 实例数上限 |
| Prompt Injection | 通过工具返回值注入恶意指令 | 行为偏转 | 输入/输出内容过滤 + 工具结果隔离标记 |

### 10.2 安全域 (Security Domain)

```typescript
interface SecurityDomain {
  /** 域唯一标识 */
  id: string;
  /** 域内 Agent 共享的权限边界 */
  permissions: PermissionGrant;
  /** 子代理最大嵌套深度 */
  maxAgentDepth: number;
  /** 域内最大并发 Agent 数 */
  maxConcurrentAgents: number;
  /** 跨域通信是否需要 TrustBroker 验证 */
  requiresTrustBroker: boolean;
}

interface TrustBroker {
  /** 验证跨域消息的合法性 */
  validate(message: AgentMessage, from: SecurityDomain, to: SecurityDomain): Promise<boolean>;
  /** 审计跨域通信日志 */
  audit(filter: AuditFilter): Promise<AuditEntry[]>;
}
```

---

## 11. 并发与资源管理模型

### 11.1 资源锁模型

采用**乐观并发控制 (OCC)**，文件级别粒度：

```typescript
interface ResourceManager {
  /** 获取资源租约 */
  acquireLease(resource: ResourceId, mode: 'read' | 'write'): Promise<Lease>;
  /** 释放资源租约 */
  releaseLease(lease: Lease): void;
  /** 检测冲突 */
  checkConflict(resource: ResourceId): ConflictInfo | null;
}

interface Lease {
  id: string;
  resource: ResourceId;
  mode: 'read' | 'write';
  holder: AgentId;
  acquiredAt: number;
  /** 租约自动过期时间 (防止死锁) */
  expiresAt: number;
}

/** 资源标识 */
type ResourceId =
  | { type: 'file'; path: string }
  | { type: 'memory'; key: string }
  | { type: 'external'; uri: string };
```

### 11.2 并发规则

参照 Claude Code 的 Coordinator Mode 实践：

| 操作类型 | 并发策略 | 说明 |
|----------|----------|------|
| 读操作 (Research) | 自由并行 | 多个 Agent 可同时读取相同文件 |
| 写操作 (Implementation) | 文件级互斥 | 同一文件同一时间只允许一个 Agent 写入 |
| 混合操作 | 读写互斥 | 写入期间阻塞该文件的读取 |
| 验证操作 | 准并行 | 可与实现操作在不同文件区域并行 |

### 11.3 死锁预防

- **租约自动过期**: 所有 Lease 有最大持有时间（默认 5 分钟），过期自动释放
- **等待超时**: 获取 Lease 的等待超过阈值后返回 `LeaseTimeoutError`
- **无嵌套锁**: 禁止 Agent 在持有一个 Write Lease 的情况下请求另一个 Write Lease

---

## 12. 部署模型

### 12.1 三级部署

| 级别 | 形态 | 场景 | 运行方式 |
|------|------|------|----------|
| L1 - Embedded | npm package（单进程库） | 个人开发、CI/CD、脚本自动化 | `import { KyberRuntime } from 'kyberkit-os'` |
| L2 - Standalone | 单节点守护进程 | 团队共享、开发服务器 | `kyberkit serve --port 8080` |
| L3 - Distributed | K8s Operator | 大规模多租户生产环境 | Helm Chart + CRD |

三级部署共享同一套 SPI，通过不同的 `Runtime` 实现切换：

```typescript
interface Runtime {
  readonly mode: 'embedded' | 'standalone' | 'distributed';
  /** 初始化运行时 */
  bootstrap(config: KyberConfig): Promise<void>;
  /** 创建 Agent 实例 */
  createAgent(definition: AgentDefinition): Promise<AgentInstance>;
  /** 获取工具注册表 */
  getToolRegistry(): ToolRegistry;
  /** 获取记忆存储 */
  getMemoryStore<T>(tier: 'working' | 'session' | 'longterm'): MemoryStore<T>;
  /** 获取追踪器 */
  getTracer(): TracingProvider;
  /** 优雅关闭 */
  shutdown(): Promise<void>;
}
```

### 12.2 演进路径

1. **起步 (HITL)**: 人在回路模式，使用可观测性工具充分调试
2. **信任建立**: 逐步放宽权限，增加自动化验证步骤
3. **无人值守 (AFK)**: 框架处理长周期任务（夜间重构、批量迁移等）

---

## 13. 分阶段交付路线图

```
Phase 0 — Kernel (8-10 周)
├── Runtime Lifecycle + State Machine
├── Tool Integration Layer
│   ├── L0 Shell Executor + Security Guards
│   ├── L1 MCP Client + Server Lifecycle
│   ├── L2 Skill Registry + Markdown Loader
│   └── ToolIntegrationFacade (统一门面)
├── Permission Sandbox
├── Model Provider SPI
└── kyberkit init CLI

Phase 1 — Reliability (8-10 周)
├── Session Memory + Checkpoint
├── Schema Validator (Zod)
├── Exception Handler + Retry
└── Self-Verification Loop

Phase 2 — Observability (6-8 周)
├── Lightweight Trajectory Tracing
├── Health Dashboard (Deterministic)
└── Trajectory Storage

Phase 3 — Intelligence (10-12 周)
├── Context Registry + Budget
├── Planner Module (Pluggable)
└── Workflow Engine (DAG)

Phase 4 — Scale (12-16 周)
├── Multi-Agent Orchestration
├── Long-Running Session Management
├── Security Domain + TrustBroker
└── Resource Manager (OCC)
```

**Phase 0 (Kernel) 是 MVP**，预计 8-10 周交付（三层工具集成层的安全防护工程量较大）。后续 Phase 根据实际需求和模型能力迭代节奏灵活调整。

---

## 14. 附录：关键 SPI 定义

本节汇总框架的所有 Service Provider Interface，供模块开发者参考。

### 14.1 SPI 清单

| SPI 名称 | 所属阶段 | 类型 | 抽象层级 | 说明 |
|----------|----------|------|----------|------|
| `ToolIntegrationFacade` | Phase 0 | `[D]` | 工具集成 | 三层工具集成的统一门面 |
| `ShellExecutor` | Phase 0 | `[D]` | L0 原语层 | Shell 命令执行 + 安全防护 |
| `MCPToolRegistry` | Phase 0 | `[D]` | L1 能力层 | MCP 协议客户端 + Server 生命周期 |
| `SkillRegistry` | Phase 0 | `[D]` | L2 意图层 | Skill 加载、注册、条件激活 |
| `ToolDefinition` | Phase 0 | `[D]` | 工具集成 | 统一工具定义契约 |
| `SkillDefinition` | Phase 0 | `[D]` | 工具集成 | Skill 定义契约 (Markdown + Frontmatter) |
| `ModelProvider` | Phase 0 | `[D]` | 模型接口 | LLM 接入适配器 |
| `LifecycleHooks` | Phase 0 | `[D]` | 生命周期 | Agent 生命周期事件钩子 |
| `MemoryStore<T>` | Phase 1 | `[D]` | 状态管理 | 统一记忆存储接口 |
| `CheckpointManager` | Phase 1 | `[D]` | 状态管理 | 状态快照与恢复 |
| `SchemaValidator` | Phase 1 | `[D]` | 验证 | 输入/输出校验 |
| `ExceptionHandler` | Phase 1 | `[D]` | 可靠性 | 异常分类与恢复策略 |
| `VerificationPipeline` | Phase 1 | `[D]` | 验证 | 自我验证循环 |
| `TracingProvider` | Phase 2 | `[D]` | 可观测性 | 轻量级本地轨迹追踪 |
| `TrajectoryStore` | Phase 2 | `[D]` | 可观测性 | 轨迹数据存储 |
| `ContextRegistry` | Phase 3 | `[D]` | 上下文 | 上下文源注册 |
| `ContextBudget` | Phase 3 | `[D]` | 上下文 | Token 预算管理 |
| `ContextProvider` | Phase 3 | `[P]` | 上下文 | 自定义上下文路由 |
| `Planner` | Phase 3 | `[P]` | 规划 | 规划能力抽象 |
| `WorkflowEngine` | Phase 3 | `[D]` | 执行 | DAG 工作流执行 |
| `MessageBus` | Phase 4 | `[D]` | 通信 | Agent 间通信 |
| `ResourceManager` | Phase 4 | `[D]` | 并发 | 并发资源管理 |
| `TrustBroker` | Phase 4 | `[D]` | 安全 | 跨安全域通信验证 |
| `Runtime` | All | `[D]` | 运行时 | 运行时抽象（Embedded/Standalone/Distributed） |

### 14.2 模块约束规则

```typescript
interface ModuleManifest {
  name: string;
  version: string;
  /** 依赖的 SPI 及其最低版本 */
  dependencies: Record<string, string>;
  /** 实现的 SPI */
  provides: string[];
  /** 所属阶段 */
  phase: 0 | 1 | 2 | 3 | 4;
  /** 组件类型 */
  kind: 'deterministic' | 'probabilistic';
  /** 概率性组件的降级策略 */
  fallback?: string;
}
```

---

> **文档状态**: 本文档为 KyberKit v1.2 工程规范（已整合三层工具集成架构修订）。Phase 0 (Kernel) 的详细实现 Spec 将在本文档审批通过后单独产出。
