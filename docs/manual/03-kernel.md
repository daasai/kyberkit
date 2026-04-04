# 第 3 章：Phase 0 —— 微内核与工具三位一体

在 KyberKit 的架构中，**Phase 0 (Kernel)** 是整个系统的心脏。它负责管理 Agent 的生命周期，并提供了一个强大的**工具集成面 (Tool Integration Facade)**。本章将深入探讨如何通过“工具三位一体”赋予 Agent 改变世界的能力。

## 3.1 微内核架构概览

KyberKit 采用微内核设计，这意味着核心运行极度轻量，而所有的能力（如文件读写、网络访问、复杂逻辑）都通过工具扩展实现。内核的主要职责是：
1.  **状态维护**：管理 Agent 从初始化到完成的状态机。
2.  **权限劫持**：在工具调用执行前进行安全审计。
3.  **上下文装配**：将工具执行结果合规地反馈给模型。

## 3.2 工具三位一体 (The Tool Trinity)

KyberKit 区分了三个层级的工具，每个层级都有其独特的使用场景：

### 3.2.1 L0 原语层：Shell 执行 (Shell Executor)
**定位**：系统的底层能力。
- **功能**：直接执行系统级的命令（如 `ls`, `git`, `npm`）。
- **安全保障**：KK 内置了命令 AST 解析，会自动拦截路径逃逸攻击或未经许可的危险指令（如 `rm -rf /`）。
- **使用建议**：用于最基础的系统操作，通常作为更高级 Skill 的基础。

### 3.2.2 L1 能力层：MCP 工具 (Model Context Protocol)
**定位**：工业级标准化能力。
- **功能**：通过 MCP 协议连接到外部 Server（如 数据库 Server、Google Search Server）。
- **优势**：跨语言、跨进程，具备强类型的 Schema 约束。
- **配置示例** (`kyberkit.config.yaml`):
  ```yaml
  mcp:
    servers:
      - name: "filesystem"
        transport: "stdio"
        command: "npx"
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/work"]
  ```

### 3.2.3 L2 意图层：Skill (技能)
**定位**：领域知识与工作流封装。
- **功能**：通过 Markdown 文件定义的一组指令集，告诉 Agent “如何完成某类复杂任务”。
- **文件格式**：`SKILL.md` (包含 YAML Frontmatter)。
- **示例** (`skills/code_refactor/SKILL.md`):
  ```markdown
  ---
  name: "refactor_helper"
  description: "指导 Agent 进行代码重构"
  allowedTools: ["read_fs", "write_fs"]
  ---
  # 重构指令
  1. 首先读取目标文件。
  2. 识别所有逻辑冗余。
  3. 使用 DRY 原则进行抽象。
  4. 确保不修改任何公开 API 签名。
  ```

## 3.3 权限与沙箱 (Permissions & Sandbox)

在 KyberKit 中，Agent 并非拥有系统的完整权限。每一项工具调用都会经过权限验证。

### 权限标签 (Tags)
- `read_fs` / `write_fs`: 文件系统访问。
- `exec_shell`: 命令执行。
- `read_env`: 环境变量读取。

### 案例：受限的 Coding Agent
在配置中，我们可以精确限制 Agent 的活动范围：
```yaml
permissions:
  allowed: ["read_fs", "write_fs"]
  allowedPaths: ["./src"] # 只能修改 src 目录，无法触碰配置文件
```

## 3.4 开发者视角：扩展一个新工具

如果您需要为 Agent 添加一个特定的 API 调用能力，推荐流程如下：
1.  **简单逻辑**：编写一个 L2 Skill 注入 Prompt。
2.  **通用能力**：寻找或编写一个 MCP Server 并注册。
3.  **系统集成**：如果必须操作本地资源，使用 L0 Shell 并配合严格的权限策略。

---

通过“工具三位一体”，您可以构建出既强大又安全的 Agent。然而，在真实世界中，任务可能会中断，网络会抖动。在下一章中，我们将学习如何利用 **Phase 1 (Reliability)** 确保 Agent 的稳定存续。
