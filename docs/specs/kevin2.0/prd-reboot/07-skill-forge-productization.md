# Skill Forge 2.0 产品化设计

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 相关文档：`../../kevin1.5/skill-architecture.md`、`../../kevin1.5/kevin-v1.5-prd-rev2.md`

## 1. 产品本质

Skill Forge 2.0 是 Kevin 的智能复利引擎。

它不是 prompt 收藏夹，也不是 workflow builder。它的核心能力是：

```text
Work Pattern Distillation Engine
工作模式蒸馏引擎
```

Kevin 通过观察用户如何在 Workspace 中完成真实工作，把稳定的工作模式沉淀成可审查、可复用、可治理的 Skill。

2.0 中，Skill Forge 蒸馏的不是一句提示词，而是一整套工作方式：

- 用户通常用什么材料开始
- 生成什么 Artifact 类型
- 偏好什么结构、语气与模板
- 经常如何修改、接受或拒绝 block
- 哪些证据标准才算可信
- 哪些动作需要签批
- 最终如何导出或投影到外部平台

## 2. 相对 Kevin 1.5 的升级

Kevin 1.5 的 Skill Forge 主要从相似会话中蒸馏 Skill。

Kevin 2.0 应升级为从完整工作闭环中蒸馏 Skill：

```text
Materials used
+ Artifact type / schema
+ Chat instructions
+ Review/Diff decisions
+ Evidence state
+ ActionRequest decisions
+ External Projection target
+ Audit outcome
-> Skill Draft
```

这意味着 Skill 不再只是“会写一篇 PRD 的提示词”，而是“按某个团队习惯生成、审查、证据校验、投影和归档 PRD 的工作能力”。

## 3. 候选 Skill 类型

### 3.1 高频 Skill

高频 Skill 通常是小而稳定的工作片段：

- 材料到结构化草稿
- 局部改写与补全
- 团队模板适配
- 审查检查
- 外部投影前整理

典型例子：

- `prd-draft-from-materials`
- `weekly-ops-review`
- `evidence-grounded-rewrite`
- `team-template-adaptation`
- `project-artifact-to-doc`

### 3.2 高价值 Skill

高价值 Skill 不一定最高频，但能显著降低专家判断成本、减少返工、提高治理可信度。

优先级建议：

1. `prd-review-checklist`
2. `weekly-ops-review`
3. `evidence-grounded-rewrite`
4. `project-artifact-to-doc`
5. `team-template-adaptation`

## 4. Team Template Adaptation Skill

Team Template Adaptation 是 Kevin 2.0 中非常实用的 Skill 类型。

它不只是“套模板”，而是沉淀一个团队如何把工作变成可交付制品。

### 4.1 沉淀内容

结构偏好：

- PRD 必须有哪些章节
- 周报必须先讲结论还是先讲数据
- 汇报是否必须包含风险与 next steps

表达偏好：

- 标题风格
- 语气
- 面向老板、同事、客户的不同表达方式
- 术语习惯
- 长短与颗粒度

呈现偏好：

- HTML PPT 模板
- 色彩、版式、图表样式
- 封面、目录、总结页
- 指标卡片、洞察卡片、时间线、决策页

### 4.2 预置模板包建议

MVP 可预置 3-5 套规范且漂亮的 HTML PPT 模板：

1. **Executive Brief**
   - 面向管理层
   - 强结论、少过程、突出决策与风险

2. **Product Review Deck**
   - 面向 PRD / 功能评审
   - 问题、目标、方案、范围、风险、里程碑、验收标准

3. **Ops Review Deck**
   - 面向周报、月报、运营复盘
   - 指标卡、趋势、异常、洞察、行动计划

4. **Strategy Memo Deck**
   - 面向战略分析、竞品分析
   - 背景、判断、选项、推荐方案、风险

5. **Project Retrospective Deck**
   - 面向项目复盘
   - 目标、结果、偏差、原因、经验、下一步

### 4.3 产品入口

建议在 Artifact 的 Actions 中提供：

```text
Export / Project
- Markdown
- External Doc
- HTML PPT
  - Executive Brief
  - Product Review
  - Ops Review
  - Strategy Memo
```

用户选择 HTML PPT 后进入预览：

```text
Source: PRD Artifact
Template: Product Review Deck
Style: Clean Enterprise
Pages: 12
[Preview] [Customize] [Export HTML] [Write to Library]
```

