# 第二部分：学习循环 — Agent 自进化的核心引擎

> **前置依赖**: [第一部分：设计哲学与架构决策](./agent-design-manual-ch01.md)
>
> 本章是整份手册中最重要的设计差异化。大多数 Agent 框架关注的是"如何执行当前任务"，Hermes 还关注"如何从每次任务中学到东西，让下次做得更好"。这套学习循环是全自动的——不需要用户手动干预，不需要开发者写规则，Agent 自己决定什么值得记住、什么值得固化为技能。

---

## 2.1 学习循环全景

### 核心命题

> **一个 Agent 只记住"发生了什么"是不够的。它还必须记住"什么管用"，并把管用的方法固化为可复用的操作步骤。**

Hermes 的学习循环是一个嵌入运行时的闭环反馈系统，由四个模块在会话生命周期的不同节点自动触发：

```
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                    Agent 会话执行循环                              │
                         │                                                                 │
 User Message ──────────►│  Think ──► Act ──► Observe ──► Think ──► ... ──► Final Response  │
                         │     │               │                                │           │
                         └─────┼───────────────┼────────────────────────────────┼───────────┘
                               │               │                                │
                   ┌───────────▼───┐   ┌───────▼────────┐          ┌────────────▼──────────┐
                   │  计数器递增     │   │  计数器递增       │          │  触发条件检查            │
                   │ _turns_since  │   │ _iters_since   │          │                       │
                   │   _memory     │   │   _skill       │          │  _should_review_memory │
                   └───────────────┘   └────────────────┘          │  _should_review_skills │
                                                                   └───────────┬───────────┘
                                                                               │
                                                                               ▼
                                                                   ┌───────────────────────┐
                                                                   │ _spawn_background     │
                                                                   │   _review()           │
                                                                   │                       │
                                                                   │  Fork AIAgent 实例     │
                                                                   │  注入 Review Prompt    │
                                                                   │  共享 MemoryStore      │
                                                                   │  执行 memory/skill     │
                                                                   │    _manage 工具        │
                                                                   └───────────────────────┘
                                                                               │
                                                          ┌────────────────────┼────────────────────┐
                                                          ▼                    ▼                    ▼
                                                   MEMORY.md 更新       USER.md 更新        SKILL.md 创建/补丁
                                                   (下次会话生效)        (下次会话生效)        (立即可用)
```

这不是一个事后分析流程——四个模块直接运行在每轮会话的控制循环中，通过计数器和条件判断自动触发。

### 四个核心模块

| 模块             | 触发时机                         | 输入              | 输出                       | 频率              |
| :------------- | :--------------------------- | :-------------- | :----------------------- | :-------------- |
| **Memory Nudge** | 每 N 个 user turn              | 当前会话 messages  | MEMORY.md / USER.md 更新   | 默认每 10 个 turn  |
| **Skill Nudge**  | 每 N 次工具调用迭代                  | 当前会话 messages  | SKILL.md 创建或补丁            | 默认每 10 次迭代     |
| **Background Review** | 响应交付之后，异步后台执行            | messages 快照     | memory + skill 工具调用       | 与 Nudge 同步     |
| **Session Retrieval** | Agent 主动调用 session_search 工具 | 用户查询 + FTS5 索引 | 历史会话摘要（LLM 压缩后注入 context） | 按需             |

---

## 2.2 Memory Nudge — 自省式记忆精选

### 设计理念

大多数 Agent 的记忆系统存在两个极端：
- **什么都记**: 把全部对话历史存进向量数据库，检索时召回一堆无关内容
- **什么都不记**: 每次会话从零开始，用户反复重复同样的偏好

Hermes 避开了这两个极端。它把**筛选记忆的权力交给 Agent 自己**——通过一个系统内部的"定时提醒"机制（Memory Nudge），在固定间隔让 Agent 回头复盘最近的交互，自主判断是否有值得持久化的信息。

### 实现机制

**1. 计数器累加**

在每次 `run_conversation()` 调用时，user turn 计数器递增：

```python
# run_agent.py L7887–L7903
self._user_turn_count += 1
self._turns_since_memory += 1

if (self._memory_nudge_interval > 0
        and "memory" in self.valid_tool_names
        and self._memory_store):
    if self._turns_since_memory >= self._memory_nudge_interval:
        _should_review_memory = True
        self._turns_since_memory = 0   # 重置计数器
```

