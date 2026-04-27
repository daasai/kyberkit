# Hermes Agent — LLM 输出控制与稳定性工程分析报告

> **分析对象**: `run_agent.py` (10,897 行), `tools/registry.py`, `tools/tool_result_storage.py`, `agent/redact.py`, `tools/file_tools.py`
> **分析版本**: 基于 2026-04-23 快照
> **前置依赖**: [agent-runtime-architecture.md](./agent-runtime-architecture.md), [prompt-architecture.md](./prompt-architecture.md)

---

## 1. 结构化输出控制

### 1.1 核心发现：Hermes **不**使用 JSON Schema / Pydantic 强制结构化输出

Hermes Agent **不依赖** LLM 提供商的 `response_format` 或 `json_schema` 等结构化输出参数来约束模型行为。整个系统的输出控制策略是：

> **让模型自由输出，然后用多层验证 + 自纠错循环来确保输出可处理。**

Pydantic 仅在以下非核心模块中使用：
- `hermes_cli/web_server.py` — FastAPI 请求体校验 (HTTP DTO)
- `environments/*.py` — RL 环境配置定义
- 均不涉及 LLM 输出解析

### 1.2 四级 Retry 状态机

系统通过 4 个独立的重试计数器来处理不同类型的畸形输出，每个计数器有独立的最大重试次数和降级策略：

```mermaid
stateDiagram-v2
    [*] --> API_Call
    
    API_Call --> Check_Scratchpad: Response 返回
    
    state "Scratchpad 完整性检查" as Check_Scratchpad {
        [*] --> has_incomplete_scratchpad
        has_incomplete_scratchpad --> Retry_Scratchpad: 未闭合 → count++
        has_incomplete_scratchpad --> Check_ToolName: 完整
        Retry_Scratchpad --> Abort_Partial: count > 2
        Retry_Scratchpad --> API_Call: count ≤ 2 (丢弃响应重试)
    }
    
    state "工具名称验证" as Check_ToolName {
        [*] --> validate_names
        validate_names --> Repair_Name: 名称不在 valid_tool_names
        Repair_Name --> Self_Correct: 修复失败 → count++
        Repair_Name --> Continue: 修复成功
        Self_Correct --> Abort_Partial: count ≥ 3
        Self_Correct --> Inject_Error: count < 3 → 注入错误消息
        Inject_Error --> API_Call
    }
    
    state "JSON 参数验证" as Check_JSON {
        [*] --> parse_args
        parse_args --> Check_Truncation: JSONDecodeError
        Check_Truncation --> Abort_Truncated: 参数尾部无 } 或 ]
        Check_Truncation --> Retry_JSON: 完整但格式错误 → count++
        Retry_JSON --> Inject_Recovery: count ≥ 3
        Retry_JSON --> API_Call: count < 3 (丢弃重试)
        Inject_Recovery --> API_Call: 注入 tool error 消息
    }
    
    state "空响应处理" as Check_Empty {
        [*] --> is_truly_empty
        is_truly_empty --> ThinkPrefill: 有 reasoning 无 content
        ThinkPrefill --> Retry_Empty: prefill 耗尽
        is_truly_empty --> Retry_Empty: 无 reasoning 无 content
        Retry_Empty --> Try_Fallback: count ≥ 3
        Retry_Empty --> API_Call: count < 3
        Try_Fallback --> Activate_Fallback: _fallback_chain 可用
        Try_Fallback --> Return_Empty: 链耗尽 → "(empty)"
        Activate_Fallback --> API_Call: 切换 provider 重试
    }
    
    Check_Scratchpad --> Check_ToolName
    Check_ToolName --> Check_JSON
    Check_JSON --> Execute_Tools
    Execute_Tools --> API_Call
```

#### 四个 Retry 计数器详解

| 计数器 | 最大重试 | 重试策略 | 降级行为 | 源码位置 |
|:---|:---:|:---|:---|:---|
| `_incomplete_scratchpad_retries` | 2 | 丢弃损坏的 assistant message，直接重发 API 请求 | 强制结束，返回 `partial=True` | L9778–L9803 |
| `_invalid_tool_retries` | 3 | 注入 `tool` role 错误消息 "Tool X does not exist. Available tools: ..."，让模型自纠错 | 强制结束，返回 `partial=True` | L9866–L9915 |
| `_invalid_json_retries` | 3 | 前 2 次：丢弃重试。第 3 次：注入 tool error 消息包含 JSON 格式提示，让模型重试 | 不终止，转为注入恢复 | L9917–L10007 |
| `_empty_content_retries` | 3 | 直接重试 API 请求（不修改 messages） | → `_try_activate_fallback()` → 最终返回 `"(empty)"` | L10265–L10362 |

