# Skill Forge 2.0 判断框架引擎

> 状态：Draft（v2，基于 Kevin 2.0 第一性重写）  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 第一性底层：`./00-first-principles.md`（Q2 后置沉淀、Q5 方法引擎）  
> **资产定义权威来源：`./12-cognitive-capital.md`**（C3 行为偏好 §3.3、C4 判断框架 §3.4）  
> 上游接口：`./10-ai-proactive-behaviors.md`（§3 后置沉淀行为目录，特别是 B-S-002）  
> 下游接口：`./10-ai-proactive-behaviors.md`（§5 飞轮闭环消费接口）  
> 相关历史：`../../kevin1.5/skill-architecture.md`
>
> **本文档职责**：专注 Skill Forge 的**产品机制**——C4 判断框架 Skill 的触发逻辑、Skill Preview UX、file-backed 草案实现、KyberKit 技术对齐。资产类型定义见 doc 12。

---

## 0. 核心修正说明

本文档是对原 Skill Forge 2.0 PRD 的**根本性重写**，核心修正如下：

| 维度 | 原定义 | 新定义 |
|---|---|---|
| 产品本质 | 工作模式蒸馏引擎（Work Pattern Distillation Engine） | 判断框架引擎（Judgment Framework Engine） |
| Skill 颗粒度 | 工作流偏好（偏好什么结构、语气、模板） | 判断框架（用什么标准、什么顺序评估、哪些因素更重要） |
| 核心信号 | 模式频次统计（做了什么、多少次） | 判断信号聚合（接受/拒绝/修改了什么，以及隐含的原因） |
| Skill Preview 展示 | 生成的提示词 | Kevin 观察到的判断模式（用用户自己的语言描述） |
| 架构 | 单层 Skill | 两层：偏好记录（轻量）+ 判断框架 Skill（重量） |

这次修正的根本原因：用户的私有方法（private method）是 Kevin 最深的护城河。私有方法不是"风格偏好"（Risks 写成 bullet），而是"判断框架"（分析留存问题时先看同期群，再看首日留存，用这个框架评估优先级）。前者人人都有、容易复制；后者是用户经过实践验证的智识资产，是真正不可替代的东西。

---

## 1. 产品本质

Skill Forge 2.0 是 Kevin 的**方法引擎（Method Engine）**。

它不是提示词收藏夹，不是工作流搭建器，也不是偏好记录器。它的核心能力是：

```text
Judgment Framework Engine
判断框架引擎

捕获用户在真实工作中外显的判断标准，
将其结构化为可审查、可复用、可演进的判断框架，
并在下一次同类工作中，作为 Kevin 准备认知环境的方法依据。
```

**判断框架是什么**：当用户面对一类重复问题时，稳定应用的评估逻辑——不是"A 比 B 好"的偏好，而是"在 X 情境下，我先看 Y，再考虑 Z，用 W 标准评估优先级"的方法。

**举例（领域无关）**：

| 场景 | 判断框架示例 |
|---|---|
| 产品分析留存数据 | "先用同期群分解新老用户，优先关注首日留存；留存问题才进入功能层找原因" |
| 自媒体评估选题价值 | "先看读者画像匹配度，再看平台近期算法偏好，高互动标题参考而不照搬" |
| 投资研究公司 | "先看 FCF 稳定性，再看管理层资本配置历史，估值是最后一步" |
| 评估功能风险 | "先问'能回滚吗'，再问'影响多少核心路径'，最后问'有没有前例'" |

每一个框架背后都有用户真实工作经验积累的认知——通用 AI 不知道，只有 Kevin 知道。

---

## 2. 两层 Skill 架构（引用 doc 12）

> **完整的资产类型定义见 `12-cognitive-capital.md`**。本节只做简要说明，不重复定义。

Skill Forge 管理两层积累：

**Tier 1：行为偏好（C3 Behavioral Preference）**  
→ 定义：`12-cognitive-capital.md` §3.3  
→ 本文档职责：触发后的透明标注展示方式，用户在 My Kevin 中的管理操作  

**Tier 2：判断框架 Skill（C4 Judgment Framework）**  
→ 定义：`12-cognitive-capital.md` §3.4（含 schema、与 C3 的边界、积累机制）  
→ 本文档职责：Skill Preview 的 UX 细节、file-backed 草案实现、KyberKit 技术对齐

