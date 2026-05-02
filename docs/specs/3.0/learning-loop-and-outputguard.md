# LearningLoop + OutputGuard (3.0 P0.5)

状态: Draft  
范围: P0.5 首切片

---

## 1. 目标

在 P0 信任底座（Task Contract + Permission Gate + Audit）之上完成两个核心闭环：

1. **OutputGuard**：阻止含提示注入的工具输入/输出进入自动行动链路。
2. **LearningLoop**：任务结束后自动生成进化变更摘要（Evolution Changelog）并驱动技能建议，所有变更有回滚锚点。

---

## 2. OutputGuard

### 2.1 职责边界

OutputGuard **不是**内容安全平台，也不重复 P0 的 `evaluatePolicy` / `matchImmutableDenyList` 逻辑。它聚焦于：

- 检测工具 **输入**（LLM 发送给工具的 arguments）中的提示注入特征
- 检测工具 **输出**（工具返回给 LLM 的 result）中的提示注入特征

### 2.2 两侧检测点

| 检测点 | 触发时机 | 组件 |
| --- | --- | --- |
| **Input guard** | `ToolDispatcherMiddleware.validateAndRule()` 中，policy 通过后、工具执行前 | `OutputGuardChecker.checkInput()` |
| **Output guard** | `OutputGuardMiddleware.process()` 处理 `tool_result` 事件时 | `OutputGuardMiddleware` (StreamMiddleware) |

### 2.3 阻断行为

- **Input 阻断**：与 P0 policy 拒绝同路 —— 返回 `isError: true` 的 `ToolResultEvent`，policyDecision.code = `input_injection_blocked`，审计字段齐全。
- **Output 阻断**：在 `tool_result` 事件 result 前缀追加 `[OutputGuard] 注入警告：...`，并在 result 中追加上下文说明，同时发出 `output_guard.blocked` 总线事件。

> P0.5 首切片不"硬杀死"会话，而是以可读警告让 LLM 自行决策；高风险场景的强制截断留待 P1 迭代。

### 2.4 注入模式（初始集）

| 模式 ID | 正则 | 描述 |
| --- | --- | --- |
| `ignore_instructions` | `/ignore\s+(all\s+)?previous\s+instructions?/i` | 经典提示注入 |
| `self_grant` | `/you\s+(must now\|are now)\s+(authorized\|allowed\|permitted)/i` | 自授权攻击 |
| `role_override` | `/act\s+as\s+(?:if\s+you\s+(?:have\|had)\|a\s+)?(?:root\|admin\|sudo\|unrestricted)/i` | 角色劫持 |
| `system_override` | `/<\s*SYSTEM\s*OVERRIDE\s*>/i` | 系统覆盖标记 |
| `system_tag_inject` | `/\[SYSTEM\]:\s*ignore/i` | 系统标签注入 |
| `kyberkit_bypass` | `/kyberkit[- ](bypass\|disable\|override)/i` | KyberKit 权限绕过 |

### 2.5 可扩展性

`OutputGuardRules` 接受外部 `PatternRule[]` 注入（constructor dep）；规则 ID 出现在审计与总线事件中，便于后续统计与调优。

---

## 3. LearningLoop

### 3.1 职责边界

P0.5 的 LearningLoop 是**基础闭环**，不涉及 §6 的「放量门槛」准入评审；准入评审作为独立功能在 dogfood 数据积累后迭代。

本切片交付：
1. 任务结束后自动生成 **Evolution Changelog 条目**（规则驱动，不调 LLM）
2. 驱动 **SkillSuggestionRunner** 生成技能草稿（已有能力复用）
3. 记录 **回滚锚点**（最近一次 checkpoint ID，由总线事件获取）
4. 发出 `learning_loop.evolved` 总线事件

### 3.2 组件

```
LearningLoopMiddleware
  ├── deps.skillRunner?      // 已有 SkillSuggestionRunner（可选）
  ├── deps.changelog         // EvolutionChangelog 写入器
  ├── deps.eventBus          // 订阅 checkpoint.saved，发出 learning_loop.evolved
  └── deps.minToolCalls      // 最小工具调用阈值（默认 2）

EvolutionChangelog
  └── appendEntry()          // 追加 Markdown 条目到 ~/.kyberkit/evolution-changelog.md
```

### 3.3 触发条件

| 条件 | 默认值 |
| --- | --- |
| 任务工具调用数 ≥ minToolCalls | 2 |
| 非 error stopReason | end_turn, tool_use |

不满足条件时静默跳过（不报错）。

### 3.4 Evolution Changelog 条目格式

```markdown
## 2026-05-02T13:38:00+08:00

**任务**: 构建用户认证模块 (`task-id-abc`)  
**工具调用**: 12 次 (read_file ×4, write_file ×5, bash ×3)  
**回滚点**: `checkpoint-abc123`

---
```

文件路径：`<workspaceRoot>/.kyberkit/evolution-changelog.md`（首次自动创建）。

### 3.5 集成点

`AgentSession.send()` 在 `task_complete` 事件后调用：

```ts
this.learningLoop?.schedule(event, this.turnToolLog, this.lastUserText, this.latestCheckpointId);
```

`LearningLoopMiddleware` 同时通过 `eventBus.on('checkpoint.saved', ...)` 自维护 `latestCheckpointId`（松耦合，无需直接引用 CheckpointManager）。

---

## 4. 事件规范

### `output_guard.blocked`

```ts
{
  direction: 'input' | 'output';
  toolName: string;
  ruleId: string;
  reason: string;
  taskId?: string;
  agentId?: string;
}
```

### `learning_loop.evolved`

```ts
{
  taskId: string;
  mission: string;
  rollbackCheckpointId?: string;
  changelogPath: string;
  toolCalls: number;
  skillSuggested: boolean;
}
```

---

## 5. 验收标准

### OutputGuard
1. 至少一个测试覆盖"tool input 含注入模式 → 返回 error tool_result，code=`input_injection_blocked`"。
2. 至少一个测试覆盖"tool output 含注入模式 → result 前缀包含 `[OutputGuard]`，发出总线事件"。
3. 无注入内容时正常透传，不影响正常工具调用。

### LearningLoop
1. 至少一个测试覆盖"task_complete (toolCalls ≥ 2) → changelog 条目写入，learning_loop.evolved 事件发出"。
2. 至少一个测试覆盖"toolCalls < minToolCalls → 静默跳过"。
3. 至少一个测试覆盖"rollbackCheckpointId 从总线事件中正确传播到 learning_loop.evolved"。
