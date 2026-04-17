# Claude-Code 代码库高维地图及高价值目标路径清单

## 1. 代码库基础规模统计

| 指标 | 数值 |
|---|---|
| 运行时 | Bun (TypeScript / TSX) |
| UI 框架 | Ink (React for Terminal) |
| 核心目录 `src/` 一级模块数 | ~30 个 |
| 最大单一文件 | `src/main.tsx` — **804 KB** (4690 行) |
| Tool 实现数量 | **39** 个独立 Tool 目录 |
| Command（斜杠命令）数量 | **~80** 个 |
| Skills（内置技能）数量 | **18** 个 |

---

## 2. 全局架构骨架（三层精炼目录树）

```
claude-code/
├── bin/claude-haha                ← Shell 启动器 (exec bun → entrypoints/cli.tsx)
├── package.json / tsconfig.json   ← 构建配置
├── preload.ts                     ← Bun 预加载脚本
└── src/
    ├── entrypoints/               ← 【入口点层】
    │   ├── cli.tsx                ← CLI Bootstrap Dispatcher (Fast-path 分发器)
    │   ├── init.ts                ← 全局初始化编排 (Config/TLS/Proxy/Telemetry)
    │   ├── mcp.ts                 ← MCP Server 模式入口
    │   └── sdk/                   ← Agent SDK 入口 (Headless/Programmatic API)
    │
    ├── main.tsx                   ← 【Commander CLI 全量主入口】(804KB 超级文件)
    │                                  Commander 选项解析 → init() → launchRepl()
    │
    ├── query.ts                   ← 【核心 Query Loop】单轮 LLM 交互引擎 (async generator)
    ├── QueryEngine.ts             ← 【QueryEngine 类】多轮 ask() 编排 (1295行)
    ├── Tool.ts                    ← 【Tool 抽象基础设施】类型定义 + buildTool() 工厂
    │
    ├── bootstrap/                 ← 【全局状态 Bootstrap】
    │   └── state.ts               ← 全局 State 单例 (1758行, 进程级元数据)
    │
    ├── state/                     ← 【UI 层应用状态】
    │   ├── AppState.tsx           ← React Context Provider
    │   ├── AppStateStore.ts       ← 状态存储 (messages/tools/costs)
    │   └── selectors.ts           ← 派生状态选择器
    │
    ├── coordinator/               ← 【多 Agent 协调模式】
    │   └── coordinatorMode.ts     ← Coordinator 模式实现 (369行)
    │
    ├── query/                     ← 【Query 辅助模块】
    │   ├── stopHooks.ts           ← 停止条件钩子 (Token Budget/Max Turns)
    │   ├── tokenBudget.ts         ← Token 预算计算
    │   └── config.ts              ← Query 配置
    │
    ├── constants/                 ← 【提示词 & 常量】
    │   ├── prompts.ts             ← ★ System Prompt 核心构建器 (54KB, 1500+行)
    │   ├── systemPromptSections.ts← Prompt 分段组装 DSL
    │   ├── outputStyles.ts        ← 输出风格模板
    │   ├── tools.ts               ← Tool Schema 常量
    │   └── system.ts              ← 系统级标识 & 属性
    │
    ├── services/                  ← 【服务层】
    │   ├── api/                   ← ★ LLM API 网关 (claude.ts = 3419行核心)
    │   │   ├── claude.ts          ← Anthropic API 调用封装 (流式/重试/缓存)
    │   │   ├── client.ts          ← HTTP Client 构造
    │   │   ├── withRetry.ts       ← 重试策略 (指数退避/Fallback)
    │   │   ├── errors.ts          ← API 错误分类 & 处理
    │   │   └── logging.ts         ← API 调用日志
    │   │
    │   ├── tools/                 ← 【Tool 执行引擎】
    │   │   ├── toolExecution.ts   ← ★ Tool 执行核心 (1745行)
    │   │   ├── StreamingToolExecutor.ts ← 流式 Tool 执行器
    │   │   ├── toolOrchestration.ts ← Tool 编排策略
    │   │   └── toolHooks.ts       ← Tool 生命周期钩子
    │   │
    │   ├── compact/               ← 【上下文压缩引擎】
    │   │   ├── compact.ts         ← ★ 主压缩逻辑 (1705行)
    │   │   ├── microCompact.ts    ← 微压缩 (轻量级)
    │   │   ├── autoCompact.ts     ← 自动压缩触发器
    │   │   ├── sessionMemoryCompact.ts ← Session 记忆压缩
    │   │   └── prompt.ts          ← 压缩用 Prompt
    │   │
    │   ├── SessionMemory/         ← 【会话级记忆】
    │   │   ├── sessionMemory.ts   ← Session Memory 管理器
    │   │   ├── prompts.ts         ← 记忆提取 Prompt
    │   │   └── sessionMemoryUtils.ts
    │   │
    │   ├── extractMemories/       ← 【记忆提取】
    │   │   ├── extractMemories.ts ← LLM 驱动的记忆提取
    │   │   └── prompts.ts         ← 提取用 Prompt
    │   │
    │   ├── mcp/                   ← MCP 协议客户端
    │   ├── analytics/             ← 遥测 & GrowthBook Feature Flags
    │   ├── lsp/                   ← LSP Server 管理
    │   └── plugins/               ← 插件服务
    │
    ├── memdir/                    ← 【持久化记忆文件系统 (CLAUDE.md)】
    │   ├── memdir.ts              ← ★ Memory Directory 核心 (507行)
    │   ├── memoryTypes.ts         ← 记忆类型定义 (271行)
    │   ├── findRelevantMemories.ts← 记忆检索
    │   ├── memoryScan.ts          ← 文件系统记忆扫描
    │   ├── paths.ts               ← 路径解析
    │   └── teamMemPaths.ts        ← 团队记忆路径
    │
    ├── tools/                     ← 【39 个 Tool 实现】
    │   ├── AgentTool/             ← ★ 子 Agent 派生工具
    │   ├── BashTool/              ← Shell 命令执行
    │   ├── FileEditTool/          ← 文件编辑 (diff-based)
    │   ├── FileReadTool/          ← 文件读取
    │   ├── FileWriteTool/         ← 文件写入
    │   ├── GrepTool/              ← 代码搜索
    │   ├── GlobTool/              ← 文件匹配
    │   ├── MCPTool/               ← MCP 动态工具
    │   ├── WebSearchTool/         ← Web 搜索
    │   ├── WebFetchTool/          ← URL 内容读取
    │   ├── TaskCreateTool/        ← 并行任务创建
    │   ├── TaskGetTool/           ← 任务状态查询
    │   ├── WorkflowTool/          ← 工作流执行
    │   ├── SkillTool/             ← 技能执行
    │   ├── EnterPlanModeTool/     ← 计划模式切换
    │   ├── SyntheticOutputTool/   ← 结构化输出虚拟工具
    │   ├── SendMessageTool/       ← 团队消息发送
    │   ├── TeamCreateTool/        ← Swarm 团队创建
    │   └── ... (39 tools total)
    │
    ├── tasks/                     ← 【并行任务执行框架】
    │   ├── LocalMainSessionTask.ts← 主会话任务
    │   ├── LocalAgentTask/        ← 本地子 Agent 任务
    │   ├── LocalShellTask/        ← Shell 子进程任务
    │   ├── InProcessTeammateTask/ ← 进程内队友任务
    │   ├── RemoteAgentTask/       ← 远程 Agent 任务
    │   └── DreamTask/             ← 后台"梦境"任务
    │
    ├── skills/                    ← 【技能框架】
    │   ├── bundledSkills.ts       ← 内置技能注册
    │   ├── loadSkillsDir.ts       ← 技能目录加载器
    │   └── bundled/               ← 18 个内置技能 (batch, loop, debug, etc.)
    │
    ├── plugins/                   ← 【插件系统】
    │   ├── builtinPlugins.ts      ← 内置插件
    │   └── bundled/index.ts
    │
    ├── commands/                  ← 【~80 个斜杠命令】
    │   ├── compact/               ← /compact 命令
    │   ├── memory/                ← /memory 命令
    │   ├── model/                 ← /model 切换
    │   ├── plan/                  ← /plan 模式
    │   ├── agents/                ← /agents 管理
    │   └── ... (80+ commands)
    │
    ├── components/                ← 【Ink TUI 组件】
    │   ├── messages/              ← 消息渲染
    │   ├── permissions/           ← 权限对话框
    │   ├── diff/                  ← Diff 可视化
    │   ├── PromptInput/           ← 输入区组件
    │   └── agents/                ← Agent 视图
    │
    ├── context/                   ← 【React Context (UI 域)】
    │   ├── notifications.tsx      ← 通知上下文
    │   ├── overlayContext.tsx      ← 覆盖层上下文
    │   └── stats.tsx              ← 统计信息上下文
    │
    ├── screens/                   ← 【顶层屏幕】
    │   └── REPL.tsx               ← ★ REPL 主屏幕 (5005行)
    │
    ├── ink/                       ← 【Ink 渲染引擎 Fork】
    │   ├── ink.tsx                ← 自定义 Ink 实例
    │   ├── screen.ts              ← 渲染屏幕
    │   └── render-node-to-output.ts
    │
    ├── hooks/                     ← 【React Hooks】
    │   ├── toolPermission/        ← Tool 权限钩子
    │   ├── useTypeahead.tsx       ← 自动补全
    │   └── notifs/                ← 通知钩子
    │
    ├── types/                     ← 【全局类型定义】
    │   ├── message.ts             ← 消息类型 (核心 DTO)
    │   └── generated/             ← 自动生成类型
    │
    ├── utils/                     ← 【工具库 (~100 个子模块)】
    │   ├── model/                 ← ★ Model 选择 & 配置 (17 文件)
    │   ├── permissions/           ← 权限引擎
    │   ├── memory/                ← 记忆工具
    │   ├── messages.ts            ← ★ 消息规范化 (5512行)
    │   ├── hooks.ts               ← Hook 系统 (5022行)
    │   ├── config.ts              ← 配置管理
    │   ├── bash/                  ← Bash 执行辅助
    │   ├── sandbox/               ← 沙箱执行
    │   ├── swarm/                 ← 多 Agent Swarm 编排
    │   ├── mcp/                   ← MCP 工具
    │   ├── skills/                ← 技能辅助
    │   └── telemetry/             ← 遥测 & 追踪
    │
    ├── cli/                       ← CLI 传输 & 打印层
    ├── bridge/                    ← 远程桥接模式
    ├── remote/                    ← 远程执行环境
    ├── server/                    ← 内嵌 HTTP Server
    ├── voice/                     ← 语音输入
    └── vim/                       ← Vim 模式
```

