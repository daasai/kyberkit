# 第 7 章：Phase 4 —— 规模化与多智能体协同

当单个 Agent 的能力达到瓶颈，或者为了安全隔离需要将不同职责分配给不同的智能体时，KyberKit 的 **Phase 4 (Scale)** 提供了完善的多智能体协作基础设施。

## 7.1 非阻塞消息总线 (Message Bus)

KyberKit 内部集成了一个轻量级的、非阻塞的消息总线，支持两种核心协作模式：

### 7.1.1 P2P 点对点通信 (`send` / `receive`)
这种模式类似于“邮箱”，Agent A 可以向 Agent B 发送私信。
- **异步迭代接收**：Agent 通过 `AsyncGenerator` 模式非阻塞地等待新消息。
- **优势**：解耦了执行时序，Agent 可以边执行任务边处理来自同伴的更新。

### 7.1.2 Pub/Sub 事件发布订阅 (`publish` / `subscribe`)
用于广播系统级的状态变更。
- **典型事件**：任务状态更新、资源警告、新文件创建。

## 7.2 全局资源管控 (Resource Management)

在多智能体并行运行的情况下，如果不加限制，可能会导致瞬间消耗海量 Token 或产生巨大的计算负担。KyberKit 提供了**全局资源管理器 (ResourceManager)**：

- **Token 熔断器 (Circuit Breaker)**：为整个 Agent 集群设置全局预算。一旦超过阈值，系统会物理级强制拦截所有后续 API 调用。
- **并发控制器**：物理限制同时处于 `Running` 状态的 Agent 数量，防止系统资源过载。

## 7.3 多智能体协作模式示例

在 KyberKit 中，常见的协作拓扑包括：

1.  **主从模式 (Master-Worker)**：主 Agent 负责分发 TaskGraph 节点，从 Agent 负责具体的工具执行。
2.  **流水线模式 (Pipeline)**：Agent A 负责数据采集，将结果发给 Agent B 进行清洗，最后由 Agent C 生成报告。
3.  **专家组模式 (Specialist Circle)**：不同领域的专家（如 Security Agent, Coding Agent）共同评审同一个任务。

## 7.4 开发者实践：跨 Agent 协作代码

```typescript
// Agent A 发送指令
await messageBus.send("analyst-agent", {
  type: "data_request",
  payload: { query: "SELECT * FROM sales" }
});

// Agent B (Analyst) 异步接收并处理
for await (const msg of messageBus.receive("analyst-agent")) {
  if (msg.type === "data_request") {
    const result = await db.query(msg.payload.query);
    await messageBus.send(msg.sender, { type: "data_response", payload: result });
  }
}
```

---

通过消息总线与资源管控，KyberKit 让复杂的智能体集群变得井然有序。

至此，我们已经完成了 KyberKit 核心架构的全部学习。在接下来的两个章节中，我们将通过 **数据分析 (Analytics)** 和 **知识管理 (Knowledge Management)** 两个真实的实战案例，演示如何综合运用上述所有能力。