#### Thinking Prefill 恢复（Empty Response 的特殊路径）

当模型通过 API 结构化字段返回了 reasoning 但没有 visible content 时（常见于 OpenRouter 路由的推理模型），触发 **prefill continuation**：

```python
# L10245-L10263
if _has_structured and self._thinking_prefill_retries < 2:
    self._thinking_prefill_retries += 1
    # 将仅含 reasoning 的 assistant message 保留在 messages 中
    interim_msg["_thinking_prefill"] = True
    messages.append(interim_msg)
    continue  # 模型会看到自己的 reasoning，在下一 turn 输出 visible text
```

### 1.3 工具名称模糊修复 (`_repair_tool_call`)

在判定为"无效工具名"之前，系统尝试 3 级递进修复：

```python
# L3420-L3446
def _repair_tool_call(self, tool_name: str) -> str | None:
    # 1. Lowercase：SearchFiles → searchfiles → ✓ search_files
    lowered = tool_name.lower()
    if lowered in self.valid_tool_names:
        return lowered

    # 2. Normalize：search-files → search_files → ✓
    normalized = lowered.replace("-", "_").replace(" ", "_")
    if normalized in self.valid_tool_names:
        return normalized

    # 3. Fuzzy match (difflib, cutoff=0.7)：serch_files → search_files
    matches = get_close_matches(lowered, self.valid_tool_names, n=1, cutoff=0.7)
    if matches:
        return matches[0]

    return None  # 修复失败 → 进入 self-correction 循环
```

### 1.4 JSON 参数自愈

对于模型经常产生的 JSON 格式异常，系统在验证前进行预处理：

| 异常类型 | 自愈逻辑 | 源码 |
|:---|:---|:---|
| 参数是 `dict`/`list` 而非 `str` | `json.dumps(args)` — 直接序列化 | L9922–L9924 |
| 参数是非字符串类型 | `str(args)` — 强制字符串化 | L9925–L9927 |
| 空字符串或纯空白 | 替换为 `"{}"` — 空对象 | L9929–L9931 |
| 参数截断（无闭合括号）| 区分截断 vs 格式错误 → 截断直接 abort 而非重试 | L9944–L9965 |

---

## 2. 工具路由与执行

### 2.1 Tool Schema 结构：OpenAI Function Calling 协议

所有工具 Schema 遵循 OpenAI Chat Completions `tools` 参数的标准格式：

```python
# 注册时的 API 输出格式 (registry.get_definitions())
{
    "type": "function",
    "function": {
        "name": "read_file",
        "description": "Read a text file with line numbers...",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "..."},
                "offset": {"type": "integer", "default": 1, "minimum": 1},
                "limit": {"type": "integer", "default": 500, "maximum": 2000}
            },
            "required": ["path"]
        }
    }
}
```

### 2.2 ToolRegistry 注册机制

```mermaid
classDiagram
    class ToolEntry {
        +name: str
        +toolset: str
        +schema: dict
        +handler: Callable
        +check_fn: Callable | None
        +requires_env: list
        +is_async: bool
        +emoji: str
        +max_result_size_chars: int | float | None
    }

    class ToolRegistry {
        -_tools: Dict[str, ToolEntry]
        -_toolset_checks: Dict[str, Callable]
        -_lock: RLock
        +register(name, toolset, schema, handler, ...)
        +deregister(name)
        +get_definitions(tool_names, quiet) → List[dict]
        +dispatch(name, args, **kwargs) → str
        +get_max_result_size(name, default) → int|float
    }

    ToolRegistry "1" o-- "*" ToolEntry
```

#### 注册流程

```python
# 每个工具文件在模块导入时自注册（tools/file_tools.py L796-L799）
from tools.registry import registry, tool_error

registry.register(
    name="read_file",
    toolset="file",
    schema=READ_FILE_SCHEMA,      # 手写 dict（非 Pydantic 生成）
    handler=_handle_read_file,    # (args: dict, **kw) -> str
    check_fn=_check_file_reqs,   # () -> bool — 可用性前置检查
    emoji="📖",
    max_result_size_chars=float('inf'),  # read_file 豁免截断
)
```

