# Sprint 2 Implementation Review

> Date: 2026-04-16  
> Scope: Sprint 1 carry-over fixes + Step 4 (AssetRegistry) + Step 5 (PromptAssembler) + Step 6 (Command System)

---

## 测试总览

- 全量测试结果：`121/121` 通过，`0` 失败。
- Sprint 1 遗留失败项（MemoryStore / SqliteTrajectoryStore / KevinPrompt / RetryStrategy）已恢复到全绿状态。

---

## Step 0: Sprint 1 遗留修复评审

| 缺陷项 | 结论 | 说明 |
|---|---|---|
| D1: thinking 内容缺失 | PASS | `ContentAccumulatorMiddleware` 在 `turn_complete` 时正确包装 `<thinking>...</thinking>`。 |
| D2: 工具输入双重解析 | PASS | `turn_complete` 构建 content 时使用 `context.pendingToolUses`，消除双重解析路径。 |
| D3: StreamEventMapper 重构 | PASS | 事件映射与 tool_use 输入累积已统一收敛到 `StreamEventMapper`。 |
| D4: dead code 清理 | PASS | 相关空分支已清理。 |
| D7: chatStream 单测补写 | MISS | `AnthropicProvider.chatStream()` 仍缺少独立单元测试覆盖。 |
| KevinPrompt.test 测试框架统一 | PASS | 已统一到 `bun:test`。 |

---

## Step 4: AssetRegistry 评审

### 结果

- `src/types/assets.ts` 与设计规范一致。
- `KKMdLoader` 实现符合三级合并策略（user -> workspace -> project）。
- `MemoryDirScanner` 正确使用 `gray-matter` 解析 frontmatter，并跳过 `MEMORY.md`。
- `DefaultAssetRegistry` 已实现核心扫描与查询路径，但存在关键待补项。

### 主要问题

1. `watch()` 仅完成监听注册，回调体未触发 `AssetChangeEvent`，未满足验收标准。  
2. `lastModified` 使用 `Date.now()`，不是文件真实 `mtime`，会影响后续精确变更判断。  
3. 当前扫描聚焦 `KK.md` 与 `memories`，`skills`/`commands` 未并入完整扫描。

---

## Step 5: PromptAssembler 评审

### 结果

- `PromptAssembler` 的注册排序、预算裁剪、优先级保留策略符合规范。
- `IdentityProvider`、`ToolSchemaProvider`、`UserDirectiveProvider`、`EnvironmentProvider` 行为符合预期。
- `AssemblyContext` 在实现中扩展了 `memoryContext` 与 `reliability` 字段，向后兼容。

### 设计偏差（可接受）

- `MemoryProvider` 实现采用 `context.memoryContext` 注入，而非构造函数 getter。该改动简化耦合，行为上可接受。

---

## Step 6: Command System 评审

### 结果

- `CommandRegistry` 的注册、解析、执行主流程符合规范。
- `/help`、`/cost`、`/memory list`、`/compact` 均已落地并通过测试。
- 相比规范草案，`execute()` 增加了 try/catch 兜底，提升鲁棒性。

### 风险点

- 现阶段命令拦截在 `agentLoop` 前置处理，某些分支会直接触发 `task_done`，对 REPL 持续会话有提前终止风险。

---

## Runtime 集成评审

### 结果

- `WorkspaceRegistry`、`WorkspaceInstance`、`KyberRuntime` 已完成基础集成。
- 默认 workspace 初始化、assets 扫描、prompt/command 注入链路基本打通。
- `AgentLoopDeps` 已扩展 `promptAssembler` / `commandRegistry` / `workspace`，保留兼容路径。

---

## 分级问题清单

## P0（建议 Sprint 3 前修复）

1. `AnthropicProvider.chatStream()` 缺少独立单测（D7 未闭环）。  
2. 命令拦截导致 agent 生命周期提前结束（REPL 场景风险高）。

## P1（应尽快修复）

1. `AssetRegistry.watch()` 未发出变更事件。  
2. `lastModified` 未使用真实文件时间戳。  
3. `skills`/`commands` 目录尚未纳入完整扫描。

## P2（可排期优化）

1. `WorkspaceRegistry.get()` 返回 `undefined` 的调用契约可进一步收敛。  
2. `MemoryDirScanner` 存在 sync/async 混用，后续可统一为异步实现。  
3. `ContentAccumulator` 缺少 thinking 专项单测（当前覆盖以 text/tool_use 为主）。

---

## 结论

Sprint 2 实现整体完成度高，主路径功能与测试基线稳定。当前阻塞项主要集中在流式测试闭环（D7）、命令拦截生命周期语义、以及 Asset 监听与变更精度。若按 P0/P1 顺序修复，Sprint 3 进入 TUI/REPL 深化阶段的风险可明显下降。

