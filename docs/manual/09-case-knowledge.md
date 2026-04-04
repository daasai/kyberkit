# 第 9 章：实战案例二 —— 构建 Knowledge Agent (知识管理智能体)

知识管理（KM）要求 Agent 能够从海量非结构化文档中提取价值，并保持长期记忆的一致性。KyberKit 的 **Phase 1 (Memory)** 与 **Phase 4 (Scale)** 结合，为构建“大脑级”的知识智能体提供了坚实基础。

## 9.1 场景定义：自动索引与语义问答

我们要构建一个能够：
1.  监控本地文档目录的变化。
2.  自动解析 Markdown/PDF 内容并存入长期记忆 (L3)。
3.  基于用户提问进行精准的语义检索。
4.  对生成回答进行事实性检查（Fact-checking）。

## 9.2 垂直工具链与内存配置

- **L1 (MCP)**：`FileSystemServer`。用于实时监控文件变更。
- **L3 (Memory)**：`LongTermMemory` (SQLite 后端)。存储处理后的知识条目。
- **L2 (Skill)**：定义 `doc_parse_skill` 和 `fact_check_skill`。

## 9.3 核心实现逻辑

### 9.3.1 长期记忆的冷热分层

在 Knowledge Agent 中，KM 系统会自动对记忆进行分层：
- **热数据 (Session Memory)**：当前正在讨论的文档上下文。
- **冷数据 (Long-term Memory)**：存储在 SQLite 中的历史知识。
- **策略**：当用户提问时，KK 会先搜索 L3，并将最相关的 Top-K 条目“热加载”到 Session Memory。

### 9.3.2 记忆清理 (Eviction) 与 权重 (Scoring)

长期记忆不是无限堆积的垃圾场。KK 允许定义清理策略：
```typescript
// 基于时间和访问频率的复合清理
await memory.prune({
  maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30天
  maxEntries: 10000 // 最多保留1万条
});
```
每条记录都有一个 `score`（权重），Agent 可以根据用户反馈动态调整权重，确保最重要的知识始终优先被检索。

### 9.3.3 自我验证循环 (Self-Verification Loop)

为了解决 RAG（检索增强生成）中常见的幻觉问题，我们配置了一个验证步：
- **Step**：`Consistency Check`。
- **逻辑**：将模型生成的回答与 L3 中的原始引用内容进行二阶比对。如果发现矛盾点，KK 会拦截该输出，提示模型修正，或将状态标记为 `verification_failed`。

## 9.4 规模化扩展：多专家评审

在复杂的 KM 场景下，我们可以启动两个 Agent：
1.  **Harvester Agent**：负责不间断地扫描和索引新文件。
2.  **Librarian Agent**：负责响应用户查询。
两者通过 **Message Bus** 同步索引状态，实现真正的非阻塞大规模协作。

---

通过 KyberKit，知识管理不再是简单的向量搜索，而是一个具备自我进化、自我审计能力的动态闭环系统。在最后一章，我们将汇总所有的最佳实践与 API 参考。