#### 关键约束

| 约束 | 实现 | 目的 |
|:---|:---|:---|
| **防影子覆盖** | 注册时检测 `existing.toolset != toolset` → REJECT | 防止 MCP/Plugin 意外覆盖内置工具 |
| **Toolset 可用性门控** | `check_fn()` 在 `get_definitions()` 时执行 | 无 API Key 时工具不暴露给 LLM |
| **线程安全** | `RLock` 保护所有注册/读取操作 | MCP 动态刷新时 concurrent 安全 |
| **MCP 覆盖放行** | 两个 mcp- 前缀的 toolset 可相互覆盖 | 支持 MCP server 热刷新 |

### 2.3 Tool Dispatch 链路

```mermaid
sequenceDiagram
    participant LLM as LLM Response
    participant LOOP as Agent Loop
    participant REG as ToolRegistry
    participant HANDLER as Tool Handler
    participant PERSIST as ResultStorage
    participant CTX as Messages[]

    LLM->>LOOP: tool_calls: [{name, arguments}]
    
    Note over LOOP: Pre-dispatch Guardrails
    LOOP->>LOOP: _repair_tool_call (fuzzy fix)
    LOOP->>LOOP: validate tool_name ∈ valid_tool_names
    LOOP->>LOOP: json.loads(arguments) validation
    LOOP->>LOOP: _cap_delegate_task_calls (max 3)
    LOOP->>LOOP: _deduplicate_tool_calls (unique pairs)
    
    LOOP->>REG: dispatch(name, parsed_args, task_id=...)
    REG->>HANDLER: handler(args, **kwargs)
    HANDLER-->>REG: JSON string result
    REG-->>LOOP: result_str
    
    Note over LOOP: Post-dispatch Processing
    LOOP->>PERSIST: maybe_persist_tool_result(result, ...)
    PERSIST-->>LOOP: result or <persisted-output> preview
    
    LOOP->>CTX: messages.append({role:"tool", content:result})
    
    Note over LOOP: Turn Budget Enforcement
    LOOP->>PERSIST: enforce_turn_budget(all_tool_messages)
    PERSIST-->>LOOP: spill oversized to sandbox
```

---

## 3. 防护栏（Guardrails）系统

### 3.1 防护栏全景图

Hermes Agent 在 LLM Output → 用户可见 这条链路上部署了 **7 个独立拦截层**：

```
LLM Response
     │
     ├─[1] Scratchpad 完整性检查
     ├─[2] Codex Intermediate ACK 拦截
     ├─[3] Tool Name 验证 + 模糊修复
     ├─[4] JSON Arguments 验证 + 截断检测
     ├─[5] Post-call 限流 (delegate cap + dedup)
     │
     ├── [执行 Tool Calls] ──→ [Tool Handler Guardrails]
     │                            ├─[A] Sensitive Path 拦截
     │                            ├─[B] Secret Redaction
     │                            ├─[C] Read Size Guard
     │                            ├─[D] Re-read Loop Detection
     │                            ├─[E] File Staleness Warning
     │                            └─[F] Result Persistence (3-layer)
     │
     ├─[6] Think Block Stripping
     └─[7] Empty Response Recovery Chain
          ├── Thinking Prefill
          ├── Prior Turn Fallback
          ├── Retry (×3)
          └── Provider Fallback → "(empty)"
```

### 3.2 Pre-dispatch 拦截器 (#1–#5)

| # | 拦截器 | 触发条件 | 处理方式 | 源码 |
|:---:|:---|:---|:---|:---|
| 1 | **Scratchpad 完整性** | `<REASONING_SCRATCHPAD>` 标签未闭合 | 丢弃响应，直接重试 (max 2) | L9776–L9806 |
| 2 | **Codex ACK 拦截** | 模型输出 "I'll look into..." 但不调用工具 | 追加为 assistant message，强制 continue | L1962–L2020 |
| 3 | **Tool Name 验证** | `tc.function.name not in valid_tool_names` | 模糊修复 → 注入 tool error → 自纠错 (max 3) | L9866–L9915 |
| 4 | **JSON 参数验证** | `json.loads()` 失败 | 截断检测 → abort 或 重试/注入恢复 (max 3) | L9917–L10007 |
| 5 | **Post-call 限流** | delegate_task 超出 max_children | `_cap_delegate_task_calls()` 截断超额调用 | L10010–L10015 |

