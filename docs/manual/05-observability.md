# 第 5 章：Phase 2 —— 可观测性与轨迹治理

在 AI Agent 的世界里，“不可观测”意味着“不可控”。如果不知道模型为什么做出了某个错误的决策，就无法从根本上优化它。KyberKit 的 **Phase 2 (Observability)** 将可观测性视为系统的一等公民。

## 5.1 什么是轨迹 (Trajectory)？

在 KyberKit 中，**轨迹**不仅仅是普通的日志。它是一个结构化的数据链，记录了 Agent 运行过程中所有的关键 Span：
- **模型请求**：发送了什么 Prompt，返回了什么结果，消耗了多少 Token。
- **工具执行**：调用了哪个工具，参数是什么，执行耗时多久，是否报错。
- **内存操作**：何时读取了 Long-term Memory，何时更新了 Session 状态。

## 5.2 轨迹追踪机制 (Tracing Mechanism)

KyberKit 利用 Node.js 的 `AsyncLocalStorage` 实现了零侵入的异步上下文追踪。这意味着您不需要手动在函数之间传递 `traceId`。

### 5.2.1 追踪上下文 (Trace Context)
每一次任务都会生成一个唯一的 `traceId`，其中可以包含多个 `spanId`。

### 5.2.2 使用示例
```typescript
// 记录一个具体的业务 Span
await tracing.withContext('refactor_logic', async () => {
    // 所有的 recordEvent 调用都会自动关联到这个上下文
    tracing.recordEvent('logic.start', { file: 'index.ts' });
    
    await someHeavyLogic();
    
    tracing.recordEvent('logic.complete', { complexity: 'high' });
});
```

## 5.3 本地轨迹仓库 (Trajectory Store)

KyberKit 默认将所有的追踪数据存储在本地的 **SQLite** 数据库中（通常位于 `.kyberkit/trajectories.db`）。

### 为什么选择本地 SQLite？
1.  **零中间件**：不需要配置外部的 Prometheus 或 Jaeger。
2.  **高性能**：离线记录，不阻塞 Agent 的核心推理。
3.  **数据主权**：轨迹数据保存在本地，方便后续的安全审计。

## 5.4 轨迹数据的终极价值：微调 (Fine-tuning)

可观测性不仅仅是为了 Debug，更是为了进化。

- **成功案例积累**：您可以筛选出所有任务状态为 `success` 的轨迹。
- **负面样本分析**：分析导致 `failure` 的工具调用序列。
- **数据导出**：KK 提供了工具将轨迹导出为标准的 JSONL 格式，直接用于模型的监督微调 (SFT)，让您的 Agent 越用越聪明。

## 5.5 健康度指标监控 (Health Metrics)

除了微观的轨迹，KK 还提供宏观的健康指标：
- **任务成功率**：最近 100 次任务的表现趋势。
- **Token 效率**：平均每次任务消耗的比例。
- **耗时分布**：模型推理时间 vs. 工具执行时间。

---

通过轨迹追踪，Agent 的黑色匣子变成了透明的玻璃盒。接下来，我们将探讨 **Phase 3 (Intelligence)**，学习如何通过确定性的任务规划进一步提升 Agent 的智力水平。