触发条件必须**同时满足三项**：
1. `_memory_nudge_interval > 0` — 功能未被禁用
2. `"memory" in self.valid_tool_names` — memory 工具在当前 toolset 中可用
3. `self._memory_store` — MemoryStore 已成功初始化

**2. 计数器重置**

当 Agent 在正常工具调用流程中**主动使用**了 `memory` 工具时，计数器归零——不需要等到 Nudge 触发：

```python
# run_agent.py L7254–L7258
if function_name == "memory":
    self._turns_since_memory = 0     # Agent 主动用了 memory，不需要提醒
elif function_name == "skill_manage":
    self._iters_since_skill = 0      # 同理，skill_manage 重置 skill 计数器
```

这个设计避免了一个常见问题：**Agent 刚刚主动存过记忆，Nudge 又来提醒它存一次**。

**3. 触发时机：响应交付之后**

Nudge 的执行发生在 `run_conversation()` 的末尾——**主任务的最终响应已经返回给用户之后**：

```python
# run_agent.py L10629–L10639
# Background memory/skill review — runs AFTER the response is delivered
# so it never competes with the user's task for model attention.
if final_response and not interrupted and (_should_review_memory or _should_review_skills):
    try:
        self._spawn_background_review(
            messages_snapshot=list(messages),   # 深拷贝当前 messages
            review_memory=_should_review_memory,
            review_skills=_should_review_skills,
        )
    except Exception:
        pass  # Background review is best-effort
```

这个顺序是刻意设计的——Review **绝不应阻塞**用户正在等待的响应。

### 配置参数

```yaml
# config.yaml
memory:
  memory_enabled: true
  user_profile_enabled: true
  nudge_interval: 10           # 每 10 个 user turn 触发一次
  flush_min_turns: 6           # 至少 6 个 turn 后才允许首次 flush
  memory_char_limit: 2200      # MEMORY.md 字符上限
  user_char_limit: 1375        # USER.md 字符上限
```

两个文件合计上限 **3,575 字符** — 这是一个**刻意的设计约束**，而非技术限制。目的是逼迫 Agent（和用户）精选记忆内容，而非无脑堆积。

> **最佳实践**: 记忆文件应该是精选内容，而非聊天垃圾堆。3,575 字符的硬上限是正确的——它迫使 Agent 判断什么信息真正值得跨会话携带。
>
> **避坑**: 如果不限制记忆文件大小，长期使用后 System Prompt 中的记忆层会膨胀到数千 token，挤压其他更重要的上下文空间（技能索引、项目文件等），同时降低 Prefix Cache 命中率。

---

## 2.3 Skill Nudge — 自主技能生成

### 设计理念

Memory Nudge 解决的是"记住用户是谁、想要什么"的问题。Skill Nudge 解决的是一个更深层的问题：

> **Agent 刚才用了什么方法解决了问题？这个方法值不值得写下来给下次用？**

这把 Agent 从"记住事件"升级到了"提炼方法论"。

### 实现机制

**1. 计数器基于工具调用迭代**

与 Memory Nudge 基于 user turn 不同，Skill Nudge 基于**工具调用迭代次数**——因为复杂的工具链才是值得固化的对象：

```python
# run_agent.py L8146–L8150
# Track tool-calling iterations for skill nudge.
# Counter resets whenever skill_manage is actually used.
if (self._skill_nudge_interval > 0
        and "skill_manage" in self.valid_tool_names):
    self._iters_since_skill += 1
```

```python
# run_agent.py L10611–L10617
# Check skill trigger NOW — based on how many tool iterations THIS turn used.
_should_review_skills = False
if (self._skill_nudge_interval > 0
        and self._iters_since_skill >= self._skill_nudge_interval
        and "skill_manage" in self.valid_tool_names):
    _should_review_skills = True
    self._iters_since_skill = 0
```

注意关键差异：Memory Nudge 的计数器在 `run_conversation()` 入口递增（基于 user turn），Skill Nudge 的计数器在**主循环体内**递增（基于每次 LLM API 调用迭代）。这意味着一个包含 15 次工具调用的长 turn 足以独立触发 Skill review。

**2. 触发条件**

`skill_manage` 工具的 Schema 描述（`SKILL_MANAGE_SCHEMA`）中明确列出了创建技能的条件：

```
Create when:
  ✓ 复杂任务成功完成（5+ 次工具调用）
  ✓ 从错误中成功恢复
  ✓ 用户纠正后的方法奏效了
  ✓ 发现了非直观的有效工作流
  ✓ 用户要求 Agent 记住某个操作流程

Skip for:
  ✗ 简单的一次性操作
```

