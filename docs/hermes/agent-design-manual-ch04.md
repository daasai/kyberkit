# 第四部分：Prompt 工程方法论

> **前置依赖**: [第三部分：四层内存系统](./agent-design-manual-ch03.md) | [Prompt 架构分析报告](./prompt-architecture.md)
>
> 本章解析 Hermes 在 Prompt 工程层面的核心设计：如何将 9 个独立层条件组装为一个完整的 System Prompt，如何保护 Prefix Cache 不被击穿，如何用结构化模板做上下文压缩，以及如何为不同模型注入行为约束。

---

## 4.1 System Prompt 的 9 层分层组装

### 核心命题

> **System Prompt 不是一段固定文本，而是一条由 9 个独立层按条件门控拼接的流水线。每一层的存在与否取决于运行时状态。**

### 组装优先级序列

`_build_system_prompt()` (`run_agent.py` L3121–L3286) 按以下顺序拼接各层，最终通过 `"\n\n".join()` 合并为一个 system message：

| 序号 | 层名                | 注入条件                        | Token 预估     | 缓存特性   |
| :- | :---------------- | :-------------------------- | :---------- | :----- |
| 1  | **Agent Identity** | SOUL.md 存在 → 用 SOUL.md；否则 → DEFAULT_AGENT_IDENTITY | 50–2,000    | 会话级稳定 |
| 2  | **工具行为指导**        | `valid_tool_names` 集合检查 (memory / session_search / skill_manage) | 100–300     | 会话级稳定 |
| 3  | **模型特化约束**        | 模型名 substring 匹配 (gemini / gpt / codex) | 0–800       | 会话级稳定 |
| 4  | **Custom System Message** | 参数传入 (Gateway 可配)            | 0–500       | 外部控制  |
| 5  | **持久化记忆**         | MemoryStore 初始化 + 功能启用      | 200–2,000   | 冻结快照  |
| 6  | **技能索引**          | skills 工具可用                  | 200–1,500   | LRU 缓存 |
| 7  | **项目上下文**         | 文件存在性检查 (.hermes.md > AGENTS.md > CLAUDE.md > .cursorrules) | 0–20,000    | 工作目录敏感 |
| 8  | **时间戳/元数据**       | 始终注入                        | 30–80       | 每会话不同 |
| 9  | **平台/环境提示**       | 平台/WSL 检测                   | 0–200       | 运行环境敏感 |

### 条件注入 = Token 节约

每层都有精确的 gate condition。如果 `memory` 工具不在 `valid_tool_names` 中，`MEMORY_GUIDANCE` 就不会注入——而不是注入一段"你没有 memory 工具"的说明。同理，Skills Index 只在 skills 工具可用时构建。

```python
# run_agent.py L3150–L3159
tool_guidance = []
if "memory" in self.valid_tool_names:
    tool_guidance.append(MEMORY_GUIDANCE)
if "session_search" in self.valid_tool_names:
    tool_guidance.append(SESSION_SEARCH_GUIDANCE)
if "skill_manage" in self.valid_tool_names:
    tool_guidance.append(SKILLS_GUIDANCE)
if tool_guidance:
    prompt_parts.append(" ".join(tool_guidance))
```

> **最佳实践**: System Prompt 的每一层都应有明确的 gate condition。不适用的指导就不注入——节省 token 且避免模型关注无法执行的指令。
>
> **避坑**: 注入 "你没有 X 工具" 这类否定指令通常适得其反——模型反而会更关注被禁止的行为。

---

## 4.2 Prefix Cache 友好的静态/动态分离

### 核心命题

> **LLM API 的 Prefix Cache 要求输入序列的前缀在多次调用间保持完全一致。System Prompt 中任何一个字符的变化，都会导致后续所有 token 的缓存失效。**

### Hermes 的缓存策略

Hermes 通过三层机制保护 Prefix Cache：

**1. 会话级 System Prompt 缓存**