---

## 3. 四大核心模块定位

### 3.1 Agent 核心编排逻辑 (Agentic Loop)

> **核心发现**：Claude-Code 的 Agent 编排并非标准的 LangGraph/AutoGen 图结构，而是一个 **基于 async generator 的 Query-Response 循环**，通过 `query()` 函数驱动。

| 优先级 | 文件路径 | 行数 | 职责 |
|---|---|---|---|
| 🔴 P0 | `src/query.ts` | 1729 | **单轮 Query Loop** — `query()` async generator，驱动 LLM API Call → Stream Event → Tool Dispatch → Yield Result 的完整循环 |
| 🔴 P0 | `src/QueryEngine.ts` | 1295 | **多轮 Ask 引擎** — `QueryEngine` 类封装 `ask()` 方法，管理多轮对话编排（含 Auto-Compact 触发、Stop Hook 检查） |
| 🔴 P0 | `src/main.tsx` | 4690 | **超级入口** — Commander CLI 选项解析、`init()` 调用、`launchRepl()` 启动，**包含大量内联业务逻辑** |
| 🟡 P1 | `src/screens/REPL.tsx` | 5005 | **REPL 主屏幕** — Ink TUI 主循环，管理用户输入 → QueryEngine 调用 → 消息渲染的完整 UI 交互循环 |
| 🟡 P1 | `src/coordinator/coordinatorMode.ts` | 369 | **Coordinator 模式** — 多 Agent 协调编排（Feature-gated） |
| 🟡 P1 | `src/services/tools/toolExecution.ts` | 1745 | **Tool 执行引擎** — Tool 分发、并行执行、结果收集核心 |
| 🟡 P1 | `src/services/tools/toolOrchestration.ts` | ~150 | **Tool 编排策略** — 执行顺序与依赖管理 |
| 🟢 P2 | `src/tasks/` 全目录 | ~500 | **并行任务框架** — LocalAgent/RemoteAgent/Shell/Teammate/Dream 五种任务类型 |