这些条件不是硬编码的 `if/else` — 它们被写入工具的 `description` 字段，由 LLM 基于上下文自主判断。

**3. Skill Review Prompt**

当 Skill Nudge 触发时，系统注入以下 Review Prompt：

```python
# run_agent.py L2145–L2153
_SKILL_REVIEW_PROMPT = (
    "Review the conversation above and consider saving or updating a skill "
    "if appropriate.\n\n"
    "Focus on: was a non-trivial approach used to complete a task that required "
    "trial and error, or changing course due to experiential findings along the "
    "way, or did the user expect or desire a different method or outcome?\n\n"
    "If a relevant skill already exists, update it with what you learned. "
    "Otherwise, create a new skill if the approach is reusable.\n"
    "If nothing is worth saving, just say 'Nothing to save.' and stop."
)
```

Prompt 的核心判断逻辑是三个"or"条件：
1. **trial and error** — 经历了试错
2. **changing course due to experiential findings** — 因为实践发现而改变路径
3. **user expected a different method** — 用户期望了不同的方法

这三个条件共同定义了"什么是值得固化的知识"——不是所有成功的任务都值得变成技能，只有**经过探索和纠错后找到的路径**才有复用价值。

---

## 2.4 Patch 优先的技能进化策略

### 设计理念

技能一旦创建不是就锁死不变了。Agent 会在后续使用中发现更优路径、遇到原技能未覆盖的边界情况，此时需要更新。

Hermes 的设计决策是：**优先使用 patch（局部补丁），而非 edit（全量重写）**。

### 六种技能操作

`skill_manage` 工具支持六种 action，按破坏性递增排列：

| Action        | 破坏性 | 描述                               | 适用场景                  |
| :----------- | :--- | :------------------------------- | :-------------------- |
| `patch`       | 最低  | `old_string` → `new_string` 局部替换 | 修正步骤、补充注意事项、修复 OS 差异 |
| `write_file`  | 低   | 在技能目录下添加辅助文件                     | 添加参考文档、模板、脚本          |
| `remove_file` | 低   | 删除辅助文件                           | 清理过时的参考文件             |
| `edit`        | 高   | 全量替换 SKILL.md 内容                 | 技能需要重大重构              |
| `create`      | —   | 创建新技能                            | 首次提炼新工作流              |
| `delete`      | 最高  | 删除整个技能目录                         | 技能已过时或有害              |

### 为什么 Patch 优先？

```
全量重写 (edit)                      局部补丁 (patch)
┌──────────────────────┐           ┌──────────────────────┐
│ Agent 必须：             │           │ Agent 只需：             │
│ 1. 读取完整 SKILL.md   │           │ 1. 指定 old_string     │
│ 2. 在内存中修改         │           │ 2. 指定 new_string     │
│ 3. 输出完整新版本       │           │ 3. 传给 patch handler  │
│                       │           │                       │
│ Token 消耗: ~整个文件    │           │ Token 消耗: ~两行文本     │
│ 风险: 可能丢失原有内容    │           │ 风险: 最多改错一处         │
│ 失败模式: 格式被破坏      │           │ 失败模式: 匹配不到         │
└──────────────────────┘           └──────────────────────┘
```

| 维度       | Patch                  | Edit (全量重写)             |
| :------- | :--------------------- | :---------------------- |
| **Token 消耗** | ≈ 两行文本                 | ≈ 整个 SKILL.md           |
| **正确性风险** | 最多改错一处                 | 可能改崩原本好用的部分             |
| **失败模式** | old_string 匹配不到 → 报错提示 | 输出被截断 → SKILL.md 被破坏    |
| **Frontmatter** | 自动验证 patch 后结构完整性      | 自动验证，但全量重写时模型更容易出错      |

### 工程实现亮点

**1. Fuzzy Matching 引擎**

Patch 操作不要求精确匹配——它复用了文件编辑工具的 `fuzzy_find_and_replace` 引擎：

```python
# skill_manager_tool.py L426–L430
from tools.fuzzy_match import fuzzy_find_and_replace

new_content, match_count, _strategy, match_error = fuzzy_find_and_replace(
    content, old_string, new_string, replace_all
)
```

这意味着 Agent 在 Review Prompt 中记忆的文本片段，即使与文件中的实际内容存在空白差异或缩进差异，patch 仍然能成功匹配。

