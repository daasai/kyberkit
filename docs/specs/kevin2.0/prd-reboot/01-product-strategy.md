# Kevin 2.0 产品战略与价值主张

> 状态：Draft  
> 父文档：`../kevin2-prd-reboot-draft.md`  
> 关联基线：`../kevin2-ia-ux-v2.md`

## 1. 第一性原理

企业采用 AI 产品时，真正购买的不是“更聪明的回答”，而是“能否把 AI 放进真实工作而不失控”。

Kevin 2.0 的产品本质是：

```text
Enterprise AI Semantic Control Plane
企业 AI 语义工作控制层
```

它不替代模型，不替代文档平台，也不替代自动化平台。它把模型、材料、制品、系统动作和审计关系组织到一个企业可理解、可治理的工作层中。

## 2. 核心命题

Kevin 2.0 要让企业用户完成从“问 AI”到“让 AI 参与工作”的转换。

这个转换需要五项能力同时成立：

1. **真实上下文连接**：Kevin 能接触本地 Library、企业系统、外部数据、用户材料。
2. **工作对象化**：Kevin 不是只返回消息，而是生成可持续管理的 Artifact、Action 和 Audit。
3. **可控执行**：所有外部写入、发布、执行都必须经过风险标识、预览与 Sign-off。
4. **可追责链路**：用户能知道 AI 用了什么材料、生成了什么、谁批准了什么、最终写到了哪里。
5. **能力复利**：重复工作模式可以通过 Skill Forge 被沉淀为可复用能力。

智能能力是这五项的底层支撑。没有足够智能，连接、对象化和治理会变成空壳；没有治理，智能越强风险越大。

## 3. 相对竞品的定位

### 3.1 相对通用 AI Chat

通用 AI Chat 的核心对象是 conversation。Kevin 的核心对象是 workspace / material / artifact / action。

Kevin 不以“回答是否更聪明”作为主要差异，而以“回答是否能进入工作对象、被审查、被执行、被追责”形成差异。

### 3.2 相对 Agent IDE

Agent IDE 围绕代码仓库、终端和 diff 建立闭环。Kevin 将类似的“对象 + 审查 + 执行”范式扩展到企业知识工作。

Kevin 的对象不是 repo，而是 Semantic Workspace；核心制品不是 code diff，而是 PRD、运营复盘、策略报告、行动计划等业务 Artifact。

### 3.3 相对协作文档平台

飞书、Confluence、Notion 是协作与传播平面。Kevin 不正面竞争通用编辑器。

Kevin 的定位是控制平面：

- 在 Kevin 内完成材料引用、AI 生成、审查、签批、审计。
- 在外部平台完成组织协作、评论、传播、知识库沉淀。

### 3.4 相对自动化/编排平台

Dify、Coze、n8n、Zapier 更像“先搭流程，再执行业务”。Kevin 的方向是“先完成工作，再把稳定模式沉淀为 Skill”。

这使 Kevin 更适合非技术知识工作者：用户不必先理解节点、触发器、流程图，而是在日常工作中逐步形成可复用能力。

## 4. 目标客户

MVP 优先服务“高上下文、高重复、高责任”的知识工作者：

- 产品经理、创业者、业务负责人
- 运营与数据分析人员
- 企业内 AI power users
- 需要处理跨文档、跨数据、跨系统工作的团队成员

MVP 不优先服务：

- 只需要轻问答、轻总结、轻写作的普通用户
- 以多人文档协作为核心诉求的团队
- 以低代码自动化搭建为核心诉求的技术运营用户

## 5. 产品叙事

推荐外部表达：

```text
Kevin is an AI semantic workspace for enterprise knowledge workers,
turning local files, business systems, and AI-generated artifacts
into governed, reusable work processes.
```

中文表达：

```text
Kevin 是面向企业知识工作者的 AI 语义工作空间，
把本地材料、企业系统和 AI 制品组织成可审查、可复用、可执行的工作流程。
```

更短的产品定位：

```text
不是更会聊天的工具，而是企业 AI 工作的语义控制层。
```

## 6. 设计判断

Kevin 2.0 的核心产品风险不是“功能不够多”，而是“用户仍把它理解为带文件侧栏的 AI Chat”。

因此所有 MVP 设计必须服务于一个目标：用户进入 Kevin 时，应先看到工作状态、材料、制品、动作和审计，而不是空聊天框。

UX/IA 以 `../kevin2-ia-ux-v2.md` 为基线，不在本 PRD 中重新设计。