**关键架构洞察**：

```
用户输入 → REPL.tsx → QueryEngine.ask()
                          ↓
                   query() async generator
                          ↓
              ┌───────────┴───────────┐
              │  LLM API Call         │
              │  (services/api/claude) │
              └───────────┬───────────┘
                          ↓
              ┌── StreamEvent Processing ──┐
              │  • text_delta              │
              │  • tool_use                │
              │  • tool_result             │
              │  • stop_reason             │
              └───────────┬───────────────┘
                          ↓
              ┌── Tool Execution ─────────┐
              │  toolExecution.ts          │
              │  StreamingToolExecutor.ts  │
              └───────────┬───────────────┘
                          ↓
                   Yield → 继续循环 or Stop
```

---

### 3.2 提示词模板与跟踪系统 (Prompt Engineering Infrastructure)

| 优先级 | 文件路径 | 大小 | 职责 |
|---|---|---|---|
| 🔴 P0 | `src/constants/prompts.ts` | 54 KB | **System Prompt 主构建器** — `getSystemPrompt()` 函数，动态组装完整 System Prompt（含环境感知、Tool 描述、MCP 指令、输出风格） |
| 🔴 P0 | `src/constants/systemPromptSections.ts` | ~50行 | **Prompt 分段 DSL** — `systemPromptSection()` / `resolveSystemPromptSections()` 分段组装机制 |
| 🟡 P1 | `src/constants/outputStyles.ts` | ~10 KB | **输出风格模板** — 控制 LLM 输出格式（concise/verbose/code-only 等） |
| 🟡 P1 | `src/services/compact/prompt.ts` | ~16 KB | **压缩 Prompt** — 指导 LLM 进行上下文压缩的 Prompt 模板 |
| 🟡 P1 | `src/services/SessionMemory/prompts.ts` | ~12 KB | **Session 记忆 Prompt** — 记忆提取与注入的 Prompt 模板 |
| 🟡 P1 | `src/services/extractMemories/prompts.ts` | ~7 KB | **记忆提取 Prompt** — 长期记忆提取指令 |
| 🟢 P2 | `src/memdir/teamMemPrompts.ts` | ~6 KB | **团队记忆 Prompt** |
| 🟢 P2 | `src/constants/cyberRiskInstruction.ts` | ~1.5 KB | **安全约束 Prompt** |
| 🟢 P2 | 各 Tool 目录下的 `prompt.ts` | 分散 | **每个 Tool 的 Schema 描述与指令** |