**2. 原子写入 + 安全回滚**

所有技能文件的写入都通过 `_atomic_write_text()` 实现——先写临时文件，再 `os.replace()` 原子替换：

```python
# skill_manager_tool.py L256–L285
fd, temp_path = tempfile.mkstemp(dir=str(file_path.parent), ...)
try:
    with os.fdopen(fd, "w", encoding=encoding) as f:
        f.write(content)
    os.replace(temp_path, file_path)   # 原子操作，进程中途 crash 也不会产生半写文件
except Exception:
    os.unlink(temp_path)               # 失败时清理临时文件
    raise
```

**3. 安全扫描 + 回滚**

Agent 创建或修改的技能文件，会经过与社区 Hub 安装同样的安全扫描（`skills_guard.scan_skill()`）。如果检测到危险内容（如 shell injection），**变更被回滚**，技能恢复到修改前状态：

```python
# skill_manager_tool.py L328–L332 (create 路径)
scan_error = _security_scan_skill(skill_dir)
if scan_error:
    shutil.rmtree(skill_dir, ignore_errors=True)    # 回滚：整个目录删除
    return {"success": False, "error": scan_error}
```

```python
# skill_manager_tool.py L458–L462 (patch 路径)
scan_error = _security_scan_skill(skill_dir)
if scan_error:
    _atomic_write_text(target, original_content)    # 回滚：恢复原始内容
    return {"success": False, "error": scan_error}
```

> **最佳实践**: 任何 Agent 自主生成的内容，在持久化之前都应经过安全扫描。扫描不通过必须回滚——让 Agent 看到错误消息并自纠错，而不是写入一个有害的技能文件。

---

## 2.5 Background Review 的 Fork Agent 架构

### 设计理念

学习循环最精妙的工程设计在于 Review 的执行方式——它**不是在主 Agent 的上下文中执行**的，而是 Fork 了一个独立的 `AIAgent` 实例。

### 为什么要 Fork？

| 如果在主 Agent 中执行 Review            | Fork 独立 Agent 执行 Review                   |
| :-------------------------------- | :----------------------------------------- |
| Review Prompt 会追加到用户可见的 messages  | Review 在独立 messages 列表中执行，用户不可见            |
| Review 的工具调用计入主 Agent 的迭代预算       | Fork Agent 有独立的 `max_iterations=8`         |
| Review 的思考过程会出现在下次 API 调用的上下文中    | Fork Agent 的 messages 不会污染主会话              |
| 如果 Review 失败，可能中断主循环              | `try/except` 隔离，失败只是一行 log                 |
| 用户在等待 Review 完成时无法获得响应            | 主响应**先**返回给用户，Review 在后台异步执行               |

### 实现细节

```python
# run_agent.py L2169–L2268 (简化)
def _spawn_background_review(self, messages_snapshot, review_memory, review_skills):
    import threading

    # 选择合适的 Review Prompt
    if review_memory and review_skills:
        prompt = self._COMBINED_REVIEW_PROMPT
    elif review_memory:
        prompt = self._MEMORY_REVIEW_PROMPT
    else:
        prompt = self._SKILL_REVIEW_PROMPT

    def _run_review():
        review_agent = AIAgent(
            model=self.model,
            max_iterations=8,      # ① 独立的迭代预算（仅 8 次）
            quiet_mode=True,       # ② 静默模式：不输出任何进度信息
            platform=self.platform,
            provider=self.provider,
        )
        # ③ 共享 MemoryStore — 写入的记忆会反映到磁盘
        review_agent._memory_store = self._memory_store
        review_agent._memory_enabled = self._memory_enabled
        review_agent._user_profile_enabled = self._user_profile_enabled

        # ④ 关键：禁用 Review Agent 自身的 Nudge，防止递归
        review_agent._memory_nudge_interval = 0
        review_agent._skill_nudge_interval = 0

        # ⑤ 以 Review Prompt 作为 user message，附带完整会话历史
        review_agent.run_conversation(
            user_message=prompt,
            conversation_history=messages_snapshot,
        )

    # ⑥ Daemon 线程：主进程退出时自动终止
    t = threading.Thread(target=_run_review, daemon=True, name="bg-review")
    t.start()
```

### 六个关键设计决策