```
用户行为信号
  ↓ 信号积累（doc 10 B-S 系列采集）
C3 行为偏好（3次触发，自动生效，透明标注）
  ↓ 信号积累 + 可识别方法结构
C4 判断框架草案（5次触发，写入 .kevin/skill-drafts/，需用户确认）
  ↓ Skill Preview → 用户确认
正式 Judgment Framework Skill
```

---

## 3. 判断框架 Skill 的 Schema

### 3.1 完整字段定义

```typescript
interface JudgmentFrameworkSkill {
  // 身份
  skill_id: string;
  version: number;
  created_at: string;
  updated_at: string;
  scope: 'space' | 'user' | 'global';
  
  // 描述（用用户自己的语言，不是技术描述）
  name: string;               // 用户可编辑；Kevin 建议一个初始命名
  applies_to: string;         // "当你处理 X 类问题时"
  description: string;        // 2-4 句，描述这个框架的核心逻辑
  
  // 框架结构（核心内容）
  framework_steps: Array<{
    order: number;
    step_description: string;  // "先看 X"、"再评估 Y"
    key_criteria?: string;     // "用什么标准判断"
    source_signal?: string;    // 这一步的观察来源（可溯源）
  }>;
  
  // 应用条件
  trigger_context: string;    // 什么情境下应用这个框架
  not_applicable_when: string[];  // 什么情况下不适用
  
  // 来源溯源
  source_signals: Array<{
    signal_type: string;       // 来自 doc 10 的信号类型编码
    observed_at: string;
    description: string;       // Kevin 观察到的具体行为
    artifact_ref?: string;
  }>;
  signal_count: number;        // 生成此 Skill 的信号数量
  
  // 技术字段（Kevin 内部使用）
  prompt_injection?: string;   // 应用此框架时注入的结构化提示
  confidence: 'high' | 'medium' | 'low';
  
  // 可选：与 Artifact 类型的关联
  preferred_artifact_types?: string[];
  evidence_preferences?: {
    preferred_evidence_types: string[];
    minimum_support_level: string;
  };
  
  // 可选：与输出格式的关联（对接 Output Style Registry）
  preferred_output_style?: string;
}
```

### 3.2 与旧 Skill schema 的主要差异

| 字段 | 旧 schema | 新 schema |
|---|---|---|
| 核心内容字段 | `preferences`（风格列表） | `framework_steps`（方法步骤） |
| 触发描述 | `when to use`（场景描述） | `applies_to` + `trigger_context`（条件化） |
| 来源字段 | 无 | `source_signals`（完整溯源） |
| 应用范围 | 材料类型 + Artifact 类型 | `trigger_context`（更泛化） |
| 透明性字段 | 无 | `signal_count` + `confidence` |

---

## 4. 信号来源与提取逻辑

### 4.1 信号类型与质量分级

来源参见 `10-ai-proactive-behaviors.md` §3.1 判断信号采集目录。质量分级如下：

| 信号类型 | 质量等级 | 描述 |
|---|---|---|
| **diff 修改后接受** | ⭐⭐⭐ 最高 | 用户接受了 Kevin 的建议但做了修改——修改的内容就是私有方法的外显 |
| **Chat 纠正** | ⭐⭐⭐ 最高 | 用户说"这不对，应该是 X"——直接外显了判断标准 |
| **Evidence 替换** | ⭐⭐ 高 | 用户把 Kevin 推荐的证据换成另一个——体现证据标准 |
| **ActionRequest 拒绝 + 理由** | ⭐⭐ 高 | 用户说明了为什么不批准——体现决策边界 |
| **diff 直接拒绝（反复）** | ⭐ 中 | 什么类型的建议被反复拒绝——体现禁止模式 |
| **diff 直接接受** | ⭐ 中 | 较弱信号；知道用户接受了什么，但不知道为什么 |
| **Block 手动直接编辑** | ⭐⭐⭐ 最高 | 用户不通过 diff 直接写内容——原始输出是最真实的私有方法（需用户授权采集） |

### 4.2 从信号到 Skill 草案的提取逻辑

**Tier 1 偏好记录**（3 次同类信号触发，自动形成）：

```
3 次"diff 修改后接受"同类修改方向
  → 提取：用户在 [block 类型] 里的表达倾向
  → 形成 Preference Record：{dimension, direction, confidence, source_count}
  → 透明应用：下次生成同类内容时自动按偏好，并标注"（按你在这个项目里的习惯）"
```