**关键架构洞察**：

- System Prompt 不是静态字符串，而是一个 **运行时动态组装的函数**，基于当前环境（OS、Git 状态、工作目录、已连接的 MCP Server、注册的 Tool 列表、输出风格配置）动态拼接
- 使用 `systemPromptSection()` DSL 实现 **分段缓存控制**（区分 cacheable 和 uncacheable sections，以配合 Anthropic API 的 Prompt Caching）
- Prompt 散布在 **至少 6 个独立位置**，形成一个分层 Prompt Pipeline

---

### 3.3 LLM 接口封装与网关 (LLM Gateway)

| 优先级 | 文件路径 | 行数 | 职责 |
|---|---|---|---|
| 🔴 P0 | `src/services/api/claude.ts` | 3419 | **LLM API 核心网关** — 流式调用 Anthropic Messages API，处理 Token 计费、缓存、Usage 追踪、多模型路由 |
| 🔴 P0 | `src/services/api/withRetry.ts` | ~800 | **重试 & Fallback 策略** — 指数退避、API Quota 限制处理、模型降级 Fallback |
| 🟡 P1 | `src/services/api/client.ts` | ~500 | **HTTP Client 构造** — Anthropic SDK Client 初始化（Proxy/mTLS/Bedrock） |
| 🟡 P1 | `src/services/api/errors.ts` | ~1200 | **API 错误分类** — 细粒度错误类型（PromptTooLong/RateLimit/Overloaded/Auth 等） |
| 🟡 P1 | `src/utils/model/` 全目录 | 17 文件 | **Model 选择引擎** — 模型枚举、能力矩阵、别名解析、Bedrock/Vertex 适配、动态切换 |
| 🟡 P1 | `src/services/api/promptCacheBreakDetection.ts` | ~700 | **Prompt Cache 断裂检测** — 检测并优化 Prompt 缓存命中率 |
| 🟢 P2 | `src/services/api/bootstrap.ts` | ~150 | **API Bootstrap** — 获取初始配置 |
| 🟢 P2 | `src/services/api/filesApi.ts` | ~600 | **文件 API** — 基于 Anthropic Files API 的大文件处理 |

