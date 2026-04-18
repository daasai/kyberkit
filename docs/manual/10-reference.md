# 第 10 章：最佳实践、安全与 API 参考

作为本手册的最后一章，我们将从工程实践的角度总结如何构建高性能、高安全性的 KyberKit Agent，并提供核心 API 的快速查询手册。

## 10.1 确定性优先 (Deterministic First) 实践准则

在开发过程中，请始终问自己一个问题：“这个逻辑模型能直接写对吗？”

- **规则 1**：如果输入是结构化的（如 JSON），必须使用 `Zod` 进行 Schema 校验，严禁让模型猜测字段。
- **规则 2**：如果涉及多步依赖，必须显式定义为 `TaskGraph` 中的节点，严禁让模型在单个回复中处理所有逻辑。
- **规则 3**：对于高风险操作（如删除数据库），必须设置权限标签为 `ask` 模式，强制人工介入。

## 10.2 安全防护 SOP (Security Standard Operating Procedure)

KyberKit 的设计目标是防御“针对 Agent 的攻击”。

### 10.2.1 防御 Prompt 注入
- 不要直接在 System Prompt 中拼接不受信任的用户输入。
- 使用 **L2 Skill** 进行注入点的隔离，并在 `SKILL.md` 中定义强有力的边界指令。

### 10.2.2 路径逃逸检测
- 始终配置 `allowedPaths`。
- KK 的 Shell 执行器会自动拦截 `../../etc/passwd` 类的非法路径访问。

### 10.2.3 权限最小化
- 不要为了省事授予 `*` 权限。
- 区分 `read_fs` (只读) 与 `write_fs` (可写)。

## 10.3 核心 API 全景图 (API Reference)

### 10.3.1 `KyberRuntime`
系统的引导程序。
- `bootstrap(configPath)`：加载配置文件并启动事件总线。
- `createAgent()`：初始化一个新的智能体上下文。
- `execute(task)`：入口级的任务驱动方法。

### 10.3.2 `PermissionTag`
细粒度权限控制标签：
- `read_fs` / `write_fs`：文件 IO。
- `read_net` / `write_net`：网络访问。
- `exec_shell`：底层命令执行。
- `read_env` / `write_env`：环境变量。

### 10.3.3 `SkillDefinition` (L2)
```typescript
interface SkillDefinition {
  name: string;          // 技能唯一名
  allowedTools: string[]; // 该技能允许调用的底层工具白名单
  execute(args): string; // 返回注入给模型的指令内容
}
```

## 10.4 CLI 指令参考

```bash
# 初始化一个 KyberKit 项目
kyberkit init <project-name>

# [计划中] 运行项目并进入交互式命令行
kyberkit run

# [计划中] 检查当前环境与配置的健康状况
kyberkit doctor
```

## 10.5 交互式斜杠命令 (REPL)

在 TUI / REPL 中可直接键入以下命令。命令会被 Session 层拦截，**不会**进入模型对话上下文，因此 LLM 不会看到它们。

| 命令 | 说明 |
|------|------|
| `/help` | 列出当前可用的全部命令及简要说明。 |
| `/cost` | 打印累计 Input / Output / Cache Token 与估算成本。 |
| `/compact` | 立即触发一次上下文压缩，输出 `before / after / saved` 的 Token 对比；未达阈值时不动原消息。 |
| `/memory list` | 列出当前会话可见的所有长期记忆（按三级作用域合并）。 |
| `/memory add <text>` | 手动追加一条 `user` 类别的记忆，存储为 `.kyberkit/memories/user/<slug>.md`。 |
| `/memory remove <id-prefix 或 title>` | 按 8 位 ID 前缀或完整标题精确匹配，删除对应 Markdown 文件并刷新索引。 |

## 10.6 环境变量

| 变量 | 作用 | 默认 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic 模型凭据 | — |
| `KYBER_COMPACT_MODEL` | 指定压缩 / 提取使用的轻量模型（如 `claude-haiku-4-5`） | 未设置时回落主模型 |
| `KYBER_MEMORY_ENABLED` | 关闭自动记忆提取（`false` 禁用） | `true` |
| `KYBER_MEMORY_WRITE_SCOPE` | 自动提取的长期记忆写入位置：`user` / `workspace` / `project` | `project` |
| `KYBER_MEMORY_SESSION_TOKEN_THRESHOLD` | Session 提取的 Token 阈值 | `4000` |
| `KYBER_MEMORY_SESSION_TOOL_CALL_THRESHOLD` | Session 提取的工具调用阈值 | `8` |
| `KYBER_MEMORY_SESSION_TURN_THRESHOLD` | Session 提取的轮次阈值 | `5` |
| `KYBER_MEMORY_LTM_TURN_COOLDOWN` | 长期记忆提取的最小 turn 间隔 | `3` |
| `KYBER_COMPACTION_HARD_THRESHOLD` / `KYBER_COMPACTION_SOFT_THRESHOLD` / `KYBER_COMPACTION_TARGET_AFTER_COMPACT` / `KYBER_COMPACTION_KEEP_RECENT_ROUNDS` | 自动压缩的 token 阈值、目标体积与保留轮数 | 见 `ConfigLoader` |

---

## 结语：迈向真正的智能体世界

KyberKit 不仅仅是一个工具库，它代表了一种高度负责、确定性驱动的 AI 系统设计理念。通过本手册的学习，您已经掌握了从微内核到大规模集群的全周期开发能力。

现在，去构建那些能够改变世界的 Agent 吧！

**KyberKit - Build with Control, Execute with Certainty.**