MVP 不做复杂可视化编辑器，只支持主题色、标题、页眉页脚、logo 等轻配置。

## 5. 触发机制

### 5.1 显式触发

用户主动表达：

- “以后都这样做”
- “把这个流程记下来”
- “保存成 Skill”
- “下次生成 PRD 按这个标准”

或点击：

- `Save as Skill`
- `Create reusable workflow`

### 5.2 复用模式触发

系统观察到：

- 同类 Artifact 生成达到阈值
- 同类 Review/Diff 修改模式重复出现
- 同类材料组合重复出现
- 同类 External Projection 目标重复出现
- 同类 ActionRequest 流程重复出现

### 5.3 质量信号触发

系统观察到某次工作闭环质量较高：

- Artifact 大部分被用户接受
- Diff 接受率高
- Evidence 状态较好
- External Projection 完成
- Sign-off 顺利通过
- 返工少

这类链路适合提示用户沉淀。

## 6. UI 呈现位置

Skill Forge 不应藏在设置页。它应出现在工作完成后的自然时刻。

### 6.1 Artifact 完成后

位置：Artifact Focus 的 Inspector 或完成态提示。

示例：

```text
Kevin noticed this PRD workflow is reusable.
Save as a Skill?
[Preview Skill] [Save] [Not now]
```

### 6.2 Review/Diff 之后

当用户多次接受或拒绝相似修改后：

```text
You often rewrite "Risks" into decision-ready bullets.
Teach Kevin this preference?
[Add to Skill] [Ignore]
```

### 6.3 Action/Audit 完成后

当一个完整闭环完成后：

```text
This workflow completed:
Materials -> PRD -> Review -> Feishu Projection.
Save as reusable workflow?
[Preview Skill] [Save] [Not now]
```

## 7. Skill Preview

系统不能只提示“保存成功”。用户必须看到可审查的 Skill Preview。

Skill Preview 必须展示：

- name
- when to use
- input materials
- output artifact type
- default structure
- preferences
- evidence rules
- allowed actions
- risk policy
- projection target
- scope

示例：

```text
Skill: product-prd-from-research

When to use:
- 当你基于访谈、竞品分析和需求记录生成 PRD 时

Inputs:
- interview notes
- competitor analysis
- feature brief

Output:
- PRD Artifact

Preferences:
- Scope 用表格呈现
- Risks 必须包含 mitigation
- Acceptance Criteria 必须可测试

Evidence rules:
- Problem / Users 需要材料支撑
- Risks 可标记 inferred，但需要 reviewed

Allowed actions:
- create_external_projection: Feishu
- write_to_library

Risk:
- External projection requires sign-off

Scope:
- Space Skill
```

## 8. Skill 作用域

沿用 Kevin 1.5 的三级作用域：

- `space`：当前 Workspace/项目特有
- `user`：用户跨 Workspace 偏好
- `global`：企业/IT/平台下发

2.0 默认策略：

- 新蒸馏的工作流默认是 Space Skill。
- 当同一模式跨 Workspace 多次出现，提示提升为 User Skill。
- 企业管理员可整理为 Global Skill（不进入 MVP 主路径）。

## 9. MVP 范围

MVP 做三件：

1. **Save as Skill**
   - 用户显式或半自动触发
   - 生成 Skill 草案

2. **Skill Preview**
   - 用户可审查、修改、确认
   - 不允许静默落盘

3. **Reuse Skill**
   - 下一次在类似 Workspace / Artifact 中可推荐
   - 支持 Slash 调用或建议入口

MVP 不做：

- 全自动静默创建
- 复杂流程编排器
- 多 Skill 编排
- 企业 Skill Store
- 网络级共享
- 自动 A/B 测试

## 10. 数据输入与信号

Skill Forge 2.0 的候选输入包括：

- Material 列表与类型
- Artifact Type 与 schema
- 用户 prompt
- Review/Diff accept/reject
- Evidence support level
- External Projection 目标
- ActionRequest 决策
- Audit 结果
- 用户手动编辑后的最终版本

MVP 可先只使用：

- Material 类型
- Artifact Type
- 用户 prompt
- Diff 决策
- 外部投影目标
- 用户显式触发语句

## 11. Output Style & Template Registry

预置 HTML PPT 模板不应只作为导出功能，而应进入 Output Style & Template Registry。

