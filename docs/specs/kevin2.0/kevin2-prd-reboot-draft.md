# Kevin 2.0 PRD（Reboot Draft）

> 状态：Draft v0.3  
> 更新时间：2026-05-09  
> 文档目标：作为 Kevin 2.0 产品重启版 PRD 的总览与导航  
> UX/IA 基线：`kevin2-ia-ux-v2.md`

## 1. 文档结构

为避免主文档过长，本 PRD 按章节拆分为子文档。主文档只保留产品共识、决策摘要和阅读路径。

| 子文档 | 内容 |
|---|---|
| `prd-reboot/01-product-strategy.md` | 产品本质、竞品定位、目标客户、价值主张 |
| `prd-reboot/02-object-model-and-artifact.md` | 对象模型、Native Artifact、双态 Artifact 策略 |
| `prd-reboot/03-external-projection.md` | 文档级单向投影、ActionRequest、回链、失败处理 |
| `prd-reboot/04-evidence-chain.md` | 材料引用证据链、Evidence Badge、Chat Sources、智能指标支撑 |
| `prd-reboot/05-ux-ia-alignment.md` | 与 `kevin2-ia-ux-v2.md` 的对齐方式，不重新设计 UX/IA |
| `prd-reboot/06-mvp-scope-and-metrics.md` | MVP 范围、样板场景、产品/行为/智能/技术指标 |
| `prd-reboot/07-skill-forge-productization.md` | Skill Forge 2.0、工作模式蒸馏、Team Template Adaptation、KyberKit 对齐评估 |
| `prd-reboot/08-connector-capability-governed-action.md` | Connector / Capability / Governed Action 体系、Adapter-first、Progressive Integration |
| `prd-reboot/09-data-warehouse-connector.md` | 数仓 MCP 作为真实 Connector 实例、Metric Dictionary、Query Result Materialization |

## 2. 当前核心共识

Kevin 2.0 的产品本质是：

```text
Enterprise AI Semantic Control Plane
企业 AI 语义工作控制层
```

Kevin 2.0 不以“更会聊天”作为核心差异，而是把连接、生成、审查、执行、沉淀统一到同一套语义对象与治理闭环中。

## 3. 五项差异化优势

Kevin 2.0 的差异化来自五项能力的组合，而不是任一单点能力：

1. 真实上下文连接：Connector / Capability 接入本地与企业系统。
2. 工作对象化：Material / SemanticArtifact / ActionRequest 成为一等对象。
3. 可控执行：Policy / Sign-off / Action Preview 降低企业执行风险。
4. 可追责链路：Audit / Evidence / External Link 保留责任链。
5. 能力复利：Skill Forge 从真实工作中沉淀可复用能力。

智能能力是上述五项能力的底层支撑，必须通过指标持续评估。

## 4. UX/IA 原则

UX/IA 不在本 PRD 中重新设计。  
Kevin 2.0 的 UX/IA 以 `kevin2-ia-ux-v2.md` 为基线。

本 PRD 只增加产品层约束：

- UX/IA 是五项优势的前端表达层，不是视觉包装。
- Workspace 必须默认呈现工作状态，而不是空聊天输入。
- Artifact Focus、Contextual Chat、Inspector、Action Panel 沿用既有设计方向。
- 新增能力必须映射到现有 IA，不新增冲突的主导航模型。

详细对齐见 `prd-reboot/05-ux-ia-alignment.md`。

## 5. Artifact 策略

Kevin 2.0 不重造通用文档编辑器，也不把 Artifact 完全外包给飞书、Notion、Confluence。

采用双态策略：

```text
Kevin Native Artifact（源对象）
        +
External Projection（外部协作文档投影）
```

Kevin 内负责语义对象、材料引用、Review/Diff、ActionRequest、Sign-off、Audit 和 Skill Forge 学习信号。

外部平台负责团队协作、评论、分享、知识库传播。

详细设计见：

- `prd-reboot/02-object-model-and-artifact.md`
- `prd-reboot/03-external-projection.md`

## 6. External Projection v1 决策

MVP 只做“文档级单向投影”：

- 不做 block 颗粒度同步。
- 不做外部评论/修改自动回流。
- 不做自动 merge。
- 默认新建外部文档。
- 覆盖已有外部文档必须显式确认。
- 写入后保留外部链接、写入时间、目标平台与审计记录。

详细设计见 `prd-reboot/03-external-projection.md`。

## 7. 材料引用证据链 MVP 决策

MVP 只做最小三件事：

1. `Inspector > Materials`：展示当前 Artifact 使用过的材料清单、来源与状态。
2. `Evidence Badge`：仅在关键 block 上显示轻量证据标记。
3. `Chat Sources`：Contextual Chat 回答底部展示折叠的 Sources / Assumptions / Missing context。

MVP 不做逐句 citation、复杂证据面板、百分比置信度、block 级外部同步或自动外部文档回流。

详细设计见 `prd-reboot/04-evidence-chain.md`。

## 8. MVP 验证场景

MVP 保留两个样板场景：

### 8.1 Product Design Workspace

验证：

- PRD Artifact
- 材料引用
- Review/Diff
- External Projection

### 8.2 Data Analysis Workspace

验证：

- Data Warehouse Connector
- Metric Dictionary / 指标口径层
- Query Result Materialization
- Weekly Ops Review
- Evidence Badge
- Action Plan
- ActionRequest / Sign-off / Audit

详细范围与指标见 `prd-reboot/06-mvp-scope-and-metrics.md`。
Connector / Capability / Governed Action 体系见 `prd-reboot/08-connector-capability-governed-action.md`。
数仓 Connector 实例设计见 `prd-reboot/09-data-warehouse-connector.md`。

## 9. Skill Forge 2.0 决策

Skill Forge 2.0 定位为 Kevin 的智能复利引擎，不是 prompt 收藏夹，也不是 workflow builder。

MVP 先做：

- Save as Skill
- Skill Preview
- Reuse Skill
- Team Template Adaptation
- 预置 3-5 套规范 HTML PPT 模板

进入技术设计时，必须重点考察 KyberKit 当前版本与 Skill Forge 2.0 的对齐，包括 Skill 规范、Runtime 轨迹、Forge 输入信号、Sidecar/API、审计事件与模板注册能力。

详细设计见 `prd-reboot/07-skill-forge-productization.md`。

## 10. 当前待讨论问题

1. External Projection 首批目标平台优先级（飞书 / Notion / Confluence）。
2. PRD / Weekly Ops Review 的具体 schema 是否需要进一步收敛。
3. 智能指标的人工评测集如何设计。
4. HTML PPT 模板的首批视觉风格与内容结构。
5. Data Warehouse MCP 当前能力与 Kevin Connector / Capability 契约的差距清单。

## 11. 后续版本计划

- v0.4：补充 PRD / Weekly Ops Review Artifact Type 详细 schema。
- v0.5：补充 API / Sidecar / Runtime 工程映射。
- v0.6：补充 HTML PPT 模板规格与 Output Style Registry。
- v0.7：补充 Connector Adapter 与 Data Warehouse MCP 对齐评估。
- v1.0：整理为可进入研发评审的正式 PRD。