```python
# run_agent.py L7914–L7920
# ── System prompt (cached per session for prefix caching) ──
# Built once on first call, reused for all subsequent calls.
# Only rebuilt after context compression events.
```

整个会话中 `_build_system_prompt()` 只调用一次，结果缓存在 `_cached_system_prompt`。后续每轮 API 调用直接复用——System Prompt 的内容在会话内**完全稳定**。

**2. Ephemeral 尾部追加设计**

```
┌──────────────────────────────────────┐
│  Cached System Prompt (稳定前缀)      │ ← Prefix Cache 命中区域
├──────────────────────────────────────┤
│  ephemeral_system_prompt (易变尾部)    │ ← 不破坏 cache prefix
└──────────────────────────────────────┘
```

`ephemeral_system_prompt` 不参与 `_build_system_prompt()`，而是在 API 调用时追加到 System Prompt 尾部。这确保了稳定前缀不被临时内容打断。

**3. 动态上下文注入到 User Message**

所有 turn-level 的动态内容都注入 User Message 而非 System Prompt：

| 动态内容               | 注入位置          | 理由                    |
| :----------------- | :------------ | :-------------------- |
| MemoryManager prefetch | 当前 turn User Message 尾部 | turn-level 变化，不影响 system prefix |
| Plugin pre_llm_call   | 当前 turn User Message 尾部 | 同上                    |
| Memory Nudge 提醒       | User Message 附加   | 同上                    |

代码中有明确注释：

```python
# run_agent.py L8213–L8216
# NOTE: Plugin context from pre_llm_call hooks is injected into the
# user message, NOT the system prompt. This is intentional — system
# prompt modifications break the prompt cache prefix.
```

### 三种缓存击穿条件

| 条件           | 频率    | 对策                   |
| :----------- | :---- | :------------------- |
| 上下文压缩后重建     | 罕见    | 压缩后 System Prompt 重建，新的稳定前缀开始 |
| 会话中途切换模型     | 罕见    | 不可避免，新模型需要新的 system prompt |
| Memory/Context 文件被外部修改 | 极罕见 | 下次会话自动重建             |

> **最佳实践**: System Prompt = 会话级常量。所有 turn-level 动态内容（插件上下文、记忆召回、Nudge）必须注入 User Message。
>
> **避坑**: 在 System Prompt 中段插入 turn-level 变量（如当前时间、动态检索结果），会导致前缀 hash 每轮变化。对于一个 20 轮的会话，这意味着 19 次缓存未命中，Token 成本增加 ~75%。

---

## 4.3 模型特化行为约束

### 核心命题

> **不同模型家族有不同的"坏习惯"。通用 System Prompt 无法覆盖所有模型的行为差异——需要按模型注入特化约束。**

### 三类特化 Prompt

Hermes 通过模型名 substring 匹配，有条件地注入特化约束：

```python
# run_agent.py L3188–L3195
_model_lower = (self.model or "").lower()
if "gemini" in _model_lower or "gemma" in _model_lower:
    prompt_parts.append(GOOGLE_MODEL_OPERATIONAL_GUIDANCE)
if "gpt" in _model_lower or "codex" in _model_lower:
    prompt_parts.append(OPENAI_MODEL_EXECUTION_GUIDANCE)
```

| Prompt                             | 目标模型        | 约束内容                         |
| :-------------------------------- | :---------- | :--------------------------- |
| `TOOL_USE_ENFORCEMENT_GUIDANCE`    | 匹配列表中的模型    | 强制使用工具而非口头描述意图               |
| `GOOGLE_MODEL_OPERATIONAL_GUIDANCE` | Gemini/Gemma | 简洁输出 + 绝对路径 + 并行工具调用 + 先验证再编辑 |
| `OPENAI_MODEL_EXECUTION_GUIDANCE`  | GPT/Codex   | 工具持久性 + 前置检查 + 验证 + 反幻觉     |

### TOOL_USE_ENFORCEMENT 的三态配置

