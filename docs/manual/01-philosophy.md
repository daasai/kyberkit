# 第 1 章：绪论 —— AI Agent 的控制论底座

> **KyberKit: Build with Control, Execute with Certainty.**

在 LLM 时代，构建一个能够生成文本的 Agent 极其简单，但构建一个能够稳定、安全且可预测地在真实生产环境中执行任务的 Agent 则异常困难。KyberKit (KK) 不是另一个 LLM 封装框架（Wrapper），而是一个专为 AI Agent 设计的**控制论底座 (Cybernetic Harness)**。

## 1.1 核心哲学：确定性优先 (Deterministic First)

在 Agent 工程中，我们面临一个核心悖论：**模型是概率性的，但业务是确定性的。**

传统的 Agent 框架往往过度依赖模型的“智能”来处理流程控制，这导致了随机的失败、幻觉驱动的无限循环以及不可预测的 API 消耗。KyberKit 的核心理念是：**将概率性的推理与确定性的执行彻底解耦。**

- **概率性层 (Probabilistic Layer)**：仅限于模型的推理、规划（Planner）和意图识别。这些部分具有创造性，但也具有随机性。
- **确定性层 (Deterministic Layer)**：任务执行、资源计算、权限校验、状态机转换和工具调用逻辑。这些部分必须由纯代码逻辑（类型约束、代码静态分析、拓扑排序）强力保障。

**KyberKit 的准则**：凡是能用确定性算法（如 Kahn 拓扑排序、AST 语法树分析、Schema 校验）解决的问题，严禁推给 LLM。

## 1.2 操作系统隐喻 (The OS Metaphor)

如果您将 LLM 类比为计算机的 **CPU**（处理逻辑与推理），那么 KyberKit 就是 **操作系统内核 (Kernel)**。

- **进程管理**：KK 管理 Agent 的生命周期（Created -> Running -> Paused -> Completed）。
- **设备驱动**：KK 通过 MCP (Model Context Protocol) 和 Shell 提供与外部世界交互的“驱动程序”。
- **内存分配**：KK 提供分层记忆系统（Working, Session, Long-term），管理上下文窗口。
- **权限隔离**：KK 内置沙箱与权限标签，防止 Agent 越权操作。

## 1.3 四层架构纵览

KyberKit 采用分层微内核架构，每一层都为 Agent 的稳定运行提供关键原语：

1.  **L4 Agent (业务层)**：垂直领域的业务逻辑（如 Coding, Analytics, Knowledge）。
2.  **L3 SDK (效率层)**：高级抽象与工具函数，加速 Agent 构建。
3.  **L2 Harness (核心运行时)**：本框架的核心。管理生命周期、权限沙箱、状态存续与可观测性。
4.  **L1 Model & Context (模型适配层)**：标准化的 LLM 接入点，管理 Token 计数与上下文窗口。

## 1.4 为什么选择 KyberKit？

- **工业级稳定性**：通过 Atomic Checkpoints 和故障重试机制，确保 Agent 在任何崩溃后都能精准恢复。
- **零外部依赖**：KK 本身极其轻量，内部通过 SQLite 实现了消息队列、轨迹存储和指标监控，无需外部 Redis 或 Prometheus。
- **安全加固**：内置 shell 命令 AST 解析，实时拦截破坏性或越权指令。
- **可观测性一等公民**：每一次决策 span 都会被记录，为模型微调（Fine-tuning）积累核心语料。

---

在接下来的章节中，我们将从零开始搭建您的第一个 KyberKit Agent，开启确定性控制的 Agent 开发之旅。
