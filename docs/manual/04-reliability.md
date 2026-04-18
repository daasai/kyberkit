# 第 4 章：Phase 1 —— 可靠性与状态管理

在工业级应用中，Agent 不能因为一次网络闪断或进程崩溃就“丢失记忆”或“重头开始”。KyberKit 的 **Phase 1 (Reliability)** 提供了分层记忆系统与原子检查点机制，确保您的 Agent 具备顽强的生命力。

## 4.1 分层记忆系统 (Tiered Memory)

KyberKit 并不简单地将所有历史记录丢给模型，而是将其划分为三个层级进行精细化管理：

### 4.1.1 工作记忆 (Working Memory - L1)
- **生命周期**：单次推理调用。
- **存储内容**：当前上下文窗口内的消息流、正在处理的任务片段。
- **特性**：存在于内存中，速度极快，但在窗口溢出时会被截断。

### 4.1.2 会话记忆 (Session Memory - L2)
- **生命周期**：单次 Session 的全程。
- **存储内容**：任务目标、已完成的进度、关键决策、已发现的错误与待解决问题。
- **物理落地**：Session 目录下的 JSON 文件（含结构化 Markdown 笔记 + 元数据）。
- **自动沉淀**：当对话 Token 量、工具调用次数或轮次达到阈值时，KyberKit 会**异步**调用一次轻量模型，把最近的消息凝练成固定 7 段式 Markdown 笔记（目标 / 进度 / 决策 / 发现 / 待解 / 错误 / 下一步），并在下一轮自动注入 System Prompt。
- **一致性**：即使 LLM 忘记了之前的对话，Session Memory 依然保留着任务的关键节点。

### 4.1.3 长期记忆 (Long-term Memory - L3)
- **生命周期**：永久，跨 Session / 跨项目共享。
- **存储内容**：用户偏好（`user`）、项目知识（`project`）、外部参考片段（`reference`）。
- **物理落地**：`.kyberkit/memories/<category>/<slug>-<id8>.md` —— 每条记忆一个带 YAML frontmatter 的 Markdown 文件；根目录下的 `MEMORY.md` 是自动维护的人类可读索引。
- **编辑方式**：您可以直接用文本编辑器修改 / 删除 / 新增，无需任何专用工具；也可以把 `.kyberkit/memories/` 纳入 git 版本控制。
- **自动沉淀**：每轮结束（`end_turn`）后，KyberKit 以节流策略调用一次提取器，抽取对话中的**原子化、跨会话仍有价值**的知识，追加为新文件（按 `category::title` 精确去重，不产生重复条目）。
- **三级作用域合并**：`~/.kyberkit/memories/`（用户级）→ `workspaces/<id>/memories/`（工作区级）→ `<cwd>/.kyberkit/memories/`（项目级），三者合并注入 Prompt。自动写入默认落在项目级，可通过 `KYBER_MEMORY_WRITE_SCOPE=user|workspace|project` 覆盖。

## 4.2 原子检查点 (Atomic Checkpoints)

KyberKit 的 **CheckpointManager** 负责在关键时刻（如工具执行前后、用户输入后）捕获 Agent 的完整状态。

### 4.2.1 写入即重命名策略
为了防止快照写入过程中崩溃导致数据损坏，KK 采用 *write-then-rename* 策略，确保每个 `.json` 快照文件都是完整且有效的。

### 4.2.2 中断感知恢复 (Interruption-Aware Recovery)
这是 KyberKit 的“超级力量”之一。当从检查点恢复时，KK 会自动检测中断类型：

- **中途中断 (interrupted_turn)**：如果 Agent 在执行工具调用时意外关闭，恢复后 KK 会自动注入一条提示：“继续你刚才未完成的工作”，引导模型恢复执行。
- **提示词中断 (interrupted_prompt)**：如果用户发送了消息但 Agent 尚未响应就已重启，系统会记录该状态并确保用户请求不被遗漏。

## 4.3 异常处理与重试机制

KyberKit 将异常分为两类，并提供不同的处理策略：

1.  **瞬态异常 (Transient)**：如网络超时、模型 API 速率限制。
    - **策略**：自动指数避退重试 (Exponential Backoff)。
2.  **永久异常 (Permanent)**：如输入非法、权限不足。
    - **策略**：记录轨迹，上报错误，并寻找确定性的降级路径（Fallback）。

## 4.4 开发者实践：手动创建检查点

虽然 KK 会自动管理状态，但在复杂的 Skill 执行逻辑中，您也可以手动触发快照：

```typescript
const checkpointId = await runtime.checkpointManager.save(agent, session);
console.log(`关键里程碑已保存: ${checkpointId}`);
```

---

有了可靠性保障，您的 Agent 已经可以应对复杂的生产环境。下一步，我们需要进入 **Phase 2 (Observability)**，揭开 Agent 推理过程的“黑盒”，实现全栈透明化。