**关键架构洞察**：

- LLM 网关 **不是一个简单的 HTTP Wrapper**，而是一个高度复杂的流式处理管道，内嵌:
  - **Prompt Cache 优化** — 分段缓存控制, Cache Break 检测
  - **Token Budget 管理** — 动态 `max_tokens` 计算
  - **Fallback 链** — 模型不可用时自动降级
  - **Bedrock/Vertex/1P/3P** 多后端抽象
- `services/api/claude.ts` 是整个代码库中 **信息密度最高的单一文件**，是逆向工程的最高价值目标

---

### 3.4 记忆与上下文管理 (Memory & Context)

| 优先级 | 文件路径 | 行数 | 职责 |
|---|---|---|---|
| 🔴 P0 | `src/memdir/memdir.ts` | 507 | **Memory Directory 核心** — `loadMemoryPrompt()` 加载 CLAUDE.md 记忆文件，构建记忆上下文注入到 System Prompt |
| 🔴 P0 | `src/services/compact/compact.ts` | 1705 | **上下文压缩引擎** — 当 Token 接近上限时，对历史消息进行 LLM 驱动的摘要压缩 |
| 🔴 P0 | `src/services/SessionMemory/sessionMemory.ts` | 495 | **会话级记忆管理** — 跨 Turn 的结构化记忆 |
| 🟡 P1 | `src/memdir/memoryTypes.ts` | 271 | **记忆类型定义** — 记忆的分类体系（user/project/session） |
| 🟡 P1 | `src/memdir/findRelevantMemories.ts` | ~150 | **记忆检索** — 相关性匹配与排序 |
| 🟡 P1 | `src/services/compact/microCompact.ts` | ~500 | **微压缩** — 轻量级、非 LLM 驱动的上下文修剪 |
| 🟡 P1 | `src/services/compact/autoCompact.ts` | ~350 | **自动压缩触发器** — 基于 Token 阈值的自适应压缩 |
| 🟡 P1 | `src/services/compact/sessionMemoryCompact.ts` | ~600 | **Session Memory 压缩** — 针对 Session Memory 的特化压缩 |
| 🟡 P1 | `src/services/extractMemories/extractMemories.ts` | ~600 | **记忆提取器** — LLM 驱动，从对话历史中提取值得长期保存的信息 |
| 🟢 P2 | `src/memdir/memoryScan.ts` | ~90 | **文件系统扫描** — 扫描 `.claude/` 目录树中的记忆文件 |
| 🟢 P2 | `src/memdir/teamMemPaths.ts` | ~300 | **团队记忆路径** — 多 Agent 共享记忆目录 |
| 🟢 P2 | `src/utils/messages.ts` | 5512 | **消息规范化** — Message DTO 的创建、转换、修剪 |
| 🟢 P2 | `src/bootstrap/state.ts` | 1758 | **进程级全局状态** — CWD、模型配置、计费、Session 元数据 |

**关键架构洞察**：

- 记忆系统是一个 **三层架构**：
  1. **持久层 (memdir/)** — 基于文件系统的 `CLAUDE.md` 记忆目录，跨 Session 持久化
  2. **会话层 (SessionMemory/)** — 单 Session 内的结构化记忆，Session 结束时可提取为持久记忆
  3. **压缩层 (compact/)** — 运行时上下文窗口管理，确保 Token 不溢出