#### 4.2.1 MVP 可见闭环：C3 行为偏好

MVP 必须至少做出 Tier 1 的可见闭环。否则"在反馈中不断进化"只停留在战略叙事，用户看不到 Kevin 变聪明。

最小闭环：

```text
用户连续 3 次修改同类 diff
  → Kevin 形成 C3 行为偏好
  → My Kevin 中出现该偏好（来源、作用域、最近使用时间）
  → 下一次同类生成时透明标注"按你在这个项目里的习惯"
  → 用户可以本次不用 / 禁用 / 删除
```

MVP 只要求 C3，不要求 C4 自动形成。C4 判断框架在 MVP 中支持显式触发和 Preview，但自动触发可后置。

优先支持的 C3 场景：

| 场景 | 触发信号 | 偏好示例 |
|---|---|---|
| PRD Review/Diff | 同类 block 中 3 次修改后接受 | "Risks block 写成决策导向条目" |
| Evidence 选择 | 3 次替换 Kevin 推荐证据 | "Problem block 优先引用用户原话，而不是总结" |
| Weekly Ops Review | 3 次调整指标解释顺序 | "先解释趋势，再给行动建议" |

验收标准：

- C3 偏好形成后能在 My Kevin 中查看。
- Kevin 下次应用该偏好时必须透明标注。
- 用户禁用偏好后，后续生成不再应用该偏好。
- 偏好来源必须能回看至少 1 条代表性信号。

**Tier 2 判断框架 Skill**（5 次信号 + 可识别逻辑，主动提议）：

```
5 次以上相关信号（不限类型）+ Kevin 能识别出方法结构
  → 提取：framework_steps（每步从哪个信号推断，记录来源）
  → 生成 Skill 草案（file-backed 存为 .kevin/skill-drafts/[name].md）
  → 触发 B-S-002（向用户提议确认）
  → 用户审查编辑后确认 → 升级为正式 Skill
```

**"可识别逻辑"的判断标准**：

Kevin 需要识别信号背后有一个可用 2-4 步描述的方法，而不只是"A 比 B 好"的单一倾向。判断方法：
- 有顺序性（先 X 再 Y）
- 有条件性（当 Z 情况时，用 W 标准）
- 跨多个信号类型印证（不同来源的信号指向相同逻辑）

如果信号只支持单一倾向，形成 Tier 1 偏好记录，不升级为 Tier 2。

---

## 5. 触发机制

### 5.1 显式触发（用户主动）

用户在任意时刻可以说：
- "把这个记下来作为我的分析方法"
- "以后分析类似问题都用这个框架"
- "Save as Skill"（UI 入口）

显式触发时，Kevin 立即生成 Skill 草案，进入 Skill Preview 流程（见 §6）。

### 5.2 信号积累触发（B-S-002 接口）

当后置沉淀行为 B-S-002 的触发条件满足时（来自 `10-ai-proactive-behaviors.md` §3.3），Skill Forge 被激活进行草案生成。

触发条件（由 doc 10 B-S-002 控制，此处只记录依赖）：
- ≥ 5 次相关判断信号
- Kevin 能识别出可描述的方法逻辑
- 此类信号在 ≥ 3 次独立工作场景中出现（不是同一次工作的重复）

### 5.3 不触发的情况

| 情况 | 原因 |
|---|---|
| 信号数量 < 5 次 | 样本不足，可能是偶然行为 |
| Kevin 无法识别方法结构（只有单一偏好） | 形成 Tier 1 偏好记录即可，不升级 |
| 信号集中在同一次工作（非跨场景） | 可能是一次性决策，不是稳定方法 |
| 用户上次拒绝了类似草案提议 | 冷却期内（14 天）不再提议 |
| 用户在 Settings 关闭了自动 Skill 提议 | 遵从用户控制权 |

---

## 6. Skill Preview（重新定义）

**核心原则**：Kevin 可以建议保存，但不能静默保存。用户必须在确认前看到清晰的"Kevin 观察到了什么"，而不只是一段生成的提示词。

### 6.1 Preview 必须展示的内容