| #  | 决策                                 | 理由                                                |
| :- | :--------------------------------- | :------------------------------------------------ |
| ① | `max_iterations=8`                  | Review 只需要调用 memory/skill_manage 几次，不需要主 Agent 的 90 次预算 |
| ② | `quiet_mode=True`                   | 用户不应看到 Review 过程的进度输出                              |
| ③ | 共享 `MemoryStore` 引用                | Review Agent 写入的记忆立即反映到磁盘，无需合并                     |
| ④ | 禁用 Nudge (`interval=0`)            | **防止递归**: Review Agent 触发自己的 Nudge → Review → ...   |
| ⑤ | `conversation_history=messages_snapshot` | 让 Review Agent 能看到完整的会话上下文来做判断                     |
| ⑥ | Daemon 线程                          | 不阻塞主进程退出                                          |

### Combined Review Prompt

当 Memory Nudge 和 Skill Nudge 同时触发时，使用合并版 Prompt，避免 Fork 两个 Agent：

```python
# run_agent.py L2155–L2167
_COMBINED_REVIEW_PROMPT = (
    "Review the conversation above and consider two things:\n\n"
    "**Memory**: Has the user revealed things about themselves — their persona, "
    "desires, preferences, or personal details? Has the user expressed expectations "
    "about how you should behave, their work style, or ways they want you to operate? "
    "If so, save using the memory tool.\n\n"
    "**Skills**: Was a non-trivial approach used to complete a task that required trial "
    "and error, or changing course due to experiential findings along the way, or did "
    "the user expect or desire a different method or outcome? If a relevant skill "
    "already exists, update it. Otherwise, create a new one if the approach is reusable.\n\n"
    "Only act if there's something genuinely worth saving. "
    "If nothing stands out, just say 'Nothing to save.' and stop."
)
```

最后一行 `"If nothing stands out, just say 'Nothing to save.' and stop."` 是关键——它给了 LLM 一个明确的"退出路径"，避免 Agent 在没有值得保存的内容时强行生成低价值的记忆/技能。

### 结果通知

Review Agent 完成后，系统扫描其 messages 中成功执行的 `memory` / `skill_manage` 工具调用，提取摘要通知用户：

```python
# run_agent.py L2219–L2253
for msg in getattr(review_agent, "_session_messages", []):
    # 扫描 tool role 消息中 success=True 的结果
    if "created" in message.lower():
        actions.append(message)          # "Skill 'debug-python' created."
    elif "added" in message.lower():
        actions.append("Memory updated")  # "Entry added to MEMORY.md"
    ...

if actions:
    summary = " · ".join(dict.fromkeys(actions))
    self._safe_print(f"  💾 {summary}")   # 例: "💾 Memory updated · Skill 'debug-python' created."
```

用户看到的只是一行简短的通知（如 `💾 Memory updated`），而非 Review 的完整思考过程。

> **最佳实践**: Background Review 的通知应该是**一行摘要**，而非完整的 Review 过程。用户不需要知道 Agent 的自省细节——他们只需要知道"Agent 记住了一些东西"。

---

## 2.6 情景记忆 vs. 过程记忆的分离

### 设计理念

Hermes 的学习循环产出两种不同性质的知识，并将它们**分开存储**：

| 维度       | 情景记忆 (Episodic Memory)       | 过程记忆 (Procedural Memory)        |
| :------- | :---------------------------- | :------------------------------ |
| **记住的是** | "发生了什么、什么时候发生的"              | "该怎么做"                          |
| **存储在** | SQLite + FTS5 索引 (Session DB) | `~/.hermes/skills/*.md`          |
| **加载方式** | Agent 主动调用 `session_search` 工具 | 渐进式披露：默认只加载名称，按需加载完整内容          |
| **更新方式** | 自动归档（每轮执行结束写入）               | Skill Nudge → patch/create       |
| **持久级别** | 永久归档，支持全文检索                   | 永久文件，支持手动编辑                     |
| **适用场景** | 回忆过去的对话内容和决策                  | 重复执行相似任务                        |

这个分离是有意为之的——两种知识的**访问模式、更新频率和存储需求**完全不同。情景记忆是追加式的日志，过程记忆是需要持续迭代的文档。混在一起只会让两者都变得更难管理。

### Session Retrieval: 检索 → 摘要 → 注入

Agent 通过 `session_search` 工具检索历史会话时，流程不是简单地把旧对话塞进上下文：

```
用户提问
  ↓
Agent 调用 session_search(query="上周数据库迁移")
  ↓
FTS5 全文检索 → 匹配的会话列表
  ↓
LLM 摘要 → 只提取与当前任务相关的内容
  ↓
摘要注入 context → Agent 继续执行
```