Registry 建议管理：

- output format
- template id
- supported artifact types
- theme tokens
- layout blocks
- export target
- preview renderer

这使 Team Template Adaptation Skill 能引用稳定模板，而不是临时生成 HTML。

## 12. 技术设计重点：KyberKit 对齐评估

> **执行时机**：设计阶段，不阻塞 PRD 完稿。

Skill Forge 2.0 进入技术设计时，必须完成 KyberKit 当前版本的对齐评估，再决定 MVP 边界。

### 12.1 核查问题清单

以下 7 个问题必须在设计阶段逐一确认：

1. 当前 KyberKit Skill schema（`.yaml` 或 JSON）是否有字段容纳 `output_artifact_type`、`template_id`、`projection_target`、`risk_policy`？若无，需要定义扩展字段。
2. 当前 Skill 加载器是否支持 Space / User / Global 三级作用域的 2.0 默认策略（新蒸馏默认 Space，跨 Workspace 出现时提示提升为 User）？
3. 当前 Runtime 是否能记录 Materials、Artifact、Review、Action、Audit 的完整事件轨迹？若只记录会话消息，需要新增 Workspace/Artifact 级事件 emit 接口。
4. 当前 `SkillForge.ts` 的蒸馏输入来源是什么？只有 session 消息流，还是已包含 Artifact/Material 引用？是否需要扩展为 Workspace 级蒸馏。
5. 当前 `SkillLearningLoop.ts` 是否有 diff accept/reject 作为训练信号？若无，需要新增 `diff_decision` 事件接入。
6. 当前 Sidecar/DB 是否有 Skill Draft（草案）存储表？Skill Preview 需要草案持久化，不能只在内存中。
7. 当前审计与任务事件格式是否足以作为 Skill Forge 的蒸馏信号输入？需要与 ActionRequest/AuditEntry schema 对齐。

### 12.2 评估输出要求

技术对齐评估完成后，输出内容必须包含：

- 现状能力矩阵（7 项逐一评分）
- 2.0 目标能力矩阵
- 差距清单（按 MVP / Phase 2 分层）
- MVP 可直接复用的现有能力
- 必须新增的 API / storage / event
- 明确延后的项目及理由

### 12.3 MVP 范围的保守预设

在评估完成之前，以下为 Skill Forge 2.0 MVP 的保守边界：

| 能力 | 预设状态 | 解除条件 |
|---|---|---|
| 显式触发 Save as Skill | ✅ 进 MVP | 无论现状如何，Skill schema 扩展后可做 |
| Skill Preview 审查 | ✅ 进 MVP | 需要 Skill Draft 存储，待评估确认 |
| Space Skill 复用（Slash 调用） | ✅ 进 MVP | 依赖现有 Space Skill 加载机制 |
| diff 信号蒸馏 | ⚠️ 待评估 | 取决于 SkillLearningLoop 是否有 diff event 输入 |
| Workspace/Artifact 级蒸馏 | ⚠️ 待评估 | 需要 Artifact/Material 事件输入 |
| 自动复用模式触发 | ❌ Phase 2 | 不进 MVP |
| 企业 Skill Store | ❌ Phase 2 | 不进 MVP |

## 13. 验收标准

### 13.1 PRD 阶段（当前）

- Skill Forge 2.0 产品逻辑已完整定义。
- KyberKit 对齐评估问题清单（§12.1）已记录，待设计阶段执行。
- MVP 保守边界（§12.3）已确认，不阻塞其他模块研发。

### 13.2 设计阶段

- 完成 KyberKit 当前版本与 Skill Forge 2.0 的对齐评估。
- 输出能力矩阵与差距清单。
- MVP 边界由保守预设更新为确认值。

### 13.3 MVP 验收

- 用户可以从 Artifact 完成态触发 Save as Skill。
- 系统可以生成可审查 Skill Preview。
- 用户确认后 Skill 可保存为 Space Skill。
- Skill 可在类似场景中被推荐或 Slash 调用。
- Team Template Adaptation 可引用至少一套 HTML PPT 模板。

## 14. 核心风险

最大风险是 Skill Forge 太“魔法”，用户不知道 Kevin 学了什么。

因此必须坚持：

```text
Kevin 可以建议沉淀，但不能静默沉淀。
Kevin 可以学习偏好，但必须让用户知道学到了什么。
```
