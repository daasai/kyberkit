# 第七部分：安全与防御性工程

> **前置依赖**: [第六部分：输出控制与防护栏](./agent-design-manual-ch06.md)

---

## 7.1 Prompt Injection 防御

### 双通道扫描

Hermes 在两个独立通道执行注入扫描：

**通道 1: 上下文文件** (`prompt_builder.py`)
- 扫描 SOUL.md、AGENTS.md、CLAUDE.md、.cursorrules 等用户可控文件
- 10 种威胁模式正则匹配 + 不可见 Unicode 字符检测

**通道 2: 记忆内容** (`memory_tool.py`)
- 扫描所有写入 MEMORY.md / USER.md 的内容
- 11 种威胁模式 (包含数据泄露模式: curl/wget + secrets)

检测到可疑内容时，处理方式是**整体替换为 BLOCKED 标记**而非部分过滤——部分过滤可能留下绕过通道。

### 不可见 Unicode 字符

检测 10 种不可见字符：U+200B (Zero Width Space), U+200C/D, U+2060, U+FEFF, U+202A–E (Bidirectional Override)。这些字符可被用于在看似无害的文本中隐藏注入指令。

> **最佳实践**: 注入扫描必须覆盖**所有注入 System Prompt 的用户可控内容**。遗漏任何一个通道就等于没有防御。

---

## 7.2 敏感信息脱敏

### 30+ 模式覆盖

`agent/redact.py` 实现了覆盖以下类别的脱敏：

| 类别 | 模式示例 |
|:---|:---|
| API Key 前缀 | `sk-`, `ghp_`, `AKIA`, `xoxb-`, `Bearer ey...` |
| ENV 赋值 | `export API_KEY=...`, `API_KEY="..."` |
| JSON 字段 | `"api_key": "..."`, `"password": "..."` |
| Auth Header | `Authorization: Bearer ...` |
| DB 连接串 | `postgres://user:pass@host/db` |
| PII | 信用卡号、SSN 等模式 |

### Import-time 安全快照

```python
# 模块导入时固化 Redaction 开关
_REDACT_ENABLED = os.getenv("HERMES_REDACT_SECRETS", "true").lower() != "false"
# 后续运行时修改环境变量无效 — 防止 LLM 通过 run_terminal_cmd 执行:
#   export HERMES_REDACT_SECRETS=false
```

这个 import-time 固化是关键安全设计——LLM 可以通过工具调用修改环境变量，如果 Redaction 开关在运行时读取环境变量，就能被 LLM 绕过。

> **避坑**: 任何安全开关都不应通过运行时环境变量控制。在模块导入时固化为常量。

---

## 7.3 工具执行安全边界

| 防护机制 | 描述 | 阈值 |
|:---|:---|:---|
| **敏感路径拦截** | 拦截对 `~/.ssh`, `~/.env`, `/etc/passwd` 等路径的访问 | 硬编码黑名单 |
| **设备路径阻断** | 拦截 `/dev/*` 路径的读写 | 正则匹配 |
| **Re-read Loop 硬阻断** | 检测 Agent 反复读取同一文件 | 4 次 → 硬阻断 |
| **File Staleness Detection** | 写入前检测文件是否已被外部修改 | mtime 比较 |

Re-read Loop 是一个常见的 Agent 行为退化：模型无法理解文件内容 → 反复 read_file → 用尽迭代预算。4 次硬阻断强制 Agent 改变策略。

---

## 7.4 反循环与资源保护

### IterationBudget

```python
class IterationBudget:
    """线程安全的迭代计数器，跨父/子 Agent 共享"""
    def __init__(self, max_iterations=90):
        self._remaining = max_iterations
        self._lock = threading.Lock()

    def consume(self) -> bool:
        """消耗一次迭代。返回 False 表示预算用尽。"""
        with self._lock:
            if self._remaining <= 0:
                return False
            self._remaining -= 1
            return True
```

- 主 Agent 默认 **90 次**迭代预算
- 子代理独立 **45 次**（可配）
- grace call: 预算归零后允许最后一次 "wrap up" 调用

---

> **下一章**: [第八部分：上下文窗口管理](./agent-design-manual-ch08.md)
