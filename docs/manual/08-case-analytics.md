# 第 8 章：实战案例一 —— 构建 Analytics Agent (数据分析智能体)

数据分析是 Agent 的典型应用场景，但处理数千行数据时，模型往往会因为上下文限制而产生的计算错误或代码逻辑幻觉。KyberKit 通过**确定性工作流**和**分层工具链**，让数据分析变得精准且可控。

## 8.1 场景定义：从原始 CSV 到可视化报告

我们要构建一个能够：
1.  自动清洗原始销售数据 (CSV)。
2.  在 SQLite 数据库中进行多表关联查询。
3.  生成可视化图表。

## 8.2 垂直工具链组合

- **L1 (MCP)**：`SqliteServer`。提供安全的结构化查询能力。
- **L0 (Shell)**：`PythonExecutor`。用于执行复杂的数据转换和绘图代码（如 使用 Pandas 和 Matplotlib）。
- **L2 (Skill)**：定义 `data_clean_skill` 意图，封装数据脱敏和格式标准化逻辑。

## 8.3 核心实现步骤

### 8.3.1 定义 TaskGraph

Agent 会为该任务生成一个 DAG：
- **节点 1**：读取并预处理 CSV。
- **节点 2**：将清洗后的数据导入 SQLite (依赖节点 1)。
- **节点 3**：运行 SQL 统计查询 (依赖节点 2)。
- **节点 4**：生成可视化报告 (依赖节点 3)。

### 8.3.2 利用 Atomic Checkpoints 记录数据血缘 (Data Lineage)

在数据转换的每一个关键节点（如清洗完成），都会自动触发一个 `Checkpoint`。
- **价值**：如果 Python 绘图脚本报错，Agent 不必重跑前面的耗时查询，而是从“SQL 结果已就绪”的状态瞬间恢复。

### 8.3.3 权限加固

为了安全，我们在 `kyberkit.config.yaml` 中仅授予 Agent 访问 `./data` 目录的权限：
```yaml
permissions:
  allowed: ["read_fs", "write_fs"]
  allowedPaths: ["./data", "./output"]
```

## 8.4 实战技巧：数据采样与上下文管理

直接将 10MB 的 CSV 喂给模型会导致上下文爆炸。
- **KK 策略**：利用 L2 Skill 自动对数据进行前 10 行采样（Head），让模型仅基于数据结构生成代码，具体的完整计算由 **L0 Shell (Python)** 离线完成。
- **确定性校验**：通过 `Self-Verification Loop` 检查生成的图表文件是否确实存在且大小非零。

---

通过这种方式，Analytics Agent 不再是一个“猜测者”，而是一个严谨的“数据分析协调员”。在下一章，我们将讨论如何构建更注重长短期记忆的 **Knowledge Agent**。
