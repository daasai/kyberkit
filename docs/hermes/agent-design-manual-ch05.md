# 第五部分：工具系统设计

> **前置依赖**: [第四部分：Prompt 工程方法论](./agent-design-manual-ch04.md) | [输出控制工程分析](./output-control-engineering.md)
>
> 工具系统是 Agent 从"能说"到"能做"的跨越。本章深度解析 Hermes 的工具注册、Schema 设计、分发执行、并行安全、结果预算控制以及 MCP 集成的完整工程实现。

---

## 5.1 Tool Schema 设计规范

### 核心命题

> **Tool Schema 不仅是给 LLM 看的"API 文档"，更是 Agent 决策的第一信息源。Schema 的 description 质量直接决定工具调用的准确率。**

### OpenAI Function Calling 协议

Hermes 统一使用 OpenAI Function Calling 格式作为工具契约层，所有工具（内置、MCP、Plugin）最终都转换为这个格式：

```python
# 标准格式
{
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "...",        # ← 最关键的字段
        "parameters": {
            "type": "object",
            "properties": { ... },
            "required": [ ... ]
        }
    }
}
```

### Description 的工程规范

以 `skill_manage` 工具的 description 为典型案例（`skill_manager_tool.py` L656–L673）：

```
结构拆解:
  ┌─ 功能定义 (1 句)
  │  "Manage skills (create, update, delete)."
  ├─ 语义定位 (1 句)
  │  "Skills are your procedural memory — reusable approaches..."
  ├─ Action 枚举 (1 句)
  │  "Actions: create, patch, edit, delete, write_file, remove_file."
  ├─ 触发条件 (具体场景列表)
  │  "Create when: complex task succeeded (5+ calls), errors overcome..."
  ├─ 更新条件 (具体场景列表)
  │  "Update when: instructions stale/wrong, OS-specific failures..."
  ├─ 交互规范 (行为指导)
  │  "After difficult tasks, offer to save as skill. Skip for one-offs."
  └─ 质量标准 (格式示例)
     "Good skills: trigger conditions, numbered steps, pitfalls section..."
```

关键原则：
1. **description 同时包含功能说明和使用指导** — 不只是说工具能做什么，还说什么时候该用/不该用
2. **触发条件用具体场景列举** — "5+ calls" 比 "complex tasks" 更精确
3. **包含替代建议** — "Skip for simple one-offs" 减少不必要的调用

### 手写 Schema vs. 自动生成

Hermes 选择**手写 dict Schema**，每个工具文件末尾定义一个 `*_SCHEMA` 常量：

| 方式     | 优势                     | 劣势                   |
| :----- | :--------------------- | :------------------- |
| 手写 dict | 完全控制 description 内容；可注入行为指导 | 维护成本高；Schema 与实现可能不同步 |
| 自动生成 (Pydantic/docstring) | 零维护；Schema 与代码同步 | description 受限于代码注释质量 |

Hermes 选择手写的原因：**description 中包含大量行为指导（何时该用、何时不该用、输出格式期望）**，这些内容无法从函数签名或 docstring 自动生成。

> **最佳实践**: description 应包含：(1) 功能定义，(2) 触发/跳过条件，(3) 替代工具建议。这三者缺一都会降低调用准确率。
>
> **避坑**: 把工具的 description 当作纯 API 文档写（只描述输入输出）——LLM 需要的是**决策指导**，不是技术规格。

---

## 5.2 Self-Registration 工具注册模式

### 核心命题

> **工具注册应在模块导入时自动完成，而非依赖中心配置文件。但必须防止影子覆盖和并发冲突。**

### 注册机制

`ToolRegistry` 是一个模块级 Singleton（`tools/registry.py` L357）：

```python
# 每个工具文件的末尾，在 import 时自动注册
from tools.registry import registry, tool_error

registry.register(
    name="memory",
    toolset="memory",
    schema=MEMORY_SCHEMA,
    handler=lambda args, **kw: memory_tool(...),
    check_fn=check_memory_requirements,
    emoji="🧠",
)
```

### ToolEntry 数据结构

