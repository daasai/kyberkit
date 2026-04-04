# KyberKit ⬢

### The Cybernetic Harness for Industrial-Grade AI Agents

**KyberKit** 是一款专为 AI Agent 产品构建者设计的**控制论底座 (Cybernetic Harness)**。它不试图提供“智能”，而是定位为 **“AI Agent 的操作系统”** —— 为智能体提供安全、稳定、高性能的资源调度、进程管理、确定性执行与全栈观测能力。

如果您正在从简单的 LLM Wrapper 转向构建工业级、可落地、具备闭环控制能力的 Agent 产品，KyberKit 是您的首选 Harness。

---

## 核心哲学：确定性优先 (Deterministic First)

在生产环境中，纯随机的、概率性的 Agent 编排是不可接受的。KyberKit 的设计严格遵循**确定性与概率性的二元切分**：

*   **概率性层 (Probabilistic)**：仅限于 LLM 的推理、规划（Planner）和压缩过程。
*   **确定性层 (Deterministic)**：任务执行、资源计算、权限校验、状态机转场必须由纯代码逻辑（AST分析、拓扑排序、类型约束）强力保障。

当模型输出的任务网络 (TaskGraph) 出现逻辑悖论或循环死锁时，KyberKit 会在执行前通过确定性算法进行**物理级拦截**，决不让模型幻觉损耗您的 API 预算。

---

## 架构五重奏 (The 5-Layered Architecture)

KyberKit 采用分层微内核架构，每一层都为 Agent 的稳定运行提供关键原语：

### 01 Micro-Kernel | 微内核层
Agent 的生命周期、权限沙箱 (Sandbox) 与 **三级工具门面** 的完美集成：
- **L0 原语 (Shell)**: 极致灵活的系统级命令执行。
- **L1 能力 (MCP)**: 标准化跨进程 Model Context Protocol 客户端支持。
- **L2 意图 (Skills)**: 声明式的领域知识与工作流封装。

### 02 Reliability | 可靠性层
工业级的防抖与状态存续：
- **分层记忆 (Tiered Memory)**: L1 (工作记忆) / L2 (会话 JSON) / L3 (SQLite 长期存储) 的有机结合。
- **原子检查点 (Atomic Checkpoints)**: 采用 *write-then-rename* 策略，确保 Agent 在崩溃或中断后能从毫秒级的快照中精准恢复，并感知到中断状态。

### 03 Observability | 可观测性层
零依赖、零侵入的系统级上帝视角：
- **轻量级轨迹追踪**: 利用 Node.js `AsyncLocalStorage` 实现零入侵的代码插桩，记录每一次决策 Span。
- **本地轨迹仓库**: 所有运行记录以结构化数据存储在本地 SQLite 中，为后续的微调 (Fine-tuning) 积累核心语料。

### 04 Intelligence | 智能增强层
将模糊意图转化为稳健执行：
- **确定性 DAG 执行引擎**: 采用 Kahn 算法对任务图进行拓扑排序，支持并行扇出与合并，预防逻辑循环。
- **上下文预算裁剪**: 声明式优先级装载，宁愿抛出异常也绝不发送残缺、诱导幻觉的上下文。

### 05 Scale | 规模化层
多智能体协同与全局资源管控：
- **非阻塞消息总线**: 基于 `AsyncGenerator` 实现的 P2P 邮箱与 Pub/Sub 事件订阅。
- **资源硬熔断 (Resource Budget)**: 全局强制限制 Token 消耗、执行时长与成本，彻底杜绝幻觉风暴。

---

## 技术超级力量 (Technical Superpowers)

### ⬢ 高性能运行时 (Runtime)
基于 **Bun / Node.js** 开发，追求极致的冷启动速度与极低的 footprint。

### ⬢ 零外部中间件 (Zero Middleware)
您不需要 Kafka、Redis 或 Prometheus。KyberKit 在内部通过 SQLite 和原生异步机制实现了所有的消息队列、持久化追踪和健康指标聚合。

### ⬢ 安全至上 (Security Focused)
内置命令 AST 分析、路径逃逸检测与细粒度的权限标签控制，构建 Agent 的多重纵深防御。

---

## 快速概览：如何定义一个 KyberKit Agent

```typescript
import { KyberRuntime, AgentRole } from 'kyberkit';

// 定义一个受控的 Coding Agent
const coder = new AgentRole({
  name: 'CodeArchitect',
  permissions: ['read_fs', 'write_fs', 'exec_shell'],
  budget: { maxTokens: 100000, timeLimitMs: 60000 },
  tools: ['bash', 'mcp-file-server', 'code-skill']
});

// 启动由控制论底座驱动的任务
const runtime = await KyberRuntime.bootstrap(coder);
await runtime.execute("重构当前项目的异常处理逻辑，并进行单元测试覆盖");
```

---

## 愿景

KyberKit 的目标是为开发者提供一个**“坚不可摧、绝对透明、极度轻量”**的 Agent Harness。我们相信，最好的 Agent 框架应该像操作系统内核一样，静默而强大地管理着一切不确定性，让您能够专注于构建真正的智能业务。

---

**KyberKit - Build with Control, Execute with Certainty.**
