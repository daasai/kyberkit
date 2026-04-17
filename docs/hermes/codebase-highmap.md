# Hermes Agent 代码库高维地图 (Codebase High-Dimension Map)

## 0. 项目概览
Hermes Agent 是一个工业级、高度模块化的 AI Agent 框架，具有极强的工具扩展性（Skills）和多平台连接能力（Gateway）。其设计哲学深受 Claude Code 启发，采用 TUI（终端用户界面）作为主要交互手段，同时支持大规模的异步自动化任务。

---

## 1. 核心目录树 (Top-Level Architecture)
```text
hermes-agent/
├── agent/                  # 核心计算引擎 (Brain)
├── gateway/                # 多平台接入网关 (Bridge)
├── skills/                 # 技能/工具插件库 (Tools)
├── acp_adapter/            # Agentic Control Protocol 适配层
├── tools/                  # 底层原子工具实现 (Terminal, Browser, etc.)
├── cli.py                  # 交互式 CLI 入口 (Primary Entry)
├── run_agent.py            # Agent 运行逻辑基类 (Class AIAgent)
└── mini_swe_runner.py      # SWE 专项任务运行器
```

---

## 2. 高价值目标路径清单 (High-Value Targets)

### A. Agent 核心编排逻辑 (Core Orchestration)
该部分负责 LLM 的推理循环、工具调用转发以及迭代预算控制。
- **[AIAgent 类](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/run_agent.py)**: 整个系统的灵魂。管理 `run_conversation` 循环。
- **[工具分发器](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/model_tools.py)**: `handle_function_call` 定义了如何将 LLM 的请求映射到具体代码执行。
- **[轨迹管理](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/trajectory.py)**: 记录 Agent 的思考路径与决策过程。

### B. 提示词模板与元指令 (Prompt Mastery)
Hermes 采用动态拼接策略，并非单一的长 Prompt 文件。
- **[Prompt 构建中心](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/prompt_builder.py)**: 包含核心身份定义（`DEFAULT_AGENT_IDENTITY`）和各种环境提示（Environment Hints）。
- **[Skill 描述文件](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/skills/)**: 查找各子目录下的 `DESCRIPTION.md`。每个 Skill 的提示词都在其目录内自包含。
- **[角色注入](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/prompt_builder.py#L97)**: 观察 `load_soul_md` 和 `TOOL_USE_ENFORCEMENT_GUIDANCE`，这是模型行为微调的核心。

### C. LLM 接口封装与网关 (Provider & Gateway)
- **[智能路由](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/smart_model_routing.py)**: 根据任务复杂度在廉价模型与强大模型间切换。
- **[多平台网关](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/gateway/platforms/)**: 包含了 Discord, Telegram, Matrix, WhatsApp 等主流社交协议的接入逻辑。
- **[Anthropic 适配器](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/anthropic_adapter.py)**: 专门针对 Claude 系列模型的缓存控制（Prompt Caching）和流式响应优化。

### D. 记忆与上下文管理 (Memory & State)
- **[上下文压缩引擎](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/context_compressor.py)**: 当 Context window 压力过大时，执行摘要或压缩的逻辑。
- **[内存管理器](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/agent/memory_manager.py)**: 负责构建 `memory_context_block`，决定哪些历史信息该被“记起”。
- **[Session 状态](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/hermes_state.py)**: 持久化存储 Session 和环境变量。

---

## 3. 启动入口定位 (Entry Points)

| 场景 | 入口文件路径 | 说明 |
| :--- | :--- | :--- |
| **交互式终端** | [cli.py](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/cli.py) | 默认启动方式，带有 ASCII Banner 和交互界面的 REPL。 |
| **后台服务网关** | [gateway/run.py](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/gateway/run.py) | 启动多平台接入网关，作为服务常驻运行。 |
| **ACP 服务** | [acp_adapter/entry.py](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/acp_adapter/entry.py) | 遵循 Agentic Control Protocol 的标准化接入入口。 |
| **自动化 SWE 任务** | [mini_swe_runner.py](file:///Users/shawn/Data/Kyberkit/references/hermes-agent/mini_swe_runner.py) | 针对 GitHub Issue 修复等软件工程任务的专用 Runner。 |

---

## 4. 架构特征推测 (Architectural Inferences)
1. **Skill-Driven**: 该 Agent 并非通过硬编码实现功能，而是通过扫描 `skills/` 目录动态加载工具描述和调用钩子。
2. **Deterministic Context**: 极其重视 Context 的利用率。存在多级压缩逻辑和 `SubdirectoryHintTracker`，倾向于通过文件路径上下文（Repo Context）增强模型感知力。
3. **Multi-Tenant Ready**: Gateway 层级的隔离和 `SessionID` 的透传表明其从底层就考虑了多租户和大规模部署的场景。