#### Codex Intermediate ACK 拦截器详解

这是一个专门针对 Codex/GPT 模型行为的防护栏。当模型输出了**规划性文本**但没有调用工具时（如 "I'll check the directory structure..."），系统将此内容作为 assistant message 保留并强制 continue 循环，迫使模型在下一 turn 真正执行工具调用。

检测逻辑 (L1962-L2020):

```python
# 5 个条件必须全部满足：
1. 对话中没有 tool 角色消息（说明是首次规划，尚未执行任何操作）
2. 文本长度 ≤ 1200 字符（排除实质性回答）
3. 包含 future intent 词汇：r"(i'll|i will|let me|i can do that)"
4. 包含 action marker 词汇：("look into", "inspect", "scan", "check", ...)
5. 或包含 workspace marker 词汇：("directory", "repo", "codebase", ...)
```

### 3.3 Tool Handler 内置防护栏 (#A–#F)

#### A. Sensitive Path 拦截

```python
# tools/file_tools.py L95-L118
_SENSITIVE_PATH_PREFIXES = ("/etc/", "/boot/", "/usr/lib/systemd/", "/private/etc/", ...)
_SENSITIVE_EXACT_PATHS = {"/var/run/docker.sock", "/run/docker.sock"}

# 拒绝写入，引导使用 terminal + sudo
→ "Refusing to write to sensitive system path. Use the terminal tool with sudo."
```

#### B. Secret Redaction (agent/redact.py)

在 tool 输出**返回给模型之前**，应用 regex 扫描并屏蔽敏感信息：

| 类别 | 检测模式数 | 覆盖范围 |
|:---|:---:|:---|
| API Key 前缀 | 30+ | OpenAI (sk-), GitHub (ghp_/gho_/ghu_/ghs_), Slack, Google, AWS, Stripe, HuggingFace, ... |
| ENV 赋值 | `*_API_KEY=`, `*_TOKEN=`, `*_SECRET=`, ... | 通配 |
| JSON 字段 | `"apiKey"`, `"token"`, `"secret"`, ... | 通配 |
| Auth Header | `Authorization: Bearer ...` | 通配 |
| Telegram Bot Token | `bot<digits>:<token>` | 格式匹配 |
| Private Key Block | `-----BEGIN * PRIVATE KEY-----` | PEM 格式 |
| DB 连接串 | `postgres://user:PASSWORD@host` | 5 种协议 |
| 电话号码 | E.164 (`+1234567890`) | 7-15 位 |

屏蔽策略：短 token (< 18 chars) → `***`；长 token → `sk-abc...xyz1`（保留首 6 尾 4）。

**安全加固**: `_REDACT_ENABLED` 在 import 时一次性快照 `HERMES_REDACT_SECRETS` 环境变量，防止 LLM 生成的 `export` 命令在运行时禁用 redaction。

#### C. Read Size Guard

```python
# tools/file_tools.py L364-L386
max_chars = 100_000  # 可通过 config.yaml: file_read_max_chars 覆盖
if content_len > max_chars:
    return error("Read produced X characters which exceeds the safety limit. Use offset and limit.")
```

#### D. Re-read Loop Detection

| 连续次数 | 行为 |
|:---:|:---|
| 1-2 | 正常返回 |
| 3 | 返回 `_warning` 字段："You have read this exact file region 3 times..." |
| ≥ 4 | **硬阻断**："BLOCKED: You have read this exact file region N times. STOP re-reading." |

计数器通过 `(path, offset, limit)` 三元组精确匹配。任何**非 read/search** 工具调用会重置计数器（`notify_other_tool_call()`）。

#### E. File Staleness Detection

```python
# 写入前检查 mtime 是否与最近 read 时一致
if current_mtime != read_mtime:
    result_dict["_warning"] = "Warning: file was modified since you last read it (external edit or concurrent agent)."
```

#### F. Tool Result 三层持久化系统

```
Layer 1: 工具内置截断         (search_files: limit=50 results, etc.)
    ↓
Layer 2: 单结果持久化         (maybe_persist_tool_result)
    ↓
Layer 3: Turn 聚合预算执行    (enforce_turn_budget)
```