```
── Skill 草案预览 ──────────────────────────────
名称：[Kevin 建议命名]（可编辑）
适用于：[触发场景描述]

Kevin 观察到的判断方式：
  1. [步骤 1 描述]
     来源：[具体观察，如"2026-04-10 你把'用户影响范围'移到了分析第一步"]
  2. [步骤 2 描述]
     来源：[具体观察]
  3. [步骤 3 描述]
     来源：[具体观察]

基于 [N] 次工作中的 [M] 个判断信号（[查看全部信号]）
置信度：[高 / 中]

这个描述准确吗？[编辑] [确认保存] [这次描述不对] [不需要保存]
────────────────────────────────────────────────
```

### 6.2 用户操作路径

| 用户选择 | 系统行为 |
|---|---|
| 确认保存 | 写入正式 Skill；从 `.kevin/skill-drafts/` 移至正式 Skill 存储 |
| 编辑后保存 | 用户可修改名称、步骤描述、适用场景；保存用户修改版本 |
| 这次描述不对 | 弹出追问："是步骤描述不准确，还是这个方法本身不是你的习惯？"；根据反馈修正或清除信号 |
| 不需要保存 | 草案丢弃；同类信号冷却期 14 天 |

### 6.3 "这次描述不对"的处理

这是最重要的反馈路径——用户说"不对"时，Kevin 需要区分两种情况：

- **步骤描述不准确**：Kevin 的语言没有对齐用户的思维——修正描述，信号保留
- **这个方法不是我的习惯**：信号本身是误读——清除相关信号，14 天内不再提议

如果用户说"不需要保存"但没有说原因——不追问，静默丢弃；若下次同类触发，Kevin 会重新提议（没有用户明确说"不是我的习惯"，信号不清除）。

---

## 7. Skill 应用（消费接口）

Skill 的价值在于被应用——被应用时，下一次前置辅助的质量就提高了一个台阶。

### 7.1 应用触发时机

| 时机 | 应用方式 |
|---|---|
| 用户新建同类 Artifact | Kevin 按框架步骤组织内容生成结构 |
| 材料关联提示（B-P-001） | 按框架关注点识别"什么材料值得提示" |
| diff 建议生成 | 按框架偏好调整建议内容方向 |
| 数据分析呈现 | 按框架顺序组织数据呈现（先呈现框架步骤 1 关注的维度） |

### 7.2 应用时的透明标注

每次 Skill 影响了内容生成，必须可见：

```
Kevin 在准备这份内容时，应用了你的"[Skill 名称]"方法框架。
（按你之前的分析习惯：先看 X，再评估 Y）
[查看方法详情] [这次不用这个框架]
```

用户点击"这次不用这个框架"：仅本次跳过，不影响 Skill；若连续 3 次跳过，触发 B-S-001 偏好确认提示："你近期多次跳过了这个框架，是否要调整或停用它？"

### 7.3 应用效果闭环

Skill 应用后，用户的反应再次成为信号：

- 用户接受了按框架生成的内容 → 框架信心度 +1
- 用户修改了按框架生成的内容 → 记录修改方向，可能更新框架
- 用户跳过了框架 → 框架相关信号 -1（具体场景下的弱化）

---

## 8. Skill 作用域

沿用三级作用域，但更新默认策略：

| 作用域 | 含义 | 默认行为 |
|---|---|---|
| `space` | 当前 Workspace / 项目特有 | 新生成的 Skill 默认为此级别 |
| `user` | 用户跨 Workspace 均适用 | 需用户显式提升；当同一框架在 ≥ 3 个不同 Workspace 中被确认时，提议提升 |
| `global` | 企业 / 平台下发 | 管理员操作，不进 MVP 主路径 |

**注意**：判断框架可能包含用户的核心竞争方法，Skill 的可见性默认私有。提升到团队共享层时，需要用户**显式确认"这个框架可以被团队看到"**。

---

## 9. File-backed Skill Draft（MVP 降级方案）

在 doc 07 技术对齐评估完成（见 §12）之前，Skill 草案采用 file-backed 降级方案：

**存储位置**：`.kevin/skill-drafts/[skill-name].md`

**格式**（与 directory_cognition 同类，参见 `02-object-model-and-artifact.md` §2.2.1）：

