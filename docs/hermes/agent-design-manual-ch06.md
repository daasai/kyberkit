# 第六部分：LLM 输出控制与防护栏体系

> **前置依赖**: [第五部分：工具系统设计](./agent-design-manual-ch05.md) | [输出控制工程分析](./output-control-engineering.md)

---

## 6.1 四级 Retry 状态机

### 核心命题

> **不同类型的畸形输出需要不同的恢复策略。将所有错误类型混入单一 `retry_count` 是工程上最常见的失误。**

Hermes 为四种畸形输出类型设置**独立计数器和独立降级路径**：

| 级别 | 错误类型 | 最大重试 | 恢复策略 | 计数器 |
|:---|:---|:---:|:---|:---|
| L1 | **Scratchpad 完整性** | 2 | 检测 `<scratchpad>` 标签未闭合 → 静默重试 | `_scratchpad_retry` |
| L2 | **工具名验证** | 3 | 三级模糊修复 (lowercase → normalize → fuzzy) → 直接执行 | `_tool_name_retry` |
| L3 | **JSON 参数解析** | 3 | 区分截断 vs 格式错误 → 截断时增大 max_tokens | `_json_retry` |
| L4 | **空响应** | 3 | 五级恢复链 (见 6.4) | `_empty_retry` |

### JSON 截断 vs 格式错误的区分

```python
# 伪代码逻辑
if json_parse_error:
    raw = tool_call.function.arguments
    if not raw.rstrip().endswith(("}", "]")):
        # 截断！尾部没有闭合括号 → 增大 max_tokens 重试
        retry_with_larger_budget()
    else:
        # 格式错误！括号闭合但 JSON 不合法 → 注入纠错信息重试
        inject_correction_and_retry()
```

截断和格式错误的恢复策略**完全不同**：截断需要更大的生成预算，格式错误需要纠错提示。

### Self-Correction 注入策略

纠错信息通过 `tool` role 注入（而非 `user` role），保持 LLM API 要求的 role alternation：

```python
messages.append({
    "role": "tool",
    "content": f"ERROR: Invalid JSON for tool '{tool_name}'. "
               f"Parse error: {error_message}. "
               f"Please retry with valid JSON arguments.",
    "tool_call_id": tool_call.id,
})
```

> **最佳实践**: 纠错信息用 `tool` role 注入，因为它是对 tool_call 的"响应"。用 `user` role 会让模型误以为这是新的用户输入。

---

## 6.2 Empty Response Recovery Chain

当 LLM 返回空内容（`content` 为 None 或空字符串且无 tool_calls）时，触发五级恢复链：

```
Level 1: Stream Recovery
  └─ 检查流式响应的 buffer 中是否有未 flush 的 content → 拼接

Level 2: Prior Turn Fallback
  └─ 检查上一轮响应中是否已有 partial content → 作为 fallback

Level 3: Thinking Prefill
  └─ 某些推理模型只输出了 <think>...</think> 但没有 visible content
  └─ 保留 thinking 部分，向 messages 追加一条让模型续写 visible content

Level 4: Retry × 3
  └─ 使用 _empty_retry 计数器，最多重试 3 次

Level 5: Provider Fallback
  └─ 切换到备用模型/Provider
```

**Thinking Prefill** 是专门针对推理模型（如 DeepSeek-R1、QwQ）的设计：这些模型有时会用尽 token 预算在 `<think>` 标签内推理，导致 visible content 为空。保留推理过程让模型在下一轮直接续写答案，而非从头重来。

> **避坑**: 不区分 "有 reasoning 但无 visible content" 和 "完全空响应" 会导致推理模型陷入自旋——每次重试都在推理同样的问题。

---

## 6.3 Provider Fallback Chain

### 六种触发场景

| 场景 | 处理方式 |
|:---|:---|
| Rate Limit (429) | 切换到备用 Provider |
| Server Error (500/502/503) | 切换到备用 Provider |
| Timeout | 切换到备用 Provider |
| Auth Error (401/403) | 切换到下一个 API Key |
| Model Not Found | 切换到备用模型 |
| 连续 3 次空响应 | 切换到备用 Provider |

### Turn-scope 恢复

Fallback 是 **Turn-scope** 的——只在当前 turn 使用备用 Provider，下一个 turn 自动恢复主 Provider。这防止了一次临时故障导致永久降级。

```
Turn 1: 主模型 (Claude) → 成功
Turn 2: 主模型 (Claude) → 429 → Fallback (GPT-4o) → 成功
Turn 3: 主模型 (Claude) → 自动恢复，不继续用 GPT-4o
```

> **避坑**: Fallback 模型的 context window 可能更小 — Fallback 时必须同步更新 Compressor 阈值，否则可能超出备用模型的上下文限制。

---

> **下一章**: [第七部分：安全与防御性工程](./agent-design-manual-ch07.md)