| 层级 | 触发条件 | 处理方式 | 默认阈值 |
|:---:|:---|:---|:---:|
| **Layer 2** | `len(result) > threshold` (per-tool) | 写入sandbox临时文件 + 返回 preview | 100K chars |
| **Layer 3** | `sum(all_results) > turn_budget` | 按大小降序溢出最大结果到sandbox | 200K chars |

**特例豁免**: `read_file` 的 threshold 被 pinned 为 `float('inf')`，因为其输出会被模型后续 patch 操作引用——截断会导致 patch 的 `old_string` 找不到匹配。

持久化后，in-context 内容被替换为：
```xml
<persisted-output>
This tool result was too large (150,000 characters, 146.5 KB).
Full output saved to: /tmp/hermes-results/{tool_use_id}.txt
Use the read_file tool with offset and limit to access specific sections.

Preview (first 1500 chars):
[preview content...]
...
</persisted-output>
```

### 3.4 Post-output 拦截器 (#6–#7)

#### #6 Think Block Stripping

在最终响应返回给用户之前，剥离所有推理标签：

```python
# L1948-L1960
def _strip_think_blocks(self, content: str) -> str:
    # 剥离 6 种变体：
    # <think>...</think>
    # <thinking>...</thinking>         (case insensitive)
    # <reasoning>...</reasoning>
    # <REASONING_SCRATCHPAD>...</REASONING_SCRATCHPAD>
    # <thought>...</thought>           (Gemma 4)
    # 以及残留的未闭合标签
```

#### #7 Empty Response Recovery Chain

这是系统中最复杂的恢复链，处理模型完全无输出的情况：

```mermaid
flowchart TB
    START["Response content 为空/纯 think block"] --> STREAM_RECOVERY{"流式传输中已<br/>传输了部分内容?"}
    
    STREAM_RECOVERY -->|Yes| RECOVER_STREAM["使用已传输的部分内容<br/>作为 final_response"]
    
    STREAM_RECOVERY -->|No| PRIOR_CONTENT{"前一 turn 的 assistant<br/>message 有 content + tools?"}
    
    PRIOR_CONTENT -->|Yes| USE_PRIOR["使用前一 turn 的 content<br/>作为 final_response<br/>(fallback_prior_turn_content)"]
    
    PRIOR_CONTENT -->|No| HAS_REASONING{"有结构化 reasoning<br/>(API 字段)?"}
    
    HAS_REASONING -->|"Yes & prefill < 2"| PREFILL["Thinking Prefill:<br/>保留 reasoning 到 messages[]<br/>让模型在下一 turn 续写"]
    
    HAS_REASONING -->|"No 或 prefill ≥ 2"| RETRY{"empty_content_retries < 3?"}
    
    RETRY -->|Yes| RETRY_API["直接重试 API 请求<br/>(不修改 messages)"]
    
    RETRY -->|No| FALLBACK{"_fallback_chain<br/>有可用 provider?"}
    
    FALLBACK -->|Yes| SWITCH["_try_activate_fallback():<br/>切换 model/provider/client<br/>reset counters, continue"]
    
    FALLBACK -->|No| GIVE_UP["返回 '(empty)'"]
```

### 3.5 Provider Fallback Chain

这是系统的**终极容错机制**，在以下 6 种场景中自动触发：

| 触发场景 | 源码位置 |
|:---|:---|
| API 返回空/畸形响应 | L8484–L8490 |
| 认证失败 (401/403) | L9476 |
| Rate Limit (429) | L9252–L9261 |
| Context Length 溢出 | L9543 |
| 空响应重试耗尽 | L10300–L10322 |
| 异常响应结构 | L8556 |

`_try_activate_fallback()` 实现 (L5575-L5716):
1. 从 `_fallback_chain[]` 取下一个 `{provider, model, base_url, api_key}` 配置
2. 通过 `resolve_provider_client()` 构建新 OpenAI/Anthropic client
3. **原地替换** `self.model`, `self.provider`, `self.client`, `self.base_url`
4. 更新 Context Compressor 的上下文窗口限制（因为 fallback 模型可能有更小的 context window）
5. 重置所有 retry counters → 从头重试

**Turn-scope 恢复**: 每个新 turn 开始时调用 `_restore_primary_runtime()`，确保 fallback 不会永久钉住 —— 下次对话恢复到主模型。

