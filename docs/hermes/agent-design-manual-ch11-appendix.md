# 第十一至十三部分 + 附录

---

# 第十一部分：多模型与多 Provider 适配

## 11.1 API Mode 三态路由

Hermes 通过 Provider + Base URL + Model 三维判定，将 API 调用路由到三种模式之一：

| 模式 | 适用 Provider | 特点 |
|:---|:---|:---|
| `chat_completions` | OpenAI, OpenRouter, 大多数 Provider | 标准 tool_calls 格式 |
| `codex_responses` | OpenAI Codex | Responses API 格式 |
| `anthropic_messages` | Anthropic (直连) | Messages API + cache_control |

路由逻辑在 `run_agent.py` 初始化时确定，整个会话内不变。

## 11.2 Credential Pool 与 Key 轮换

- 配置多个 API Key，自动轮换
- Rate Limit (429) 感知——切换到下一个 Key 而非等待
- 与 Provider Fallback 联动：同 Provider 先换 Key，Key 都限流了再换 Provider

> **避坑**: 单 Key 配置 = 单点故障。高频使用场景必须配置 Key Pool。

## 11.3 模型行为差异的工程对策

### Reasoning 标签变体统一

| 模型 | 标签格式 | 处理方式 |
|:---|:---|:---|
| DeepSeek-R1 | `<think>...</think>` | 正则剥离 |
| QwQ | `<thought>...</thought>` | 正则剥离 |
| Claude 3.5+ | `thinking` content block | 结构化提取 |
| Gemini | 无标签，reasoning 在 content 中 | 启发式分离 |

6 种变体通过统一的 `_strip_reasoning_tags()` 处理，确保 visible content 的一致性。

### Tool Call ID Sanitization

不同 Provider 返回的 tool_call_id 格式不一致（有的是 UUID，有的是递增整数，有的为空）。Hermes 在接收响应后立即标准化：空 ID → 生成 UUID，确保后续 tool result 匹配。

---

# 第十二部分：可扩展性设计模式

## 12.1 插件系统 — 模板方法模式

### MemoryProvider ABC

10+ 生命周期 Hook，采用**默认空实现 + 可选覆盖**的模板方法模式：

```python
class MemoryProvider(ABC):
    # 必须实现 (3 个)
    @abstractmethod
    def name(self) -> str: ...
    @abstractmethod
    def is_available(self) -> bool: ...
    @abstractmethod
    def initialize(self, session_id, **kwargs): ...

    # 可选覆盖 (8+ 个) — 默认空实现
    def system_prompt_block(self) -> str: return ""
    def prefetch(self, query) -> str: return ""
    def sync_turn(self, user, assistant): pass
    def on_turn_start(self, turn, message, **kwargs): pass
    def on_session_end(self, messages): pass
    def on_pre_compress(self, messages) -> str: return ""
    def on_memory_write(self, action, target, content): pass
    def on_delegation(self, task, result, **kwargs): pass
```

插件只需实现 3 个抽象方法即可工作，其余 Hook 按需覆盖。每个 Hook 调用都被 `try/except` 隔离——插件异常永远不阻断主循环。

> **最佳实践**: ABC 接口设计应最小化必须实现的方法数量。可选 Hook 提供默认空实现，降低插件开发门槛。

## 12.2 技能的开放标准