```markdown
---
schema: kevin-skill-draft/v1
status: draft
created_at: 2026-05-10T11:00:00+08:00
signal_count: 6
confidence: medium
---

# Skill 草案：[名称]

## 适用于
[触发场景描述]

## Kevin 观察到的判断方式
1. [步骤 1]（来源：...）
2. [步骤 2]（来源：...）
3. [步骤 3]（来源：...）

## 信号依据
- 2026-05-08：[具体观察]
- 2026-05-06：[具体观察]
- ...

## 备注
[用户编辑区域，可自由补充]
```

**优势**：
- 不依赖 Skill Forge Runtime 完整实现
- 用户可在任何编辑器里审查草案
- 可 git 版本控制
- 作为向正式 Skill 升级的过渡态

**升级路径**：用户确认草案（在 Kevin UI 内或直接编辑文件）后，Kevin 将草案提升为正式 Skill（写入 Skill 存储，从 `.kevin/skill-drafts/` 删除）。

---

## 10. Output Style Registry（基本保留）

预置 HTML PPT 模板进入 Output Style Registry，这部分设计不变，但与 Skill 的关联方式更新：

- **旧关系**：Team Template Adaptation Skill 直接包含模板配置
- **新关系**：判断框架 Skill 可选关联一个 `preferred_output_style`，引用 Registry 中的模板 ID

Registry 管理内容不变，参见原 §11 的字段定义。

MVP 预置模板建议（保留原方案）：

1. **Executive Brief**：面向管理层，强结论、少过程
2. **Product Review Deck**：面向 PRD / 功能评审
3. **Ops Review Deck**：面向周报、月报、运营复盘
4. **Strategy Memo Deck**：面向战略分析、竞品分析
5. **Project Retrospective Deck**：面向项目复盘

---

## 11. 与其他文档的关系

| 文档 | 关系 |
|---|---|
| `10-ai-proactive-behaviors.md` §3 | **上游**：后置沉淀行为目录定义信号采集，B-S-002 触发 Skill 草案生成 |
| `10-ai-proactive-behaviors.md` §5 | **下游消费**：Tier 2 Skill 作为前置辅助的输入，影响内容生成和材料关联识别 |
| `02-object-model-and-artifact.md` §2.2.1 | **存储机制**：file-backed 草案使用 file_backed_material 子类型规范 |
| `05-ux-ia-alignment.md` §4.1.1 | **间接消费**：Suggested Next Step 在 P2 优先级时消费 Skill 作为工作建议依据 |
| `08-connector-capability-governed-action.md` | **Audit 接口**：Skill 的创建和应用事件需写入 AuditEntry |

---

## 12. KyberKit 技术对齐评估（更新重点）

> **执行时机**：设计阶段，不阻塞 PRD 完稿。

Skill Forge 2.0（判断框架引擎版本）进入技术设计时，需完成对齐评估。相比原版，评估重点发生了变化：

### 12.1 更新后的核心评估问题

| # | 问题 | 优先级 |
|---|---|---|
| 1 | 当前 Skill schema 能否容纳 `framework_steps`（有序步骤 + 来源标注）字段？ | P0 |
| 2 | 当前 Runtime 是否有 diff accept/reject/modify 事件？modify（修改后接受）是否有前后值 diff？ | P0 |
| 3 | 当前 SkillLearningLoop.ts 能否以"判断信号聚合"为输入？还是只能以"会话模式"为输入？ | P0 |
| 4 | 当前是否支持 `.kevin/skill-drafts/` 的 file-backed 草案存储和读取？ | P0（降级路径） |
| 5 | Skill 加载和复用时，是否能在 Artifact 生成 prompt 中注入结构化框架（而非只有自然语言偏好）？ | P1 |
| 6 | 当前 Space / User / Global 三级作用域中，Space 级 Skill 是否已在 Runtime 生效？ | P1 |
| 7 | 当前审计事件是否能记录"Skill 被应用"和"应用被用户接受/跳过"的事件？ | P2 |

### 12.2 MVP 范围保守预设（更新版）