```python
class ToolEntry:
    __slots__ = (
        "name",                  # 工具唯一标识
        "toolset",               # 所属工具集 (用于批量启用/禁用)
        "schema",                # OpenAI Function Calling 格式
        "handler",               # 执行函数
        "check_fn",              # 可用性检查 (返回 bool)
        "requires_env",          # 所需环境变量列表
        "is_async",              # 是否为 async handler
        "description",           # 冗余描述 (从 schema 提取)
        "emoji",                 # 进度显示用 emoji
        "max_result_size_chars", # 单工具结果大小上限 (可选)
    )
```

### 三重安全机制

**1. 影子覆盖防护**

```python
# registry.py L117–L140
def register(self, name, toolset, schema, handler, ...):
    with self._lock:
        existing = self._tools.get(name)
        if existing and existing.toolset != toolset:
            # MCP-to-MCP 覆盖允许（服务器刷新场景）
            both_mcp = existing.toolset.startswith("mcp-") and toolset.startswith("mcp-")
            if both_mcp:
                logger.debug("MCP toolset overwrite: %s → %s", existing.toolset, toolset)
            else:
                # 拒绝！防止 Plugin/MCP 覆盖内置工具
                logger.error("REJECTED: '%s' would shadow '%s'", name, existing.toolset)
                return
```

规则：**同 toolset 可覆盖（更新），不同 toolset 拒绝（防影子）**。唯一例外是 MCP-to-MCP 覆盖（服务器刷新合法场景）。

**2. 线程安全 (RLock)**

所有注册表的读写操作都在 `threading.RLock()` 保护下执行。读操作通过 `_snapshot_state()` 返回一致性快照，避免迭代过程中注册表被修改。

**3. Toolset 可用性门控**

每个 toolset 可以注册一个 `check_fn`，在构建工具列表时检查可用性：

```python
# 例: web 工具集检查 API Key 是否配置
def check_web_requirements() -> bool:
    return bool(os.getenv("SERPER_API_KEY") or os.getenv("BRAVE_API_KEY"))
```

`get_definitions()` 在返回 Schema 时自动跳过 `check_fn()` 返回 False 的工具——Agent 完全看不到不可用的工具。

> **最佳实践**: 不可用的工具不应出现在 Schema 列表中——从 LLM 的视角彻底移除。不要注入"此工具不可用"的 description。
>
> **避坑**: (1) MCP/Plugin 意外覆盖内置工具名 → 影子覆盖防护。(2) 并发注册 Race Condition → RLock 序列化。

---

## 5.3 工具分发与并行执行策略

### 核心命题

> **LLM 在单轮中可能返回多个 tool_calls。并行执行能显著提速，但必须确保不会产生文件冲突或状态竞争。**

### 并行安全判定算法

`_should_parallelize_tool_batch()` (`run_agent.py` L267–L308) 实现了一套白名单 + 路径冲突检测的判定逻辑：

```
输入: tool_calls 列表
  ↓
检查 1: len(tool_calls) <= 1 → 不需要并行
  ↓
检查 2: 包含 _NEVER_PARALLEL_TOOLS (clarify) → 降级串行
  ↓
检查 3: 逐个检查每个 tool_call:
  ├─ 是 _PATH_SCOPED_TOOLS (read_file/write_file/patch)?
  │    → 提取目标路径 → 检查路径是否与已登记路径重叠
  │    → 重叠 → 降级串行
  │    → 不重叠 → 登记路径，继续
  ├─ 是 _PARALLEL_SAFE_TOOLS (纯读白名单)?
  │    → 继续
  └─ 都不是 → 降级串行（默认不安全）
  ↓
全部通过 → 允许并行 (ThreadPoolExecutor, max_workers=8)
```

### 三类工具的并行策略

| 类别                | 示例                            | 并行策略         |
| :---------------- | :---------------------------- | :----------- |
| **纯读白名单**         | `read_file`, `web_search`, `skill_view` | ✅ 无条件并行      |
| **路径作用域工具**       | `read_file`, `write_file`, `patch` | ✅ 路径不重叠时并行   |
| **默认不安全**         | `run_terminal_cmd`, `memory`, `clarify` | ❌ 串行         |

### 路径重叠检测

