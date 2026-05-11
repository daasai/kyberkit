# Kevin 2.0 WorkType Pack Architecture

> 状态：Draft  
> 父文档：`./01-product-strategy.md`（专业工种 / Always-on 数字管家）  
> 关联：`./02-object-model-and-artifact.md` / `./07-skill-forge-productization.md` / `./08-connector-capability-governed-action.md` / `./12-cognitive-capital.md`

---

## 1. 文档目的

Kevin 2.0 服务的不是抽象的“复杂工作”，而是一组专业工种：产品 PM / 创始人、自媒体人、股票投资人、律师、研究员、顾问等。

MVP 首先聚焦产品 / 项目工作场景，但产品架构必须从一开始支持后续扩展到其他工种。本文定义 WorkType Pack：Kevin 如何把某个专业工种产品化为可配置、可评测、可演进的一组能力包。

---

## 2. 核心定义

```text
WorkType Pack = Artifact Types + Connectors + Knowledge Schema + Skill Library + Evaluation Tasks
```

它不是模板包，也不是 prompt 包，而是一套专业工作能力的集成环境。

每个 Pack 回答五个问题：

| 问题 | Pack 中的对应物 |
|---|---|
| 这个工种做什么工作？ | `work_type` 定义和典型认知循环 |
| 输入材料是什么？ | Material 类型、Connector、文件命名信号 |
| 输出制品是什么？ | Artifact Types 和 block schema |
| 如何判断质量？ | Evidence 规则、Review/Diff 规则、评测任务 |
| 如何越用越强？ | 初始 Skill Library + C3/C4 学习规则 |

---

## 3. WorkType Pack 的边界

### 3.1 Pack 解决什么

Pack 解决“专业语义”问题：

- 什么材料重要
- 什么证据可信
- 什么制品结构合格
- 什么下一步建议有价值
- 什么行为信号代表偏好或判断框架
- 什么连接器最常用

### 3.2 Pack 不解决什么

Pack 不应变成硬编码业务流程：

- 不规定用户必须按固定流程工作
- 不替用户做最终判断
- 不把 Kevin 变成垂直 SaaS
- 不把所有工种都塞进 MVP

Kevin 的通用机制保持一致：Workspace、Material、Artifact、Action、Audit、Cognitive Capital。Pack 只提供某个工种的专业默认值和能力组合。

---

## 4. Pack Schema

建议字段：

```typescript
interface WorkTypePack {
  pack_id: string;
  name: string;                    // "Product / Project Work"
  description: string;
  target_roles: string[];           // ["PM", "Founder", "Ops Analyst"]
  maturity: 'mvp' | 'beta' | 'future';

  artifact_types: ArtifactTypeRef[];
  material_profiles: MaterialProfile[];
  recommended_connectors: ConnectorProfile[];
  default_skills: SkillRef[];
  cognitive_assets: CognitiveAssetPolicy[];
  proactive_behaviors: BehaviorPolicy[];
  evaluation_tasks: EvaluationTaskRef[];
}
```

### 4.1 MaterialProfile

描述这个工种常见材料：

```typescript
interface MaterialProfile {
  name: string;                     // "user interview notes"
  source_types: string[];            // local_file, data_warehouse_query, external_doc
  file_signals?: string[];           // ["interview", "research", "metrics"]
  preferred_evidence_usage: string[]; // quoted, summarized, calculated
  parsing_notes?: string;
}
```

### 4.2 ConnectorProfile

描述推荐接入：

```typescript
interface ConnectorProfile {
  connector_type: string;            // "local_files", "data_warehouse", "feishu"
  required_for_mvp: boolean;
  capability_kinds: Array<'read' | 'watch' | 'write' | 'execute'>;
  default_policy: string;
}
```

### 4.3 BehaviorPolicy

描述主动行为如何按工种调参：

```typescript
interface BehaviorPolicy {
  behavior_id: string;               // e.g. B-P-011
  enabled_by_default: boolean;
  trigger_adjustments?: string;
  wording_notes?: string;
}
```

---

## 5. MVP Pack：Product / Project Work

Kevin 2.0 MVP 的第一个 Pack：

```text
pack_id: product_project_work
name: Product / Project Work
target_roles: PM, Founder, Business Owner, Ops/Data Analyst
maturity: mvp
```

### 5.1 典型认知循环