---

## 4. 完整防护栏链路时序图

```mermaid
sequenceDiagram
    participant LLM as LLM API
    participant PRE as Pre-dispatch<br/>Guardrails
    participant TH as Tool Handler
    participant RDT as Redact +<br/>Persist
    participant POST as Post-output<br/>Guardrails
    participant USR as User

    LLM->>PRE: Response (content + tool_calls)
    
    Note over PRE: [1] Scratchpad check
    alt Incomplete scratchpad
        PRE->>LLM: Retry (max 2)
    end
    
    Note over PRE: [2] Codex ACK check
    alt Planning-only text
        PRE->>LLM: Force continue (keep text)
    end
    
    Note over PRE: [3] Tool name validation
    alt Invalid name
        PRE->>PRE: _repair_tool_call (fuzzy)
        alt Repair failed
            PRE->>LLM: Inject error → self-correct (max 3)
        end
    end
    
    Note over PRE: [4] JSON args validation
    alt Parse error
        alt Truncated
            PRE->>USR: Abort (partial)
        else Format error
            PRE->>LLM: Retry or inject recovery (max 3)
        end
    end
    
    Note over PRE: [5] Post-call caps
    PRE->>PRE: _cap_delegate_task_calls
    PRE->>PRE: _deduplicate_tool_calls
    
    PRE->>TH: Dispatch tool call
    
    Note over TH: [A] Sensitive path check
    Note over TH: [B] Device path block
    Note over TH: [C] Binary file guard
    Note over TH: [D] Read size guard (100K)
    Note over TH: [E] Re-read loop detect
    
    TH->>RDT: Raw result
    
    Note over RDT: [F] redact_sensitive_text()
    Note over RDT: [G] maybe_persist_tool_result()
    Note over RDT: [H] enforce_turn_budget()
    
    RDT->>LLM: Tool result (messages[])
    LLM->>POST: Final response content
    
    Note over POST: [6] _strip_think_blocks()
    
    alt Empty content
        Note over POST: [7] Recovery chain
        POST->>LLM: Stream recovery / Prefill / Retry / Fallback
    end
    
    POST->>USR: Final visible response
```

---

## 5. 关键设计决策与 KyberKit 启示

### 5.1 设计模式总结

| 模式 | Hermes 实现 | 工程价值 |
|:---|:---|:---|
| **Schema-free 输出** | 不使用 JSON Schema/Pydantic 约束模型输出 | 兼容所有 LLM provider（包括不支持 structured output 的本地模型） |
| **Progressive Recovery** | 4 级独立 retry → inject error → self-correct → provider fallback | 最大化每次 API 调用的成功率，避免浪费 token |
| **Fuzzy Name Repair** | lowercase → normalize → difflib (cutoff=0.7) | 模型经常大小写混用或加连字符，自动修复减少 90% 的 tool name 错误 |
| **截断 vs 格式错误区分** | 检测尾部是否有闭合括号来区分截断和格式错误 | 截断 (output length limit) 应 abort 而非重试 — 重试会得到相同结果 |
| **三层结果持久化** | Tool内截断 → Per-result溢出 → Per-turn聚合溢出 | 分层防御，避免 context window 溢出 |
| **Ephemeral 数据隔离** | tool result, reasoning, prefill 均不持久化到 session DB | 重启后不引入过时/过大的上下文 |
| **Import-time 安全快照** | Redaction 开关在 import 时硬编码 | 防止 LLM 通过 `export` 命令禁用安全机制 |

### 5.2 对 KyberKit 的建议

| Hermes 做法 | KyberKit 可采纳方向 |
|:---|:---|
| 4 级 Retry 状态机 | **必须采纳**: 每种错误类型独立计数器 + 独立降级路径 |
| Tool name fuzzy repair | **推荐采纳**: 避免无谓的 self-correction 循环，直接修复 |
| 三层结果持久化 | **关键采纳**: 防止工具结果吞噬 context window |
| Secret Redaction (30+ patterns) | **必须采纳**: 工具输出可能包含文件中的密钥 |
| Re-read loop detection | **推荐采纳**: Agent 常见陷入读取循环，4 次硬阻断是有效对策 |
| Provider fallback chain | **参考**: 如果支持多 provider，自动切换是关键的可用性保障 |
| Codex ACK 拦截器 | **参考**: 特定模型行为的定向防护 |
