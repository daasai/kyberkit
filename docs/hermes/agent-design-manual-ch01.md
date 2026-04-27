# Agent 核心技术设计手册

> **版本**: v0.1 Draft
> **面向读者**: KyberKit 工程团队及任何需要从零构建工业级 AI Agent 的技术团队
> **数据来源**:
> - 源码逆向工程: Hermes Agent (~55,000 行 Python)
> - 已完成的分析报告: [代码库高维地图](./codebase-highmap.md) | [运行时架构](./agent-runtime-architecture.md) | [Prompt 架构](./prompt-architecture.md) | [输出控制工程](./output-control-engineering.md)
> - 官方架构解读: [Hermes Agent 架构全解](https://cloud.tencent.com/developer/article/2652528)
>
> **完整大纲**: [agent-design-manual-outline.md](./agent-design-manual-outline.md)

---

# 第一部分：设计哲学与架构决策

> 本章不涉及具体实现。目标是在写下第一行代码之前，帮助团队建立正确的架构直觉：什么时候该用什么模式，以及——更重要的——什么时候不该用。

---

## 1.1 单体自进化智能体 vs. 多智能体编排

### 核心命题

构建一个 Agent 产品时，首先要回答的问题不是"用什么框架"，而是：

> **你的 Agent 是要"越用越强"，还是要"越拆越细"？**

这两个方向对应着 Agent 架构领域最根本的路线分歧：

| 维度       | 单体自进化 (Hermes 路线)                        | 多智能体编排 (OpenClaw/CrewAI 路线) |
| :------- | :--------------------------------------- | :-------------------------- |
| **核心理念** | 一个 Agent 积累经验，把管用的方法固化为技能                | 多个 Agent 各司其职，中心节点做路由和调度    |
| **记忆哲学** | 记住"**什么管用**" — 把成功的工作流变成可复用操作步骤          | 记住"**发生了什么**" — 跨会话保留上下文    |
| **学习方式** | 运行时闭环自进化：Nudge → Memory → Skill → 下次直接复用 | 无显式学习循环；依赖开发者手动优化 Prompt/工具 |
| **扩展方式** | 写一个 SKILL.md 文件就能扩展能力 (0 代码)             | 编写新 Agent 类 + 编排配置          |
| **适用场景** | 长期运行、持续进化的个人/专用助理                        | 复杂多步任务的并行分治                 |

### Hermes 的选择及其理由

Hermes 坚定选择了单体路线。整个系统围绕 `AIAgent` 一个类运转（`run_agent.py`, 10,897 行），集中了 LLM 调用、工具分发、上下文压缩、记忆管理、子代理委派等全部编排逻辑。

这个选择背后的核心洞察是：

> **大多数 Agent 顶多能记住发生过什么，却没记住什么管用。**

OpenClaw 等多智能体方案会跨会话保留上下文，再通过中心枢纽做路由——简单场景用着还行。但问题很明显：Agent 永远在**重复发现**同样的解决路径，因为它只记住了事件序列，却没有把成功的方法论提炼出来。

Hermes 的学习循环（详见第二部分）解决了这个问题：Agent 在实战中自动判断哪些操作路径值得保留，将其固化为可复用的 Skill 文件，下次遇到类似任务直接复用——不需要重新推理。

### 对你的团队意味着什么

**选择单体自进化路线的前提**：
- 你的 Agent 会被同一个用户/同一类任务**长期使用**
- 你希望 Agent 的能力随使用时间**持续增长**，而不仅仅是装了更多工具
- 你能接受初期较高的工程复杂度（Hermes 的 God Class 就是代价）

**选择多智能体编排的前提**：
- 你的任务天然可以**分治**（如：一个 Agent 写代码、一个 Agent 写测试、一个 Agent 做 Review）
- 你的 Agent 不需要跨会话学习——每次任务都是独立的
- 你更看重**模块化和可维护性**，而非单体的长期进化能力

> **避坑**: 不要因为"多智能体"听起来更高级就盲目选择。如果你的场景实际上是一个用户与一个 Agent 的长期协作，多智能体编排引入的路由、共享状态、Agent 间通信等复杂度远大于收益。

---

## 1.2 ReAct While Loop vs. Graph/DAG 状态机

### 核心命题

确定了"单体"路线之后，下一个关键决策是 Agent 的**执行控制流模型**：

> **你的 Agent 是一个简单的"想 → 做 → 看"循环，还是一个可配置的状态机？**

### 两种范式的对比

```
ReAct While Loop (Hermes)          Graph/DAG 状态机 (LangGraph)
┌──────────────────────┐           ┌──────────────────────┐
│                      │           │  ┌───┐    ┌───┐      │
│  while budget > 0:   │           │  │ A │───→│ B │      │
│    response = LLM()  │           │  └───┘    └─┬─┘      │
│    if tool_calls:    │           │       ┌────→│←────┐   │
│      results = exec()│           │       │   ┌─▼─┐   │   │
│      continue        │           │       │   │ C │   │   │
│    else:             │           │       │   └─┬─┘   │   │
│      return response │           │     ┌─▼─┐  │  ┌─▼─┐  │
│                      │           │     │ D │  │  │ E │  │
└──────────────────────┘           │     └───┘  │  └───┘  │
                                   └────────────┘─────────┘
控制流 = 固定循环                   控制流 = 可配置拓扑
```

Hermes 的选择一目了然——经典的 ReAct While Loop：

```python
# run_agent.py L8092 — 整个系统的控制核心，就是这一行
while (api_call_count < self.max_iterations
       and self.iteration_budget.remaining > 0) or self._budget_grace_call:
```

没有节点、没有边、没有可配置的流转拓扑。Agent 的全部行为就是：**Think（调 LLM）→ Act（执行工具）→ Observe（把结果追加到 messages）→ 回到 Think**。

### 这个选择背后的权衡

| 维度 | ReAct While Loop | Graph/DAG 状态机 |
|:---|:---|:---|
| **认知复杂度** | 极低 — 一个 while 循环就能理解全部控制流 | 中高 — 需要理解节点/边/条件分支/并行执行 |
| **可调试性** | 高 — 在循环体内打断点即可 | 中 — 需要跟踪状态机的当前节点 |
| **灵活性** | 低 — 固定的 Think-Act-Observe 序列 | 高 — 任意拓扑，支持条件跳转和并行 |
| **代码量** | 循环体本身很短，但防御逻辑膨胀 | 框架层抽象厚重，业务代码分散在各节点 |
| **适用场景** | 通用助理（任务结构不可预知） | 固定流程自动化（任务结构预先定义） |

Hermes 选择 ReAct 的根本原因是：**通用 AI 助理的任务结构是不可预知的**。用户可能让 Agent 调试代码、写邮件、搜索资料、管理日程——这些任务之间没有固定的流转关系。强行定义一个 Graph 只会增加复杂度，却不能带来更好的执行质量。

### 代价：God Class 问题

ReAct 循环自身虽然简单，但当你需要处理的**异常路径**足够多时（无效工具名、JSON 格式错误、空响应、Provider 故障、上下文溢出……），循环体会不断膨胀。这就是 Hermes 的 `run_conversation()` 方法长达 ~2,900 行、`AIAgent` 类总计 10,897 行的根本原因。

```
AIAgent 类的职责分布 (按行数估算)

  __init__()           ~950 行   ┃ 初始化：LLM Client + Memory + Tools + Config
  _build_system_prompt ~165 行   ┃ System Prompt 9 层组装
  _build_api_kwargs    ~200 行   ┃ API 请求构建
  _execute_tool_calls  ~500 行   ┃ 工具分发（并行/串行判定 + 执行）
  run_conversation()  ~2900 行   ┃ ★ 主循环 + 全部防御逻辑
  _try_activate_fallback ~150 行 ┃ Provider Fallback 切换
  _spawn_background_review ~100行┃ 后台记忆/技能审查
  其他辅助方法        ~5900 行   ┃ 消息清洗、缓存、错误恢复等
```

这是一个典型的 **God Class 反模式**。但 Hermes 团队显然是有意为之——在一个 10K 行的类中保持所有状态的可见性，比在 20 个分散的类之间传递状态要更容易调试。

### 对你的团队的建议

**采纳 ReAct 模式的条件**：
- 你构建的是通用助理，任务结构不可预知
- 你的 Agent 需要与模型进行多轮工具调用交互
- 你愿意接受循环体膨胀的代价（可以通过拆分 `TurnExecutor` + `ErrorRecoveryChain` 等子组件来缓解）

**考虑 Graph 模式的条件**：
- 你的任务有**固定且可预知的步骤**（如：数据采集 → 清洗 → 分析 → 报告）
- 你需要在某些步骤之间支持条件跳转或并行执行
- 多人团队需要独立开发不同节点

> **避坑**: 不要试图用 Graph 框架来包装一个本质上是 ReAct 循环的 Agent。你最终会得到一个只有两个节点（"调 LLM" 和 "执行工具"）的 Graph，白白增加了框架依赖和调试难度。

---

## 1.3 "让模型自由输出，用工程兜底" 的输出控制哲学

### 核心命题

Agent 工程中一个关键的技术决策是：

> **你应该通过 API 参数约束模型输出格式（如 `response_format`, JSON Schema），还是让模型自由输出然后用代码做验证和修复？**

### Hermes 的选择：Schema-free + 多层验证

Hermes 的答案出人意料——它**完全不使用**任何 LLM 提供商的结构化输出功能。不用 `response_format`、不用 `json_schema`、不用 Pydantic 约束。Pydantic 在代码库中仅用于 FastAPI HTTP DTO 和 RL 环境配置，**不涉及任何 LLM 输出解析**。

整个系统的输出控制策略可以概括为：

> **让模型按照自然方式输出 tool_calls，然后用 4 级独立 Retry 状态机 + 模糊修复 + 自纠错注入来确保输出可处理。**

### 为什么这样做？

| 优势               | 解释                                                                                                                  |
| :--------------- | :------------------------------------------------------------------------------------------------------------------ |
| **Provider 兼容性** | 不是所有 Provider 都支持 `response_format`。Hermes 支持 OpenAI / Anthropic / OpenRouter / 本地模型等 10+ 种 Provider，强制结构化输出会排除一大部分 |
| **模型兼容性**        | 本地部署的开源模型往往不支持结构化输出参数，或支持质量不稳定                                                                                      |
| **输出质量**         | 结构化模式可能导致模型过度关注格式约束，反而降低工具调用的决策质量                                                                                   |
| **恢复灵活性**        | 自由输出 + 工程修复可以处理远比"格式错误"更复杂的问题（如工具名拼错、JSON 被截断、推理标签未闭合等）                                                             |

### 4 级 Retry 状态机：核心设计

Hermes 为不同类型的输出畸形定义了**独立的重试计数器**，每个有自己的上限和降级策略：

```
Level 1: Scratchpad 完整性 (max 2)
  └─ 检测 <REASONING_SCRATCHPAD> 未闭合 → 丢弃响应，直接重试

Level 2: Tool Name 验证 (max 3)
  └─ 名称不在 valid_tool_names → 模糊修复³ → 失败则注入 tool error 让模型自纠错

Level 3: JSON 参数校验 (max 3)
  └─ json.loads() 失败 → 区分截断 vs 格式错误 → 截断 abort / 格式错误重试或注入恢复

Level 4: 空响应恢复 (max 3)
  └─ 无 content + 无 tool_calls → Thinking Prefill → Retry → Provider Fallback → "(empty)"

³ 模糊修复 = lowercase → normalize(连字符→下划线) → difflib fuzzy match (cutoff=0.7)
```

这个设计背后有一个重要原则：

> **不同类型的错误需要不同的恢复策略。用单一 `retry_count` 混合处理所有错误是一个常见且危险的反模式。**

例如：JSON 被截断（通常因为 `max_tokens` 不够）应该**立即 abort** 而非重试——重试会得到完全相同的截断结果，白白浪费 token。但 JSON 格式错误（通常因为采样波动）值得重试 2 次——大概率第三次就正常了。

### 确定性边界的划定原则

Hermes 的实践揭示了一个重要的工程原则——不是所有行为都需要确定性保证：

| 必须确定性保证 | 允许概率性容忍 |
|:---|:---|
| 安全过滤（敏感路径拦截、Secret 脱敏） | 工具名拼写（可模糊修复） |
| 工具结果大小限制（防止 context 溢出） | JSON 参数格式（可重试 + 注入恢复） |
| 会话持久化（每轮必须存盘） | 推理标签格式（可 strip） |
| 迭代预算（max 90，硬上限） | 空响应（可 prefill / retry / fallback） |

在两者之间，Hermes 建立了**渐进式恢复链**：先尝试最轻量的修复（模糊匹配），不行就转自纠错（注入 tool error），再不行就换模型（Provider Fallback），最终才是 abort。每一步都比上一步更"重"，但也更可靠。

### 对你的团队的建议

**Schema-free 路线适合**：
- 需要支持多个 LLM Provider（包括不支持结构化输出的本地模型）
- Agent 的主要交互模式是 Function Calling（模型返回 `tool_calls`，格式已经半结构化）
- 团队有能力实现多类型 Retry 状态机

**结构化输出路线适合**：
- 只使用单一 Provider（如仅用 OpenAI）
- 需要模型返回严格的 JSON 数据结构（如提取结构化信息）
- 宁可降低 Provider 兼容性也要保证输出格式

> **避坑**: 如果你选 Schema-free 路线，**必须**为每种错误类型建立独立的 retry 计数器和降级路径。不要用 `for i in range(3)` 包一个通用 retry——你会在截断 / 格式错误 / 空响应之间混淆不清，浪费大量 token 在注定失败的重试上。

---

## 1.4 零遥测与隐私先行

### 核心命题

对于一个能读写用户文件、执行终端命令、访问浏览器的 Agent，隐私不是一个功能——它是一个**架构约束**：

> **零遥测是设计属性，不是可选开关。**

### Hermes 的实现方式

Hermes 在三个层面贯彻了这一原则：

**1. 全本地状态存储**

所有持久化状态存储在用户本机的 SQLite 文件中（通过 `hermes_state.py` 管理），不依赖任何外部数据库或云服务：

| 数据 | 存储位置 | 格式 |
|:---|:---|:---|
| 对话历史 | `~/.hermes/sessions.db` | SQLite + FTS5 索引 |
| 原始消息 | 同上 | JSONL 字段 |
| 记忆 | `~/.hermes/memories/MEMORY.md` | Markdown 文本文件 |
| 用户画像 | `~/.hermes/memories/USER.md` | Markdown 文本文件 |
| 技能 | `~/.hermes/skills/*.md` | Markdown 文件集 |
| 定时任务 | `~/.hermes/cron/jobs.json` | JSON 文件 |
| 工具结果 | `/tmp/hermes-results/*.txt` | 临时文本文件 |

没有账号系统、没有远程 API、没有匿名统计。Agent 的全部知识和记忆都在用户的文件系统中。

**2. Import-time 安全快照**

在敏感信息脱敏模块 (`agent/redact.py`) 中，Redaction 开关在**模块导入时一次性固化**，而非从运行时环境变量实时读取：

```python
# agent/redact.py L18 — 在 import 时快照，而非运行时读取
_REDACT_ENABLED = os.getenv("HERMES_REDACT_SECRETS", "").lower() not in ("0", "false", "no", "off")
```

这意味着即使 LLM 生成了 `export HERMES_REDACT_SECRETS=false` 并通过终端工具执行，也无法在当前会话中禁用脱敏——因为 Python 模块只 import 一次。这个设计体现的原则是：

> **安全配置应该在进程启动时冻结，不应该受运行时状态影响。**

**3. 容器加固作为默认约束**

Docker 后端模式下，安全加固是**架构级默认设置**，不是可选开关：
- 只读根文件系统
- 移除 Linux 特权权限（`--cap-drop=ALL`）
- 命名空间隔离

Agent 执行的代码无法修改容器外部文件系统、无法提权、无法访问宿主机网络。这些限制不需要用户配置——它们是 Docker 后端的固有属性。

### 对你的团队的建议

| 原则 | 实现方式 |
|:---|:---|
| **数据默认留在本地** | 使用 SQLite 而非远程数据库作为默认存储后端 |
| **安全配置不可运行时修改** | 在进程启动时快照所有安全开关 |
| **沙箱默认启用** | 容器隔离应是默认模式，而非 `--sandbox=true` 可选参数 |
| **脱敏覆盖工具输出** | 工具返回的文件内容可能包含 API Key — 必须在返回给模型前过滤 |

> **避坑**: 很多团队在 Agent 管理面板中添加"启用遥测"开关。问题是：如果你的 Agent 有执行终端命令的能力，LLM 可能被诱导（prompt injection）去修改这个开关的底层配置文件。正确的做法是 Hermes 式的 import-time 快照——进程启动后，安全配置就是不可变的。

---

## 本章核心要点速查

| 决策点 | Hermes 的选择 | 适用条件 | 替代方案 |
|:---|:---|:---|:---|
| Agent 架构范式 | 单体自进化 | 长期使用、持续学习 | 多智能体编排（任务可分治） |
| 执行控制流 | ReAct While Loop | 通用助理、任务不可预知 | Graph/DAG（固定流程自动化） |
| 输出格式控制 | Schema-free + 多层验证 | 多 Provider / 多模型 | 结构化输出（单一 Provider） |
| 隐私策略 | 零遥测、全本地存储 | Always | — |

---

> **下一章**: [第二部分：学习循环 — Agent 自进化的核心引擎](./agent-design-manual-ch02.md)