```text
收集材料
→ 识别问题 / 机会 / 风险
→ 形成产品或项目判断
→ 产出 PRD / 周报 / 计划
→ 审查证据与风险
→ 投影到协作平台
→ 跟进动作和结果
→ 沉淀判断偏好与方法
```

### 5.2 Artifact Types

MVP 内：

- PRD
- Weekly Ops Review

Phase 2 可扩展：

- Competitive Analysis
- Product Strategy Memo
- User Research Synthesis
- Roadmap Review
- Launch Plan
- Postmortem

### 5.3 Material Profiles

| Material | 来源 | Evidence 重点 |
|---|---|---|
| 用户访谈 / 调研笔记 | Markdown / 外部文档 | `quoted` / `summarized` |
| Feature brief / 需求草稿 | Markdown | `summarized` / `background` |
| 竞品分析 | Markdown / PDF / 外部文档 | `summarized` |
| 指标数据 | Data Warehouse Query | `calculated` + `metric_id` |
| 周报 / 复盘 | Markdown / 外部文档 | `background` / `summarized` |

### 5.4 Recommended Connectors

| Connector | MVP | 用途 |
|---|---|---|
| Local Files | 必须 | 本地材料、`.kevin/cognition.md`、导出 |
| Data Warehouse | 必须（数据场景） | 周报和指标分析 |
| Feishu / Docs | 必须（投影） | 外部协作传播 |
| Jira / Linear | Phase 2 | 需求/任务状态 |
| Slack / Lark Message | Phase 2 | 讨论材料 |

### 5.5 Default Skills

MVP 不要求预置复杂 C4 判断框架，但可以预置轻量默认工作方法，作为生成与 Review 的起点：

- PRD Evidence Discipline：Problem / Users 必须有材料引用
- Risk Review Discipline：风险必须包含影响范围和缓解动作
- Metrics Grounding Discipline：指标结论必须有 metric_id、value、time_range
- Action Closure Discipline：Action Plan item 必须能追溯到 Insight 或 Anomaly

这些不是用户私有 Skill，而是 Pack 默认规则。用户的 C3/C4 认知资本会在使用中覆盖或增强默认规则。

---

## 6. Future Packs（非 MVP）

### 6.1 Content Creator Pack

目标用户：自媒体作者、内容创作者、独立研究者。

可能包含：

- Artifact Types：选题策略、内容日历、脚本草稿、发布复盘
- Connectors：本地素材、平台数据、评论反馈、发布平台
- Knowledge Schema：读者画像、内容主题、平台表现、系列关系
- Skills：选题判断框架、标题风格、读者反馈分析

关键差异：输出质量由读者反馈和平台表现验证，不是内部审批验证。

### 6.2 Investor Research Pack

目标用户：个人投资者、资产管理者。

可能包含：

- Artifact Types：公司研究备忘录、财报摘要、估值假设、持仓复盘
- Connectors：财报 PDF、行情数据、研究报告、本地笔记
- Knowledge Schema：标的、假设、催化剂、风险、估值参数
- Skills：估值框架、风险纪律、决策日志复用

关键差异：决策日志和假设变更比单次报告更重要。

### 6.3 Legal Work Pack

目标用户：律师、法务、合同审查人员。

可能包含：

- Artifact Types：合同审查、案件材料摘要、法律意见草稿、证据清单
- Connectors：本地案件材料、法规库、合同库、邮件附件
- Knowledge Schema：当事人、条款、风险、证据、法律依据
- Skills：条款风险判断、证据标准、客户沟通风格

关键差异：Evidence 和引用准确性要求极高，MVP 不应贸然进入。

---

## 7. Pack 与认知资本的关系

Pack 提供默认能力，认知资本提供个性化能力。

```text
WorkType Pack 默认规则
  ↓ 被用户使用
用户反馈 / 修改 / 拒绝 / 接受
  ↓
C3 行为偏好 + C4 判断框架
  ↓
同一个 Pack 在这个用户/Workspace 中变成私有版本
```

因此 Kevin 的长期差异不是“有 PM 模板”，而是“PM Pack 在你的真实工作反馈中变成你的 PM 方法”。

---

## 8. Pack 与第一次见面

第一次见面时，Kevin 不要求用户先选择 Pack。默认流程是：

```text
用户指认目录
→ Kevin 扫描目录
→ 推断可能的 work_type / pack
→ 低置信时询问用户确认
→ 绑定 Pack 默认规则
→ 生成 directory_cognition
```

如果置信度低，Kevin 应该说：