```yaml
# config.yaml
agent:
  tool_use_enforcement: "auto"   # 默认值
```

| 值       | 行为                          |
| :------ | :-------------------------- |
| `auto`  | 匹配 `TOOL_USE_ENFORCEMENT_MODELS` 硬编码列表 |
| `true`  | 所有模型都注入                     |
| `false` | 所有模型都不注入                    |
| `[list]` | 自定义模型名 substring 列表         |

### Codex ACK 拦截器

除了 Prompt 层约束，Hermes 还在代码层做了**行为验证**——如果模型说 "I'll look into it" 而没有实际调用工具，代码会强制执行。这不是 Prompt 能解决的问题，而是工程兜底。

> **最佳实践**: 建立 `ProviderQuirksRegistry`，按模型家族注册行为特化 Prompt。新增模型只需注册新条目，无需修改核心逻辑。
>
> **避坑**: 不要假设所有模型对同一 Prompt 有相同反应。GPT 系模型倾向于"口头承诺"而非立即执行，Gemini 倾向于过度冗长的输出——每个坏习惯都需要针对性约束。

---

## 4.4 上下文压缩的结构化模板

### 核心命题

> **上下文压缩不是"删掉旧消息"，而是"用结构化摘要替代旧消息"。自由格式的摘要会导致关键信息不可追踪地丢失。**

### 11 Section 结构化模板

Hermes 的压缩 Prompt 强制 LLM 按以下 11 个 Section 生成摘要：

```markdown
## Goal                    — 用户最终目标
## Constraints & Preferences — 用户的偏好、约束、已做决策
## Progress
  ### Done                 — 已完成的工作
  ### In Progress          — 正在进行的工作
  ### Blocked              — 阻塞项
## Key Decisions           — 关键技术决策及原因
## Resolved Questions      — 已回答的问题 (含答案)
## Pending User Asks       — 尚未回答的用户请求
## Relevant Files          — 涉及的文件路径 + 简要说明
## Remaining Work          — 剩余工作描述
## Critical Context        — 关键值/错误信息/配置
## Tools & Patterns        — 工具使用模式及发现
```

### 双模式压缩架构

| 模式                | 触发条件                      | 输入                    | 策略          |
| :---------------- | :------------------------ | :-------------------- | :---------- |
| **Mode A: 首次压缩** | `_previous_summary is None` | 全部待压缩 turns          | 从零生成完整摘要    |
| **Mode B: 迭代更新** | `_previous_summary exists`  | 上次摘要 + 新增 turns      | 增量更新已有摘要    |

Mode B 是长会话的关键——第二次压缩时不需要重新处理已经压缩过的内容，只需将新增 turns **整合进已有摘要**。

### Token 预算计算

```python
summary_budget = max(1000, min(content_tokens * 0.30, context_length * 0.05))
```

- 下限 1,000 token — 防止摘要过于简略
- 上限 = `min(内容量的 30%, 窗口的 5%)` — 防止摘要本身占用过多空间

### Turns 序列化策略

压缩前，原始对话通过 `_serialize_for_summary()` 转换为标记化文本：

```
每条 message:
  tool    → "[TOOL RESULT {call_id}]: {content[:6000]}"
  assistant → "[ASSISTANT]: {content[:6000]}" + "[Tool calls: {name}({args[:1500]})]"
  user    → "[USER]: {content[:6000]}"

单条截断: Head 4000 chars + "[...truncated...]" + Tail 1500 chars
```

截断策略是 Head + Tail 而非纯 Head——保留消息尾部通常更有信息价值（结论/结果在末尾）。

> **最佳实践**: 压缩摘要必须使用**结构化模板**，至少包含：Goal、Progress、Pending Asks、Relevant Files。`Pending User Asks` 和 `Resolved Questions` 这两个 Section 尤为关键——防止模型在压缩后忘记用户未回答的请求或重复回答已解决的问题。
>
> **避坑**: 自由格式摘要会导致三类信息不可追踪地丢失：(1) 尚未回答的用户请求，(2) 涉及的文件路径，(3) 已做出的关键技术决策。一旦丢失，模型会重新做出可能矛盾的决策。