这个"检索 → 摘要 → 注入"的三步流程确保了：
1. **相关性**: FTS5 检索只返回与查询匹配的会话
2. **简洁性**: LLM 摘要过滤掉不相关的上下文
3. **Token 效率**: 注入的是数百 token 的摘要，而非数千 token 的原始对话

> **最佳实践**: 使用 FTS5 而非向量数据库做会话检索。优势是：零外部依赖（SQLite 内置）、确定性（不存在"嵌入漂移"问题）、可调试（用户可以直接 SQL 查看索引）。对于会话级别的检索，FTS5 的关键词匹配通常比语义嵌入更精准。
>
> **避坑**: 直接把历史会话原文注入 context 是一个常见错误。即使只注入 3 轮旧对话，也可能消耗 5,000+ token，挤压当前任务的操作空间。**必须**经过 LLM 摘要压缩后再注入。

---

## 2.7 对 KyberKit 的设计建议

### 必须采纳

| 模式                          | 理由                                                                |
| :-------------------------- | :---------------------------------------------------------------- |
| **Nudge 定时自省机制**             | 没有 Nudge，Agent 永远不会自主去保存记忆/技能 — 依赖用户手动触发的记忆系统利用率极低              |
| **Fork Agent 执行 Review**     | Review 不能阻塞主任务响应，也不能污染主会话的 messages 列表                            |
| **禁用 Review Agent 的 Nudge**  | 防止 Review → Nudge → Review 的无限递归                                  |
| **Patch 优先的技能更新**            | 节省 Token + 降低全量重写导致内容丢失的风险                                        |
| **情景/过程记忆分离**               | 两种知识的访问模式和更新频率完全不同，混在一起会两边都拉胯                                     |
| **安全扫描 + 写入回滚**             | Agent 自主生成的文件（包括技能）必须经过安全检查                                      |

### 推荐参考

| 模式                          | 理由                                                                |
| :-------------------------- | :---------------------------------------------------------------- |
| **Combined Review Prompt**    | Memory + Skill 同时触发时合并为一次 Review，减少一次 API 调用                       |
| **3,575 字符记忆上限**            | 硬约束促使精选，防止记忆层膨胀挤压其他上下文空间                                          |
| **原子文件写入**                   | `tempfile + os.replace()` 模式防止进程中断导致半写文件                           |
| **FTS5 而非向量数据库**             | 会话级检索不需要语义嵌入，FTS5 更轻量且确定性更高                                      |

### 需要改进

| Hermes 做法                    | KyberKit 改进方向                                                      |
| :--------------------------- | :----------------------------------------------------------------- |
| Nudge 间隔是固定值 (10 turns/10 iters) | 可以引入自适应间隔：简单问答会话降低频率，高密度工具调用会话提高频率                                 |
| 记忆修改在下次会话才生效                  | 如果用户明确要求"记住这个"，可以考虑立即注入到当前会话的上下文                                   |
| Review Agent 使用与主 Agent 相同的模型  | 可以使用更小/更便宜的模型做 Review（记忆和技能的保存判断不需要最强推理能力）                         |

---

## 本章核心要点速查

| 概念               | 定义                                                   | 源码位置                        |
| :--------------- | :--------------------------------------------------- | :-------------------------- |
| Memory Nudge     | 每 10 个 user turn 触发一次自省式记忆审查                          | `L7897–L7903`               |
| Skill Nudge      | 每 10 次工具调用迭代触发一次技能审查                                  | `L8146–L8150, L10611–L10617` |
| Background Review | Fork 独立 AIAgent 在后台执行 Review，共享 MemoryStore，禁用 Nudge 递归 | `L2169–L2268`               |
| Patch 优先更新       | 局部文本替换而非全量重写，使用 fuzzy matching 容错                      | `skill_manager_tool.py L382–L467` |
| 情景记忆             | SQLite + FTS5 存储的历史会话，通过 session_search 按需检索            | `hermes_state.py`            |
| 过程记忆             | `~/.hermes/skills/*.md` 中的可复用工作流                        | `tools/skill_manager_tool.py` |
| 安全扫描 + 回滚        | Agent 生成的技能文件写入前经过 `skills_guard.scan_skill()` 检查     | `skill_manager_tool.py L56–L74` |

---

> **下一章**: [第三部分：四层内存系统](./agent-design-manual-ch03.md)