技能格式遵循 [agentskills.io](https://agentskills.io) 开放标准：

```yaml
# SKILL.md Frontmatter
---
name: systematic-debugging
description: Methodical approach to debugging complex issues
version: 1.2.0
platforms: [cli, telegram]
requires_toolsets: [terminal]
metadata:
  hermes:
    category: software-development
    trigger: "Use when encountering any bug or unexpected behavior"
---
```

技能来源三层：预置 (40+) → 自创 (Nudge 生成) → 社区 Hub 下载。跨兼容 Agent 无需格式转换。

## 12.3 多平台网关

- 会话绑定 session_id 而非平台——Telegram 开始的对话可以在终端继续
- 各平台消息长度上限不同 (Telegram 4096, Discord 2000)——Gateway 层自动分片
- Telegram 项目对话：Topic 功能运行独立工作流（专属技能绑定 + 独立上下文）

---

# 第十三部分：反模式与避坑指南总汇

> 本章将前 12 部分散落的反模式集中汇总，作为新 Agent 项目的 **Code Review Checklist**。

## 13.1 架构级反模式

| 反模式 | 问题 | 重构方向 |
|:---|:---|:---|
| ❌ God Class (10,900 行 `AIAgent`) | 职责混杂，无法独立测试 | 拆分为 `TurnExecutor` + `ErrorRecoveryChain` + `PromptBuilder` |
| ❌ 内置工具 if/elif 硬编码分发 | 新增工具必须修改核心文件 | 统一走 Registry dispatch + ContextProvider 注入 |
| ❌ 12 个 Callback 参数传入构造器 | 构造器签名膨胀 | `EventBus` / `AgentEventListener` 接口 |

## 13.2 学习循环反模式

| 反模式 | 后果 |
|:---|:---|
| ❌ 只记事件不提炼方法 | Agent 无法从经验中改进 |
| ❌ 全量重写技能而非 patch | 丢失好用部分 + 浪费 token |
| ❌ Review Agent 不禁用 Nudge | Review → Nudge → Review 无限递归 |
| ❌ 记忆不设大小上限 | System Prompt 膨胀，Prefix Cache 命中率下降 |

## 13.3 Prompt 级反模式

| 反模式 | 后果 |
|:---|:---|
| ❌ System Prompt 中段插入 turn-level 变量 | 每轮击穿 Prefix Cache，成本增加 ~75% |
| ❌ 全量知识库注入 System Prompt | Token 爆炸 + 注意力稀释 |
| ❌ 压缩摘要使用自由格式 | 关键信息（Pending Asks / Files / Decisions）不可追踪地丢失 |

## 13.4 LLM 控制级反模式

| 反模式 | 后果 |
|:---|:---|
| ❌ 单一 retry_count 混合处理所有错误 | 截断和格式错误需要不同的恢复策略 |
| ❌ Fallback 模型永久替代主模型 | 一次临时故障导致永久降级 |
| ❌ Redaction 开关运行时环境变量控制 | LLM 可通过 `export` 命令绕过 |

## 13.5 工具 / 执行级反模式

| 反模式 | 后果 |
|:---|:---|
| ❌ 工具输出不限大小直接注入 messages | 一次 `cat` 大文件耗尽上下文 |
| ❌ 不检测重复读取 | Agent 陷入 read 循环耗尽迭代预算 |
| ❌ 文件写入前不检查 staleness | 覆盖外部修改 |
| ❌ 容器安全作为可选开关 | Agent 可 `rm -rf /` 或提权 |

---

# 附录

## A. 术语表

| 术语 | 定义 |
|:---|:---|
| **ReAct** | Reasoning + Acting 循环模式 |
| **Nudge** | 定时触发的自省式记忆/技能审查机制 |
| **Prefix Cache** | LLM API 对稳定输入前缀的缓存优化 |
| **Ephemeral Prompt** | 临时注入到 System Prompt 尾部的易变内容 |
| **Thinking Prefill** | 保留 reasoning-only 响应让模型续写 visible content |
| **Progressive Disclosure** | 渐进式披露：默认只加载索引，按需加载完整内容 |
| **Patch-first Evolution** | 优先补丁更新而非全量重写 |
| **Episodic Memory** | 情景记忆：记住"发生了什么" (Session Retrieval) |
| **Procedural Memory** | 过程记忆：记住"该怎么做" (Skills) |
| **agentskills.io** | 技能文件的开放标准格式 |
| **Turn-scope Fallback** | Fallback 仅在当前 turn 生效，下次恢复主模型 |
| **SOUL.md** | 用户可编辑的 Agent 身份定义文件 |
| **nuke-and-repave** | MCP 工具刷新策略：先全部反注册，再重新注册 |

## B. 各章节与源码分析报告的对照表

| 手册章节 | 源码分析报告 | 核心源文件 |
|:---|:---|:---|
| 第一部分 | codebase-highmap + runtime-architecture | run_agent.py |
| 第二部分 | runtime-architecture §5 | run_agent.py L2130–L2260, L7887–L7920 |
| 第三部分 | codebase-highmap §2D | agent/memory_manager.py, tools/memory_tool.py |
| 第四部分 | prompt-architecture | agent/prompt_builder.py, agent/context_compressor.py |
| 第五部分 | output-control §2 | tools/registry.py, model_tools.py |
| 第六部分 | output-control §1, §3 | run_agent.py L9750–L10370 |
| 第七部分 | prompt-architecture §4 | agent/redact.py, tools/file_tools.py |
| 第八部分 | prompt-architecture §2 | agent/context_compressor.py |
| 第九部分 | codebase-highmap §2A | tools/environments/*.py |
| 第十部分 | 源码验证 | cron/jobs.py, cron/scheduler.py |
| 第十一部分 | runtime-architecture §1 | agent/anthropic_adapter.py |
| 第十二部分 | codebase-highmap §2D | agent/memory_provider.py, gateway/ |
| 第十三部分 | 全部报告汇总 | — |

## C. 快速检查清单（新 Agent 项目 Day 1 Checklist）

**学习循环**
- [ ] 是否有自省式记忆精选机制？（Nudge 模式）
- [ ] 是否支持将成功工作流自动固化为可复用技能？
- [ ] 技能更新是否优先 patch 而非全量重写？

**内存系统**
- [ ] 是否将情景记忆和过程记忆分开存储？
- [ ] Prompt Memory 是否设置了字符上限？
- [ ] 技能加载是否采用渐进式披露？

**Prompt 工程**
- [ ] System Prompt 是否分层组装？是否有 Prefix Cache 友好的缓存策略？
- [ ] 动态内容是否与静态 Prompt 分离？Ephemeral 是否追加在尾部？
- [ ] 上下文压缩是否使用结构化模板？

**输出控制**
- [ ] 输出校验是否对不同错误类型有独立 retry 计数器？
- [ ] 是否有工具名模糊修复机制？
- [ ] 是否有 Provider Fallback + Turn-scope 恢复？

**安全**
- [ ] 用户可控文件是否经过注入扫描？
- [ ] 敏感信息脱敏是否覆盖工具输出通道？
- [ ] 容器安全是否设为默认约束而非可选开关？

**工具与执行**
- [ ] 工具结果是否有 per-result 和 per-turn 的大小限制？
- [ ] 是否有 re-read loop 硬阻断？
- [ ] 子代理是否隔离了父 Context 和敏感工具？

## D. Hermes 与多 Agent 框架的架构对比

| 维度 | Hermes | 多 Agent 框架 (OpenClaw 等) |
|:---|:---|:---|
| **核心模式** | 单体自进化 | 多智能体协同调度 |
| **记忆哲学** | 记住"什么管用" + 固化为技能 | 记住"发生了什么" + 中心路由 |
| **学习方式** | 运行时闭环自进化 (Nudge → Skill) | 跨会话上下文保留 |
| **网关角色** | 学习循环的组成部分 | 纯消息投递 |
| **扩展方式** | 技能文件 (0 代码) + 插件钩子 | Agent 定义 + 编排配置 |
| **状态管理** | 本地 SQLite | 通常依赖外部数据库 |
| **适用场景** | 长期运行、持续进化的个人/专用助理 | 复杂多步任务的并行分治 |

---

> **手册完成**。全部 13 部分 + 附录覆盖了 Hermes Agent 的核心架构设计。
> 建议 KyberKit 团队以附录 C 的检查清单作为新项目的 Day 1 基线。