- 上下文压缩不是简单的 Truncation，而是 **LLM 驱动的摘要压缩** + **微压缩修剪** + **自动触发机制** 的组合策略

---

## 4. 启动入口文件定位

### 主启动链 (Primary Boot Chain)

```
bin/claude-haha (bash script)
    │
    ├── [Recovery Mode] → bun src/localRecoveryCli.ts
    │
    └── [Normal Mode]  → bun src/entrypoints/cli.tsx
                              │
                              ├── Fast-paths (--version, --dump-system-prompt, daemon, bridge, etc.)
                              │
                              └── Default path:
                                    ↓
                              import('../main.js') → cliMain()
                                    │
                                    ├── Commander CLI 选项解析
                                    ├── init() ← src/entrypoints/init.ts
                                    │   ├── enableConfigs()
                                    │   ├── setupGracefulShutdown()
                                    │   ├── configureGlobalMTLS()
                                    │   ├── configureGlobalAgents() (Proxy)
                                    │   └── preconnectAnthropicApi()
                                    │
                                    └── launchRepl() → src/screens/REPL.tsx
                                          │
                                          └── QueryEngine → query() → claude.ts → LLM
```

### 替代入口

| 入口 | 文件 | 用途 |
|---|---|---|
| SDK / Headless | `src/entrypoints/sdk/` | Programmatic API，无 TUI |
| MCP Server | `src/entrypoints/mcp.ts` | 作为 MCP Server 运行 |
| Bridge | `src/bridge/bridgeMain.ts` | 远程桥接控制 |
| Daemon | `src/daemon/main.ts` | 长驻后台 Supervisor |
| Environment Runner | `src/environment-runner/main.ts` | BYOC 无头执行 |

---

## 5. 高价值逆向工程目标清单 (按优先级排序)

### 🔴 一级目标 — 核心架构骨架（必须首先深入）

| # | 文件 | 逆向目标 |
|---|---|---|
| 1 | `src/query.ts` (1729行) | Agentic Loop 的核心实现：如何驱动 LLM → Tool → Result 循环；Stop 条件判断；Auto-Compact 触发时机 |
| 2 | `src/QueryEngine.ts` (1295行) | 多轮 `ask()` 编排：Turn 管理、消息累积、Token 预算检查、Abort 信号处理 |
| 3 | `src/services/api/claude.ts` (3419行) | LLM API 流式调用的完整管道：Stream 解析、Usage 追踪、Cache 控制、Betas 参数注入 |
| 4 | `src/constants/prompts.ts` (54KB) | System Prompt 动态组装：分段缓存策略、环境感知注入、Tool 描述导入 |

### 🟡 二级目标 — 执行引擎与控制面

| # | 文件 | 逆向目标 |
|---|---|---|
| 5 | `src/services/tools/toolExecution.ts` (1745行) | Tool 调度与执行：权限检查、并行执行、超时处理、结果规范化 |
| 6 | `src/Tool.ts` (800行) | Tool 抽象：`buildTool()` 工厂、Schema 定义 DSL、Permission 模型 |
| 7 | `src/services/compact/compact.ts` (1705行) | 上下文压缩策略：摘要压缩 Prompt、消息选择算法、压缩后消息重构 |
| 8 | `src/memdir/memdir.ts` (507行) | 持久化记忆加载与注入：CLAUDE.md 解析、多级目录扫描、Prompt 注入 |
| 9 | `src/services/api/withRetry.ts` (~800行) | 重试与降级：退避策略、Fallback 模型链、Quota 感知 |

### 🟢 三级目标 — 扩展架构

| # | 文件 | 逆向目标 |
|---|---|---|
| 10 | `src/tasks/` 全目录 | 并行任务框架：子 Agent 生命周期、进程间通信、结果聚合 |
| 11 | `src/coordinator/coordinatorMode.ts` | 多 Agent 协调：任务分配、结果合并、Swarm 模式 |
| 12 | `src/bootstrap/state.ts` (1758行) | 全局状态结构：Session 元数据、Feature Flags、Telemetry 基础设施 |
| 13 | `src/utils/hooks.ts` (5022行) | Hook 系统：Plugin Hook、Permission Hook、生命周期 Hook |
| 14 | `src/screens/REPL.tsx` (5005行) | REPL UI 架构：Ink TUI 布局、消息流渲染、输入处理 |