```text
我还不确定这是哪类工作。看到的材料更像 [A] 或 [B]。
你希望我先按哪个方向理解这个 Workspace？
```

不允许低置信度时硬套 PM Pack。

---

## 9. Pack 评测

每个 Pack 必须有自己的 UAT 任务集，不能只复用通用智能指标。

MVP Product / Project Work Pack 的评测来自 `06-mvp-scope-and-metrics.md` T1-T7。

### 9.1 EvaluationTask Schema

每个 Pack 的评测任务建议使用统一结构：

```typescript
interface WorkTypeEvaluationTask {
  task_id: string;
  pack_id: string;
  scenario: string;
  input_materials: string[];       // 需要准备的材料类型
  expected_artifact?: string;      // 期望产出的 Artifact Type
  required_evidence: string[];     // 必须验证的证据要求
  success_criteria: string[];      // 人工或系统验收条件
  failure_modes: string[];         // 该 Pack 最危险的失败方式
}
```

### 9.2 Product / Project Work Pack 评测集

MVP 主评测由 `06-mvp-scope-and-metrics.md` T1-T9 承担，其中：

| 任务 | 验证内容 |
|---|---|
| T1-T3 | PRD Artifact、Evidence、Review/Diff、External Projection |
| T4-T6 | Weekly Ops Review、Metric Dictionary、ActionRequest |
| T7 | 端到端工作闭环 |
| T8 | Always-on / First Encounter |
| T9 | My Kevin / 认知资本可见性 |

Product / Project Work Pack 的额外 Pack 级失败模式：

- 把所有材料都处理成 PRD，而忽略周报、复盘、策略 memo 等其他项目制品。
- 生成看似完整但没有证据约束的“咨询式套话”。
- 无法区分“产品判断”与“执行动作”，导致越权建议。
- 对指标数据只做文本总结，不保留 `metric_id/value/time_range`。

### 9.3 跨工种 Sanity Check

即使 MVP 不完整支持其他 Pack，也必须证明核心机制没有 PM 过拟合。

Sanity check 样本：

| 样本 | 最小任务 |
|---|---|
| Content Creator | 指认一个内容素材目录，生成 directory_cognition 和 3 条下一步建议 |
| Investor Research | 指认一个公司研究目录，识别标的、研究阶段、关键假设或风险 |
| Research / Analysis | 指认一个研究笔记目录，识别研究问题、证据状态、假设缺口 |

通过标准：

- 不出现 PM 专属术语污染。
- 低置信度时不硬套 Product / Project Work Pack。
- 至少 1 条发现或建议引用具体文件。
- 产出的建议符合该工种的下一步动作，而不是通用“总结资料”。

未来 Pack 必须补充：

| Pack | 核心评测 |
|---|---|
| Content Creator | 选题建议是否引用真实反馈，内容草稿是否符合已有风格 |
| Investor Research | 财报/假设引用是否准确，决策日志是否能复用 |
| Legal Work | 条款和证据引用是否准确，风险判断是否可追溯 |

---

## 10. 验收标准

MVP 验收时必须证明：

- Workspace 有 `work_type` 字段，并能绑定 `product_project_work` Pack。
- PRD 与 Weekly Ops Review 属于 Product / Project Work Pack 的 Artifact Types。
- Suggested Next Step 和 Evidence 规则能读取 Pack 默认规则。
- 第一次见面不把所有目录都强行识别成 PM 场景。
- 后续新增工种时，不需要改造 Kevin 的核心对象模型，只需要新增 Pack 配置和对应 Artifact / Connector / Skill / Evaluation。

---

## 11. 与其他文档的接口

| 文档 | 接口 |
|---|---|
| `01-product-strategy.md` | “专业工种”定位 |
| `02-object-model-and-artifact.md` | `SemanticWorkspace.work_type`、Artifact Types |
| `05-ux-ia-alignment.md` | Workspace Home 按 Pack 展示不同建议 |
| `06-mvp-scope-and-metrics.md` | Pack 级评测任务 |
| `07-skill-forge-productization.md` | Pack 默认 Skill 与用户私有 Skill 的边界 |
| `10-ai-proactive-behaviors.md` | Pack 调整主动行为触发与措辞 |
| `11-first-encounter-spec.md` | 目录扫描推断 WorkType Pack |
| `12-cognitive-capital.md` | Pack 默认规则如何被 C3/C4 私有化 |