```python
# run_agent.py L328–L336
def _paths_overlap(left: Path, right: Path) -> bool:
    """两个路径指向同一子树时返回 True"""
    common_len = min(len(left.parts), len(right.parts))
    return left.parts[:common_len] == right.parts[:common_len]
```

`/a/b/c.py` 和 `/a/b/d.py` → 不重叠 ✅
`/a/b` 和 `/a/b/c.py` → 重叠 ❌ (一个是另一个的父目录)

### 破坏性命令检测

```python
# run_agent.py L240–L264
_DESTRUCTIVE_PATTERNS = re.compile(r"""(?:^|\s|&&|\|\||;|`)(?:
    rm\s|rmdir\s|mv\s|sed\s+-i|truncate\s|dd\s|shred\s|
    git\s+(?:reset|clean|checkout)\s
)""", re.VERBOSE)
```

终端命令中包含 `rm`, `mv`, `sed -i`, `git reset` 等模式时，标记为破坏性操作——这些工具绝不并行。

> **最佳实践**: 并行安全判定应默认保守（不在白名单中 = 串行）。只有经过验证的纯读工具才进入白名单。
>
> **避坑**: 并行执行 `write_file` 到同一目录下的不同文件看似安全，但如果其中一个文件是另一个的 import 依赖，写入顺序可能导致中间状态不一致。路径重叠检测是最小安全保障。

---

## 5.4 工具调用预处理：去重与限流

### 去重 (`_deduplicate_tool_calls`)

```python
# run_agent.py L3403–L3418
def _deduplicate_tool_calls(tool_calls):
    """去除单 turn 内 (tool_name, arguments) 完全相同的重复调用"""
    seen = set()
    unique = []
    for tc in tool_calls:
        key = (tc.function.name, tc.function.arguments)
        if key not in seen:
            seen.add(key)
            unique.append(tc)
    return unique
```

模型有时会在单 turn 中生成完全相同的 tool_call（采样不稳定导致）。去重以 `(name, arguments)` 元组为 key，保留首次出现。

### 子代理限流 (`_cap_delegate_task_calls`)

```python
# run_agent.py L3372–L3400
def _cap_delegate_task_calls(tool_calls):
    """限制单 turn 内 delegate_task 调用数量"""
    max_children = _get_max_concurrent_children()  # 配置值
    delegate_count = sum(1 for tc in tool_calls if tc.function.name == "delegate_task")
    if delegate_count <= max_children:
        return tool_calls
    # 保留前 max_children 个 delegate_task，保留所有非 delegate 调用
    ...
```

防止模型在单 turn 中生成过多子代理调用——每个子代理都是一个完整的 Agent 实例（独立 LLM 调用 + 工具执行），不加限制可能导致并发 API 调用爆炸。

### 工具名模糊修复 (`_repair_tool_call`)

```python
# run_agent.py L3420–L3446
def _repair_tool_call(self, tool_name):
    """三级递进修复"""
    # Level 1: lowercase
    lowered = tool_name.lower()
    if lowered in self.valid_tool_names: return lowered

    # Level 2: normalize (连字符/空格 → 下划线)
    normalized = lowered.replace("-", "_").replace(" ", "_")
    if normalized in self.valid_tool_names: return normalized

    # Level 3: fuzzy match (difflib, cutoff=0.7)
    matches = get_close_matches(lowered, self.valid_tool_names, n=1, cutoff=0.7)
    if matches: return matches[0]

    return None  # 无法修复
```

修复后**直接继续执行**，而非拒绝让模型重试——节省一次完整的 LLM 调用。

> **最佳实践**: 工具名修复应先尝试确定性变换（lowercase, normalize），再尝试模糊匹配。修复成功后直接执行，不浪费 retry 轮次。

---

## 5.5 工具结果的三层 Token 预算

### 核心命题

> **工具返回的结果可能非常大（文件内容、终端输出、网页提取），如果不控制大小，会迅速耗尽上下文窗口。**

### 三层控制体系

```python
# budget_config.py — 三层预算常量
DEFAULT_RESULT_SIZE_CHARS  = 100_000    # Layer 2: 单工具结果上限
DEFAULT_TURN_BUDGET_CHARS  = 200_000    # Layer 3: 单 turn 所有工具结果总上限
DEFAULT_PREVIEW_SIZE_CHARS = 1_500      # 持久化后的内联预览大小
```

```
Layer 1: 工具内置截断
  └─ 每个工具在 handler 内部控制输出大小（如 read_file 限制行数）

Layer 2: Per-result 溢出 (100K chars)
  └─ 单个工具结果超过阈值 → 持久化到文件 → 替换为 <persisted-output> 标签 + 1,500 字符预览

Layer 3: Per-turn 聚合 (200K chars)
  └─ 单 turn 所有工具结果累计超过阈值 → 依次持久化最大的结果
```

### 阈值解析优先级

```python
# budget_config.py L38–L48
def resolve_threshold(self, tool_name):
    """优先级: pinned → tool_overrides → registry per-tool → default"""
    if tool_name in PINNED_THRESHOLDS:    return PINNED_THRESHOLDS[tool_name]
    if tool_name in self.tool_overrides:  return self.tool_overrides[tool_name]
    return registry.get_max_result_size(tool_name, default=self.default_result_size)
```

### read_file 的特殊豁免

```python
# budget_config.py L12–L14
PINNED_THRESHOLDS = {
    "read_file": float("inf"),   # 永不持久化
}
```

`read_file` 被固定为 `inf`（永不触发持久化），因为 `patch` 工具需要完整的原始文件内容来做精确匹配。如果 `read_file` 的结果被持久化替换为摘要，`patch` 的 `old_string` 匹配会失败。

> **最佳实践**: 工具结果预算应分三层：工具内控 → 单结果上限 → 单 turn 聚合上限。每层独立配置，允许特定工具豁免。
>
> **避坑**: (1) 不限制工具结果大小 → 一次 `cat /var/log/syslog` 耗尽上下文。(2) 对 `read_file` 做持久化截断 → `patch` 的 find-and-replace 无法匹配原文。

---

## 5.6 内置工具体系

### 5 类 40+ 工具

| 类别       | 工具                                         | 核心能力                  |
| :------- | :----------------------------------------- | :-------------------- |
| **执行类**  | `run_terminal_cmd`, `execute_code`          | 终端命令、Python/Node 代码运行 |
| **文件类**  | `read_file`, `write_file`, `patch`, `search_files` | 文件读写、模糊匹配编辑、内容搜索 |
| **网页类**  | `web_search`, `web_extract`, `browser_*`   | 搜索、页面提取、浏览器自动化      |
| **媒体类**  | `vision_analyze`, `generate_image`, `tts`  | 图片理解、文生图、语音合成        |
| **协同类**  | `delegate_task`, `clarify`                  | 子代理调度、向用户提问          |
| **记忆规划** | `memory`, `todo`, `session_search`, `skill_manage`, `skill_view` | 记忆写入、待办管理、历史检索、技能管理 |

### 有状态工具的依赖注入

部分工具需要 Agent 实例的状态（MemoryStore、SessionDB、TodoStore）。这些通过 handler 的 `**kwargs` 注入：

```python
# 注册时: handler 接收 kwargs
handler=lambda args, **kw: memory_tool(
    action=args.get("action"),
    store=kw.get("store"),  # ← Agent 注入的 MemoryStore 实例
)

# 分发时: _execute_single_tool 传入 Agent 状态
elif function_name == "memory":
    result = _memory_tool(
        store=self._memory_store,   # ← 从 Agent 实例获取
    )
```

与纯函数式工具不同，这些有状态工具**不走通用 registry.dispatch()** —— 它们在 `_execute_single_tool()` 中通过 `if/elif` 链显式处理。

这是一个已知的反模式（见第十三部分），但 Hermes 团队选择了可读性而非优雅性——有状态工具的依赖注入在 `if/elif` 中比在 Registry 的泛化接口中更明确。

---

## 5.7 MCP 集成与插件钩子

### MCP 动态工具发现

MCP (Model Context Protocol) 服务器可以在运行时动态注册工具。Hermes 采用 **nuke-and-repave** 策略处理 MCP 服务器的 `tools/list_changed` 通知：

```
MCP 服务器发送 notifications/tools/list_changed
  ↓
1. deregister() 该服务器名下所有已注册工具
2. 重新发现所有工具 (tools/list)
3. 为每个工具生成 "mcp_{server}_{tool}" 格式的名称
4. 检查与内置工具的名称冲突
5. register() 所有新工具 (toolset = "mcp-{server}")
```

工具名前缀 `mcp_` 确保 MCP 工具与内置工具命名空间隔离。`deregister()` 方法在移除工具时自动清理空的 toolset check：

```python
# registry.py L156–L172
def deregister(self, name):
    with self._lock:
        entry = self._tools.pop(name, None)
        # 如果这是该 toolset 的最后一个工具，清理 toolset check
        if entry.toolset in self._toolset_checks and not any(
            e.toolset == entry.toolset for e in self._tools.values()
        ):
            self._toolset_checks.pop(entry.toolset, None)
```

### 4 个插件钩子

| 钩子                | 触发时机     | 典型用途             |
| :---------------- | :------- | :--------------- |
| `pre_llm_call`     | LLM API 调用前 | 注入动态上下文到 User Message |
| `post_llm_call`    | LLM API 返回后 | 日志、监控、响应后处理      |
| `on_session_start` | 会话开始     | 初始化外部资源          |
| `on_session_end`   | 会话结束     | 清理、刷新缓冲区         |

插件通过钩子系统扩展 Agent 行为——**不分叉代码、不改内部逻辑**。

> **最佳实践**: MCP 工具名使用 `mcp_{server}_{tool}` 格式的命名空间前缀，防止与内置工具冲突。
>
> **避坑**: (1) MCP 服务器重启后工具列表可能变化 → nuke-and-repave 而非增量更新。(2) 插件钩子异常不应阻断主循环 → `try/except` 隔离。

---

## 5.8 对 KyberKit 的设计建议

### 必须采纳

| 模式                 | 理由                                    |
| :----------------- | :------------------------------------ |
| **Self-Registration** | 工具与注册表解耦，新增工具只需在文件末尾调用 `register()` |
| **影子覆盖防护**         | 防止 Plugin/MCP 覆盖内置工具                  |
| **并行白名单 + 路径冲突检测** | 安全并行需要确定性判定，不能猜测                     |
| **三层 Token 预算**    | 工具结果大小不可预知，必须逐层兜底                    |
| **工具名模糊修复**        | 修复成功直接执行，节省一次完整 LLM 重试               |
| **去重 + 子代理限流**    | 防止采样不稳定导致的重复调用和 API 爆炸                |

### 需要改进

| Hermes 做法                   | KyberKit 改进方向                               |
| :-------------------------- | :------------------------------------------ |
| 有状态工具用 `if/elif` 硬编码分发     | 统一走 Registry dispatch，用 `ContextProvider` 注入状态 |
| 12 个 callback 参数传入 `__init__` | 改用 `EventBus` / `AgentEventListener` 接口     |
| 破坏性命令正则检测                   | 可扩展的 `CommandPolicy` 规则引擎                   |

---

## 本章核心要点速查

| 概念             | 定义                                           | 源码位置                        |
| :------------- | :------------------------------------------- | :-------------------------- |
| ToolRegistry   | 模块级 Singleton，RLock 保护，支持注册/反注册/快照           | `tools/registry.py`          |
| 影子覆盖防护         | 不同 toolset 的同名工具注册被拒绝（MCP-to-MCP 除外）        | `registry.py` L117–L140      |
| 并行安全判定         | 白名单 + 路径作用域冲突检测 + _NEVER_PARALLEL 黑名单       | `run_agent.py` L214–L308     |
| 三层 Token 预算    | 工具内截断 → 单结果 100K → 单 turn 200K（read_file 豁免） | `tools/budget_config.py`     |
| 工具名模糊修复        | lowercase → normalize → difflib fuzzy (0.7)   | `run_agent.py` L3420–L3446   |
| 去重 + 限流        | (name, args) 元组去重 + delegate_task 数量限制        | `run_agent.py` L3372–L3418   |
| MCP nuke-and-repave | 先反注册全部 → 重新发现 → 重新注册                        | `tools/mcp_tool.py`          |

---

> **下一章**: [第六部分：LLM 输出控制与防护栏体系](./agent-design-manual-ch06.md)