| 能力 | 预设状态 | 解除条件 |
|---|---|---|
| 显式触发 Save as Skill（进入 Preview 流程） | ✅ 进 MVP | Skill schema 扩展后可做 |
| Skill Preview（展示框架步骤 + 来源溯源） | ✅ 进 MVP | 需要 Skill Draft 存储 |
| File-backed Skill Draft（`.kevin/skill-drafts/`） | ✅ 进 MVP（降级路径） | 基本文件 IO，无强依赖 |
| Space Skill 复用（应用时透明标注） | ✅ 进 MVP | 依赖现有 Space Skill 加载机制 |
| diff 信号提取 Preference Record（Tier 1） | ✅ 进 MVP | 需要 diff modify 事件（前后值） |
| 信号积累自动提议判断框架（B-S-002，Tier 2） | ⚠️ 待评估 | 取决于 SkillLearningLoop 信号输入能力 |
| Skill 应用时的 prompt 注入（结构化） | ⚠️ 待评估 | 取决于 Runtime prompt 注入机制 |
| 信号来源溯源（source_signals 字段展示） | ⚠️ 待评估 | 需要信号存储与查询 |
| 自动复用模式触发（Tier 2 自动识别） | ❌ Phase 2 | 需要跨 Workspace 信号聚合 |
| User / Global Skill 升级 | ❌ Phase 2 | 需要跨 Workspace 触发 |
| Skill 应用效果反馈闭环 | ❌ Phase 2 | 需要完整信号链路 |
| 企业 Skill Store | ❌ Phase 2 | 不进 MVP |

---

## 13. MVP 范围（确认）

MVP 做四件事：

### 13.1 Skill 草案生成与 Preview

- 显式触发（用户主动）或 B-S-002 触发（信号积累）后，生成可审查的 Skill 草案
- Skill Preview 必须展示框架步骤 + 每步的信号来源
- 用户可编辑名称、步骤描述、适用场景

### 13.2 File-backed Skill Draft 存储

- 草案写入 `.kevin/skill-drafts/[name].md`（file-backed，用户可直接编辑查看）
- 用户确认后升级为正式 Skill；拒绝后从 skill-drafts/ 删除

### 13.3 Preference Record（Tier 1）应用

- diff 信号积累满 3 次形成 Preference Record
- 应用时 Kevin 透明标注"（按你在这个项目里的习惯）"
- 用户可在 Inspector / Settings 查看和重置当前所有偏好

### 13.4 正式 Skill 复用

- 已确认的 Skill 在类似场景中被推荐（Artifact 编辑入口）
- 支持 Slash 调用（`/use [skill-name]`）
- 应用时透明标注，支持"这次不用"

MVP 不做：
- 自动复用模式触发（信号积累路径的完整自动化）
- User / Global Skill 升级
- 团队共享 Skill
- Skill 效果闭环（应用结果反馈回信号）
- 复杂流程编排
- 企业 Skill Store

---

## 14. 验收标准

### 14.1 PRD 阶段（当前）

- 判断框架引擎的产品定义已明确（两层架构、Schema、信号来源）
- 与 doc 10 后置沉淀行为目录（B-S-002）的接口已定义
- KyberKit 对齐评估问题清单（§12.1）已更新，待设计阶段执行
- MVP 保守预设已确认（§12.2）

### 14.2 设计阶段

- KyberKit 对齐评估完成，能力矩阵与差距清单输出
- File-backed Skill Draft 的存储与同步规范确定
- diff modify 事件（前后值）的接口格式确定
- MVP 边界由保守预设更新为确认值

### 14.3 MVP 验收

- [ ] 用户可通过 UI 触发 Save as Skill，进入 Skill Preview 流程
- [ ] Skill Preview 展示框架步骤 + 每步的信号来源（不只是一段提示词）
- [ ] 草案写入 `.kevin/skill-drafts/`，用户可在 Kevin 外部查看
- [ ] 用户确认后 Skill 保存为 Space Skill，从 skill-drafts/ 删除
- [ ] Skill 可在类似 Artifact 编辑场景中被推荐或 Slash 调用
- [ ] 应用时 Kevin 透明标注"按你的 [Skill 名] 框架"
- [ ] diff 信号满 3 次后形成 Preference Record，在 Inspector 可查看
- [ ] 用户可重置单个偏好或所有偏好

## 15. 核心风险（保留原则）

最大风险是 Skill Forge 太"魔法"——用户不知道 Kevin 学了什么，也不信任 Kevin 学到的东西。

因此必须坚持两条铁律：

```text
Kevin 可以建议沉淀，但不能静默沉淀。
Kevin 可以学习判断框架，但必须向用户展示"我观察到的是什么"。
```

Skill Preview 的"观察来源"字段是这两条铁律的具体落实——没有来源溯源的 Skill Preview，视为不合格。