---

## 6. 架构设计模式识别（初步归纳）

| 模式 | 在代码库中的体现 |
|---|---|
| **Async Generator 驱动的 Agent Loop** | `query()` 使用 `async function*` yield 流式事件，消费端通过 `for await...of` 驱动循环 |
| **Feature Flag + Dead Code Elimination** | `feature('XXX')` 编译时条件分支 + Bun build DCE，模块级条件 `require()` |
| **分层 Prompt 组装** | System Prompt 通过 `systemPromptSection()` DSL 分段构建，支持 cacheable/uncacheable 分区 |
| **LLM 驱动的上下文管理** | 上下文压缩本身调用 LLM 进行摘要，而非简单的规则裁剪 |
| **三层记忆架构** | 文件系统持久记忆 → 会话级结构化记忆 → 运行时压缩层 |
| **Tool 工厂模式** | `buildTool()` 统一构造所有 Tool，标准化 Schema/Permission/Execution 接口 |
| **React Context 全局状态** | AppState 通过 React Context Provider 驱动 Ink TUI 的响应式渲染 |
| **Bootstrap 单例状态** | `bootstrap/state.ts` 作为进程级全局状态容器，持有所有跨模块共享的元数据 |

---

## 7. 已完成的深度逆向文档索引

| 章节 | 文件 | 核心主题 |
|---|---|---|
| [Ch01](01-global-design-philosophy.md) | — | 全局设计哲学 — "Deterministic First" |
| [Ch02](02-boot-chain-deep-dive.md) | `entrypoints/cli.tsx`, `init.ts`, `main.tsx` | 启动链 & Bootstrap 流程 |
| [Ch03](03-system-prompt-deep-dive.md) | `constants/prompts.ts` | System Prompt 动态组装 & 分段缓存 |
| [Ch04](04-query-engine-deep-dive.md) | `query.ts`, `QueryEngine.ts` | Agentic Loop & 多轮 Ask 编排 |
| [Ch05](05-api-gateway-deep-dive.md) | `services/api/claude.ts` | LLM API 流式网关 & 重试/Fallback |
| [Ch06](06-tool-system-deep-dive.md) | `Tool.ts`, `tools/` | Tool 抽象 & buildTool() 工厂 |
| [Ch07](07-tool-execution-deep-dive.md) | `services/tools/` | Tool 执行引擎 & 并发模型 |
| [Ch08](08-permission-system-deep-dive.md) | `utils/permissions/` | 权限系统 & 安全策略 |
| [Ch09](09-environment-sensing-deep-dive.md) | `context.ts`, `claudemd.ts` | 环境感知 & CLAUDE.md 加载 |
| [Ch10](10-context-compression-deep-dive.md) | `services/compact/` | 上下文压缩引擎 (LLM 摘要 + 微压缩) |
| [Ch11](11-memory-system-deep-dive.md) | `memdir/`, `SessionMemory/` | 三层记忆系统 (持久/会话/上下文) |
| [Ch12](12-parallel-task-framework-deep-dive.md) | `tasks/`, `coordinator/` | 并行任务框架 & Coordinator Mode |
| [Ch13](13-global-state-hook-system-deep-dive.md) | `bootstrap/state.ts`, `utils/hooks/` | 全局状态 & 三层 Hook 系统 |
| [Ch14](14-repl-terminal-ui-deep-dive.md) | `screens/REPL.tsx`, `ink/` | REPL 架构 & 魔改 Ink 渲染引擎 |

> [!NOTE]
> 全部 14 章深度逆向文档已完成。章节按照 Boot Chain → System Prompt → Query Engine → API → Tool → Permission → Environment → Compression → Memory → Tasks → State → UI 的架构分层顺序编排，形成完整的 Claude-Code Agent 框架知识库。
