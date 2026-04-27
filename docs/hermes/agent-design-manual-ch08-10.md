# 第八部分：上下文窗口管理

> **前置依赖**: [第七部分：安全与防御性工程](./agent-design-manual-ch07.md)

---

## 8.1 五阶段上下文压缩算法

### 核心命题

> **上下文压缩不是"删掉旧消息"，而是"用结构化摘要保留关键信息血统链"。**

```
Phase 1: 剪枝旧工具结果 (纯规则, 无 LLM 调用)
  └─ 超过 N 轮的 tool role messages → 替换为 "[Result pruned — {size} chars]"
  └─ 保护最近 K 轮的完整结果

Phase 2: 保护 Head/Tail
  └─ Head: 保留最前面 2 条 messages (通常是用户首条 + Agent 首响应)
  └─ Tail: 保留最后 M 条 messages (当前工作上下文)
  └─ 中间部分送入 Phase 3

Phase 3: LLM 结构化摘要
  └─ 用辅助模型生成 11 Section 结构化摘要 (见第四部分 4.4)
  └─ 双模式: 首次压缩 vs 迭代更新

Phase 4: 孤立 Tool Result 清理
  └─ 删除 tool_call_id 在 messages 中找不到匹配 assistant message 的 tool results
  └─ 防止 API 返回 "orphaned tool result" 错误

Phase 5: System Prompt 重建
  └─ 清空 _cached_system_prompt → 下一轮重建
  └─ 重新从磁盘加载 MemoryStore (捕获会话中的写入)
```

### 压缩触发条件

```python
# 预检: 当前 messages 的 token 总量 > context_window * threshold
if estimated_tokens > self._context_length * 0.85:
    self._compress(messages)
```

阈值 **0.85** 留出 15% 的安全余量——给 LLM 的下一轮响应留足生成空间。

> **最佳实践**: Phase 1 的纯规则剪枝应在 LLM 摘要之前执行——减少送入 LLM 的文本量，节省摘要的 Token 成本。

---

## 8.2 工具结果的三层 Token 预算

（已在 5.5 节详述，此处从上下文管理视角补充）

### `<persisted-output>` 替换格式

当工具结果超过阈值被持久化到文件后，messages 中的原始内容被替换为：

```
<persisted-output path="/tmp/hermes/tool_results/{hash}.txt" size="245000">
{前 1,500 字符预览}
...
[Full output persisted to disk. Use read_file to access if needed.]
</persisted-output>
```

Agent 可以通过 `read_file` 按需读取完整结果——但由于 `read_file` 本身被 PINNED 为 `inf` 阈值，不会再次触发持久化。

### 跨环境一致性

持久化文件的写入路径通过 `BaseEnvironment.get_temp_dir()` 统一——Local、Docker、SSH、Modal 模式下都能正确解析。

---

## 8.3 128K 大上下文窗口的工程考量

| 误区 | 现实 |
|:---|:---|
| 128K 够用，不需要压缩 | 关键信息在超长 context 中的注意力权重显著衰减（"Lost in the Middle" 问题） |
| 更大窗口 = 更好表现 | 50K+ token 的会话中，模型对中段信息的召回率下降 ~30% |
| 压缩只是节省 Token | 压缩还通过**重新组织信息**提高了模型对关键内容的注意力 |

> **最佳实践**: 即使有 128K 窗口，仍应保持压缩机制作为安全网。压缩的核心价值不是省 Token，而是**信息密度提升**。

---

> **下一章**: [第九部分：执行环境与沙箱安全](./agent-design-manual-ch09.md)


# 第九部分：执行环境与沙箱安全

---

## 9.1 六种终端后端

| 后端 | 适用场景 | 隔离级别 |
|:---|:---|:---|
| **Local** | 个人本机使用 | 无隔离 (依赖 OS 用户权限) |
| **Docker** | 容器隔离 | 命名空间 + 只读根 FS |
| **SSH** | 远程服务器操作 | 网络隔离 |
| **Daytona** | 无服务器 | 闲置休眠，用时拉起 |
| **Modal** | 无服务器计算 | 按需容器 |
| **Singularity** | HPC/科研 | 替代 Docker (无 root 权限环境) |

所有后端通过 `BaseEnvironment` ABC 统一接口：`execute()`, `get_temp_dir()`, `read_file()`, `write_file()`。

## 9.2 容器加固默认策略

Docker 模式下**默认启用**（不是可选开关）：
- 只读根文件系统 (`--read-only`)
- 移除所有 Linux 特权权限 (`--cap-drop=ALL`)
- 命名空间隔离 (`--no-new-privileges`)
- 仅挂载工作目录为可写卷

> **设计理念**: 安全防护应该是**默认约束**而非可选增强。Agent 无法 `rm -rf /` 也无法提权。

---

> **下一章**: [第十部分：Cron 定时自动化](./agent-design-manual-ch10.md)


# 第十部分：Cron 定时自动化

---

## 10.1 定时任务作为一等公民

Cron 任务不是"调 AI 的 Shell 脚本"——它是**完整 Agent 循环执行**的定时触发：

```
定时触发 (clock)
  ↓
Gateway.tick() (每 60 秒检查)
  ↓
创建完整 AIAgent 实例
  ↓
注入 cron task prompt 作为 user message
  ↓
执行完整 ReAct Loop (Think → Act → Observe → ...)
  ↓
结果投递到指定平台 (Telegram / Discord / 文件)
  ↓
输出保存到 ~/.hermes/cron/output/{job_id}/{timestamp}.md
```

## 10.2 调度架构

### 三种调度模式

| 模式 | 格式 | 示例 |
|:---|:---|:---|
| `once` | ISO 时间戳 | `2026-04-25T09:00:00` |
| `interval` | 秒数 | `3600` (每小时) |
| `cron` | croniter 表达式 | `0 9 * * 1-5` (工作日 9 点) |

### 隔离设计

Cron Agent 必须设置 `skip_memory=True`——定时任务的系统提示会污染用户画像建模（Honcho 的 `agent_context="cron"` 跳过写入）。

## 10.3 会话持久化

- SQLite WAL 模式支持单写多读——多会话并行时的并发安全
- 原始对话存为 JSONL 格式
- 压缩后的摘要保留原始对话的血统链引用
- FTS5 全文索引支持跨会话的 `session_search`

---

> **下一章**: [第十一部分：多模型适配](./agent-design-manual-ch11.md)
