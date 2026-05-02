# Capability Decomposition (3.0 P0.5)

状态: Draft  
范围: P0.5 Capability Decomposition — LearningLoop 增强

---

## 1. 目标

让用户用自然语言描述高层目标，Agent 自动分解为：

1. **Skill 调用链草稿**：按顺序执行的技能步骤列表
2. **合约草稿**（draft 状态的 `TaskPermissionContract`）：含 `contractType`、调度参数、所需工具与上下文声明

产品叙事落点：§1.1「Agentic 而非编码 / 流程图」——用户描述「我想要什么节奏」，KyberKit 负责翻译成可执行的合约结构。

---

## 2. 入口

### `/decompose <goal>`

```
/decompose 每天凌晨 1 点分析业务数据并生成日报发给自己
/decompose 当 logs 出现 payment-fail-spike 时自动诊断
/decompose 帮我把接下来五个任务拆成 Skill 调用计划
```

命令同步返回格式化结果，草稿自动保存到：
`<userRoot>/.kyberkit/contract-drafts/<draft-id>.json`

---

## 3. 架构

```
DecomposeCommand (/decompose)
  └── CapabilityDecomposer.decompose(goal, availableSkills)
        ├── LLM call (compact model) → JSON response
        ├── parse & validate → DecompositionDraft
        │     ├── skillChain: SkillChainStep[]
        │     └── contract: TaskPermissionContract (status=draft)
        └── ContractDraftStore.save(draft)

Events:
  capability_decomposition.completed → { draftId, goal, contractType, skillChainLength }
```

---

## 4. `DecompositionDraft` 数据结构

```ts
interface SkillChainStep {
  order: number;
  skillName: string;
  description: string;
}

interface DecompositionDraft {
  draftId: string;
  goal: string;
  summary: string;
  skillChain: SkillChainStep[];
  contract: TaskPermissionContract; // status = 'draft'
  createdAt: number;
}
```

---

## 5. LLM 调用规范

### 模型

使用 `compactModel`（如 Haiku），与 `SkillSuggestionRunner` 保持一致。

### System Prompt 要点

- 角色：KyberKit 任务规划助手
- 任务：将高层目标分解为 contract + skill chain
- 输出格式：**纯 JSON**，无 markdown 包裹，无解释文字

### 输出 JSON schema

```json
{
  "contract_type": "recurring | triggered | ad_hoc",
  "schedule": "0 1 * * *",
  "trigger": { "source": "logs.alert", "match": "payment-fail-spike", "backoff": "5m" },
  "requested_tools": [
    { "name": "read_file", "max_level": "L0" },
    { "name": "bash", "max_level": "L1" }
  ],
  "requested_context": [
    { "source": "business_data", "scope": "read", "mode": "read" }
  ],
  "skill_chain": [
    { "name": "data_analysis", "description": "分析今日业务数据" },
    { "name": "report_generation", "description": "生成 Markdown 日报" }
  ],
  "summary": "每天凌晨 1 点分析业务数据并生成日报"
}
```

`schedule` 仅在 `contract_type = recurring` 时出现；`trigger` 仅在 `triggered` 时出现。

---

## 6. 合约草稿持久化

### `ContractDraftStore`

文件路径：`<userRoot>/.kyberkit/contract-drafts/<draftId>.json`

```ts
class ContractDraftStore {
  save(draft: DecompositionDraft): Promise<void>
  load(draftId: string): Promise<DecompositionDraft | null>
  listAll(): Promise<DecompositionDraft[]>
}
```

草稿文件格式：JSON（含 `DecompositionDraft` 全量字段）。

---

## 7. `/decompose` 命令输出格式

```
✓ 目标已分解（草稿 ID: abc12345）

**摘要**: 每天凌晨 1 点分析业务数据并生成日报

**合约类型**: recurring（cron: 0 1 * * *）

**Skill 调用链**:
1. data_analysis — 分析今日业务数据
2. report_generation — 生成 Markdown 日报

**所需工具**: read_file (L0), bash (L1)

草稿已保存至 ~/.kyberkit/contract-drafts/abc12345.json
下一步: 用 /contract activate abc12345 激活此合约（P1 调度器就绪后可用）
```

---

## 8. 容错策略

| 场景 | 处理 |
|---|---|
| LLM 返回非 JSON 或解析失败 | 尝试提取 JSON block；失败则返回 "解析失败，请重试或用更具体的描述" |
| 未知 contract_type | 默认 `ad_hoc` |
| skill_chain 为空 | 返回只含合约草稿（无 skill chain）的结果，不报错 |
| 合约类型为 recurring 但无 schedule | 提示用户补充调度信息 |

---

## 9. 验收标准

1. `/decompose 每天凌晨生成日报` → 返回 `contract_type: recurring`、含 `schedule` 字段。
2. `/decompose 当 logs 告警时诊断` → 返回 `contract_type: triggered`、含 `trigger.source`。
3. 草稿文件正确写入 `<userRoot>/.kyberkit/contract-drafts/`。
4. `capability_decomposition.completed` 事件包含 `draftId`、`contractType`、`skillChainLength`。
5. LLM 返回无效 JSON 时不崩溃，返回可读错误信息。