---

## 4.5 子代理 Prompt 的隔离设计

### 核心命题

> **子代理是一个独立的执行沙箱——继承工作目录，但隔离记忆、上下文文件和敏感工具。**

### Prompt 结构

子代理的 System Prompt 遵循 **Task → Context → Workspace → Output Format** 的聚焦结构：

```
┌──────────────────────────────────────┐
│  Task Description (父 Agent 传入)      │
├──────────────────────────────────────┤
│  Context (精简的工作环境信息)              │
│  - 工作目录                             │
│  - 可用工具列表                          │
├──────────────────────────────────────┤
│  Output Format Constraint              │
│  - "Return ONLY your final answer"     │
│  - "Do NOT summarize your process"     │
└──────────────────────────────────────┘
```

### 隔离边界

| 维度           | 父 Agent         | 子代理                  |
| :----------- | :-------------- | :------------------- |
| 工作目录         | 当前 CWD         | ✅ 继承                 |
| 记忆 (MEMORY.md) | 已加载            | ❌ `skip_memory=True`  |
| 上下文文件        | SOUL.md 等已注入    | ❌ `skip_context_files=True` |
| 敏感工具         | 全部可用            | ❌ 剥离 (clarify 等)     |
| 迭代预算         | max 90          | 独立 max 45 (可配)       |
| Nudge        | 正常触发            | ❌ 禁用                 |

> **最佳实践**: 子代理必须隔离父 Agent 的记忆和上下文文件。否则：(1) 父 Agent 的私人记忆泄漏给子任务；(2) 项目级指令（SOUL.md）可能与子任务矛盾。
>
> **避坑**: 子代理共享父 Agent 的 `messages` 列表 → 上下文污染。子代理必须使用独立的 `conversation_history` 副本。

---

## 4.6 对 KyberKit 的设计建议

### 必须采纳

| 模式                   | 理由                                         |
| :------------------- | :----------------------------------------- |
| **分层条件组装**           | 不适用的层不注入 — Token 精确可控                      |
| **System Prompt 会话级缓存** | 保护 Prefix Cache — ~75% 成本节约                |
| **动态内容注入 User Message** | 不破坏 System Prompt 前缀稳定性                    |
| **结构化压缩模板**          | 防止关键信息丢失 (Pending Asks / Files / Decisions) |
| **子代理隔离**            | 独立预算 + 剥离敏感工具 + 跳过记忆/上下文文件               |

### 推荐参考

| 模式                   | 理由                                         |
| :------------------- | :----------------------------------------- |
| **模型特化 Prompt 注册表**  | 新模型只需注册 quirks，不修改核心逻辑                     |
| **双模式压缩 (首次 + 迭代)** | 长会话中避免重复处理已压缩内容                            |
| **Head+Tail 截断**      | 保留消息尾部（通常包含结论和结果）                          |

---

## 本章核心要点速查

| 概念            | 定义                              | 源码位置                   |
| :------------ | :------------------------------ | :--------------------- |
| 9 层分层组装       | 条件门控的 System Prompt 流水线         | `run_agent.py` L3121–L3286 |
| Prefix Cache 保护 | System Prompt 会话级缓存 + Ephemeral 尾部追加 + 动态内容注入 User Message | L7914–L7920, L8211–L8216 |
| 模型特化约束        | 按模型名 substring 匹配注入行为纠偏 Prompt   | L3188–L3195            |
| 结构化压缩模板       | 11 Section 强制格式 + 双模式 (首次/迭代)   | `context_compressor.py` L318–L483 |
| 子代理隔离         | 继承 CWD，隔离记忆/上下文/敏感工具/迭代预算       | `delegate_tool.py` L90–L122 |

---

> **下一章**: [第五部分：工具系统设计](./agent-design-manual-ch05.md)
