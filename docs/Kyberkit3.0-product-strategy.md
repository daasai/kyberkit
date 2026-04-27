# KyberKit 3.0 产品战略文档

> **文档类型**: 产品战略与版本规划（正式）  
> **状态**: 持续更新  
> **日期**: 2026-04-27  
> **参与者**: Shawn (Product Owner) + AI Agent 产品协作  
> **关联文档**: 历史 Q&A 决策见 [Kyberkit3.0-memo.md](./Kyberkit3.0-memo.md)

---

## 1. 产品定位（Product Positioning）

### 1.1 核心命题

**唯一能随工作自我进化的企业私人 Agent** —— 个人对话与记忆保持私有；能力（技能）可在用户明确同意下晋升、Fork 并在团队/组织层沉淀为可复用的数字资产。

### 1.2 个人价值 vs 企业价值：Federation 模型

企业与个人诉求看似矛盾（隐私 vs 共建），通过 **分层所有权（Federation）** 可以同时满足：

```
┌─────────────────────────────────────────────────────────┐
│ 个人 Agent（身份层 — 始终私有，不可被组织读取）           │
│  • KK.md（人设 / 价值观）                               │
│  • MEMORY.md（个人工作记忆）                             │
│  • 对话历史 / Trajectory                                │
├─────────────────────────────────────────────────────────┤
│ 技能层（能力层 — 可主动「晋升」，Copy-on-Write）          │
│  • private Skills → 用户 promote → team / org Skills    │
│  • ← fork ← Org Skill Library                           │
├─────────────────────────────────────────────────────────┤
│ 组织上下文层（只读注入，不上传个人原始对话）               │
│  • 企业知识库（Obsidian / 飞书等外部编辑，注入上下文）      │
│  • Org Skill Library（团队共建、排序 / 推荐）             │
└─────────────────────────────────────────────────────────┘
```

**原则**：

| 维度 | 所有权 | 说明 |
|:---|:---|:---|
| **Agent Identity** | 个人独占 | 人设、记忆、会话轨迹不离开用户边界（除非用户显式导出） |
| **Agent Capability** | 可共享 | 技能以 Fork / Promote 方式复制到团队库，源码级可追溯 |
| **Org Context** | 组织可读 | 知识库 MD、团队技能元数据用于注入上下文，非个性化隐私 |

### 1.3 与 Memo Q1 的对齐

Memo 中「企业内部协作智能体集群平台的单用户深度版本」与本节的 Federation 叙事一致：**3.0 先把个人 Agent 做深**，同时预埋多用户与技能流通接口；**3.5** 引入小团队技能协作桥梁；**4.0** 完成企业级集群与治理。

---

## 2. 目标客户与价值主张（ICP & Value Proposition）

### 2.1 核心目标客户（3.0）

- **企业内「效率先锋」**：运营、数据分析、产品经理、职能专家等 —— **非纯开发者**，但有自动化与文档工作流诉求。
- **次要受众**：开发者（CLI/TUI）、内部效率负责人（评估 PoC）。

### 2.2 各版本 ICP 演进

| 版本 | ICP | 核心价值 |
|:---|:---|:---|
| **3.0** | 单人深度用户（含企业内先锋） | 私有、可进化的专属 Agent；可靠输出；Workspace 异步任务 |
| **3.5** | 2–10 人高效能小组 | Team Skill Hub；技能 CoW 分享；最小化多用户 PoC |
| **4.0** | IT / 安全 / 业务部门 + 规模化员工 | 多租户、RBAC、技能市场、协作知识库、Org Admin |

### 2.3 价值主张三层次

1. **个人效率**：更少重复劳动，记忆与技能随使用变强。  
2. **团队协同**：同一方法论以技能副本形式流转，独立演化不互相覆盖。  
3. **组织资产**：可审计的技能库与知识注入，沉淀为可复用的数字资产。

---

## 3. 竞争分析（Competitive Landscape）

### 3.1 竞品矩阵（摘要）

| 竞品 | 定位 / 强项 | 相对 KyberKit 的弱点或差异 |
|:---|:---|:---|
| **Claude Cowork**（Anthropic，面向知识工作，桌面 App，插件与 Google/Office 等） | 品牌、分发、企业套餐；非技术用户友好 | 能力偏**静态插件**；**无**用户间技能自生成与共享叙事；**无**中国企业 IM 网关（企业微信 / 飞书）；订阅绑定 Anthropic |
| **Claude Code** | 开发者 CLI、Memory + 工具成熟 | 开发者场景；无企业微信 / 飞书；无 LearningLoop 式自进化与团队技能沉淀 |
| **Cursor Background Agent** | IDE 内异步执行、体验好 | 绑定代码与 IDE；跨域持久记忆与组织技能库非主线 |
| **OpenClaw**（开源，本地优先，多渠道 IM，ClawdHub） | 开源生态、多模型、个人持久上下文 | 技能多依赖**手动安装**；**无**自生成 / LearningLoop；**无**中国企业协作网关；shell 级能力带来安全运营负担 |
| **Glean / Moveworks** | 企业搜索 / IT 服务、销售渠道 | 偏检索与既定工作流；高实施成本；非「个人私有 + 自进化」路线 |
| **Dify / Coze** | 低代码编排 | 静态流程为主；弱持久个人记忆与自动进化 |



### 3.2 KyberKit 差异化三角

**有记忆（分层 Memory） + 能行动（Tool / Workspace） + 自我进化（LearningLoop）**

### 3.3 防御护城河

- **自进化技能**：从工作中生长出的技能 vs 纯安装型插件市场。  
- **组织数字资产**：CoW 技能流转 + 可追溯 fork 链。  
- **本土化通道**：企业微信（P1）→ 飞书（P2）等结构化 Gateway。  
- **信任与合规接口**：进化变更摘要、Checkpoint 回滚、权限与 OutputGuard（见第 7、8 节）。

---

## 4. Federation 架构模型（核心设计原则）

### 4.1 三层所有权

1. **Personal Identity**：KK.md、MEMORY.md、会话与轨迹 —— 默认不出域。  
2. **Skill Capability**：Markdown + Frontmatter 技能；`private` → 经用户操作 `team` / `org`（3.5+）。  
3. **Org Context**：外部编辑的知识库 MD、只读注入；不含个人对话原文。

### 4.2 技能「晋升」与 Copy-on-Write

- 团队使用的是 **Fork 后的副本**，演进互不覆盖（Memo L2）。  
- `forked_from`、`origin`、`author` 等字段在 Frontmatter 中预埋（详见第 8 节）。

### 4.3 隐私边界（产品承诺）

- KyberKit **不做**协作式知识库编辑；编辑在 Obsidian / 飞书等完成，仅同步内容注入。  
- 部署拓扑（Memo）：**纯中心化**；若未来支持私有化，在本节原则下扩展，不改变「身份层私有」契约。

---

## 5. 版本路线图（3.0 → 3.5 → 4.0）

### 5.1 3.0 — 私人智能助理（单用户深度）

- 单用户学习循环 + OutputGuard + Workspace Agent（异步）。  
- Skill 渐进式披露、双来源技能（自省 + `/teach`）。  
- **多用户 / 多租户预埋**：`userId`、`SessionFactory`、存储 SPI、`GatewayMessage`、Skill 元数据（见第 8.4 节）。  
- 企业微信 Gateway **P1**（最小可用：收发与触发任务；卡片能力按迭代增强）。

### 5.2 3.5 — 桥梁版本（建议单独规划）

- **Team Skill Hub**（约 2–10 人）：技能 CoW 分享、最小多用户。  
- 便于企业 **PoC**：多人同时使用而不直接跳到完整 4.0 多租户。  
- **时间线**：待 Product Owner 确认（见第 10 节开放决策）。

### 5.3 4.0 — 企业级 Agent 集群

- 多用户 / 多租户、RBAC。  
- 技能市场（排序、推荐）、协作知识库（L3）。  
- L4 用户建模层（Memo Q5 延后项）。  
- `ProviderRegistry` 与模型特化 Prompt（正式多提供商）。  
- 飞书 Gateway、Telegram（可选）等。

### 5.4 路线图一览

```
3.0
  ├── OutputGuard（P0）
  ├── LearningLoop（P0.5）
  ├── Workspace Agent（P0.5）
  ├── Skill 渐进式披露 + 双来源生成（P1）
  ├── 企业微信 Gateway（P1）
  ├── FTS5 跨 Session 检索（P2）
  └── 多用户预埋接口

3.5（桥梁）
  ├── Team Skill Hub（2–10 人）
  ├── 技能 Copy-on-Write 流通（Memo L2 落地）
  └── 最小化多用户与 PoC 场景

4.0
  ├── 多租户 / RBAC / Org Admin
  ├── 技能市场 + 协作知识库
  ├── L4 用户建模层
  ├── ProviderRegistry
  └── 飞书 Gateway / 可选通道
```

---

## 6. 3.0 交付优先级（更新于战略文档）

本表取代 Memo 中原「3.0 交付优先级」表格，反映 LearningLoop / Workspace / Gateway 的调整共识。

| 优先级 | 交付件 | 依据 |
|:---|:---|:---|
| **P0** | OutputGuardMiddleware | 可靠性基础；一切自动化与学习的前提 |
| **P0.5** | LearningLoopMiddleware | 核心差异化；依赖 P0 稳定后再放量 |
| **P0.5** | Workspace Agent（后台异步） | 体验跃迁；与 LearningLoop 同属「智能体做事」主轴 |
| **P1** | Skill 渐进式披露 + 条件激活 | 技能系统完整体验 |
| **P1** | 企业微信 Gateway（最小可用 → 结构化消息增强） | 中国企业落地主通道 |
| **P2** | FTS5 跨 Session 检索 | L2 内存升级 |
| **P2** | 飞书 Gateway | 第二优先级 IM（Memo Q4） |

---

## 7. 信任机制：进化变更摘要（Evolution Changelog）

### 7.1 目标

企业用户采纳自进化前，必须能回答：**Agent 改了什么？依据是什么？能否撤销？**

### 7.2 能力要求

1. **可读变更摘要**：每次 LearningLoop 触发对 KK.md / MEMORY.md / Skill 等的修改，生成人类可读的摘要（diff 要点 + 自然语言说明）。  
2. **可追溯**：关联 `trajectory.sqlite` / 轨迹记录，便于审计与调试。  
3. **回滚**：利用现有 Checkpoint 能力，支持一键或按版本恢复。  
4. **呈现层**：TUI / Gateway 均需能展示「最近进化」与详情（具体 UI 迭代分 sprint 实现）。

---

## 8. 3.0 技术决策汇总

以下内容与 [Kyberkit3.0-memo.md](./Kyberkit3.0-memo.md) 一致，本节为执行层速查；若冲突以 **本战略文档第 5–6 节（版本与优先级）** 为准。

### 8.1 Review 模型（Q2）

- 默认：`compactModel`（如 Haiku）。  
- Fallback：`reviewModel → compactModel → mainModel`。  
- 配置：`KyberConfig.model.reviewModel`。  
- 成本参考：100 活跃用户日均 Review 成本约从 $27/天 降至 ~$4/天（量级供规划用）。

### 8.2 多模型支持（Q3）

- 3.0 **正式支持 Anthropic**；其他提供商通过 ENV（OpenAI-Compatible baseURL）**非正式**切换，风险自负。  
- OutputGuard 预留 Provider 分支处理 tool_use 差异。  
- 4.0：`ProviderRegistry` + 模型特化 Prompt。

### 8.3 Gateway（Q4，优先级已上调企业微信）

- 顺序：**企业微信 → 飞书 → Telegram（可选）**。  
- `PlatformAdapter`：`text / card / file / action_response`；支持进度卡片与按钮。  
- **战略优先级**：企业微信 **P1**（见第 6 节）。

### 8.4 L4 用户建模（Q5）

- 3.0 **不纳入**；4.0 评估。理由见 Memo。

### 8.5 技能标准（Q6）

- 兼容 **agentskills.io** Frontmatter，并扩展 KyberKit 字段（`author`、`origin`、`forked_from`、`visibility`、`tags`、`usage_count`、`activation_paths`、`execution_mode` 等）。

### 8.6 技能生命周期

| 来源 | 触发 | 入口 |
|:---|:---|:---|
| Agent 自生成 | Nudge → Fork Review → skill_manage | LearningLoopMiddleware |
| 用户教导 | `/teach` / `/skill create` | TeachCommand |

### 8.7 4.0 预埋清单（3.0 必须完成）

| 预埋点 | 3.0 实现 | 4.0 / 3.5 用途 |
|:---|:---|:---|
| `userId` | 存储路径带 `userId`，默认 `default` | 多用户隔离 |
| Skill Frontmatter | author / fork / visibility / tags | 技能市场 + fork |
| 存储 SPI | MemoryStore / SkillStore 抽象，本地实现 | PostgreSQL / S3 |
| SessionFactory | 工厂创建 AgentSession | Session Pool、并发 |
| GatewayMessage | 结构化消息类型 | 飞书卡片等 |
| **TeamSkillHub（接口预留）** | 命名空间或目录约定、`teamId` 占位（待详细设计） | **3.5** 团队技能协作 |

---

## 9. 验证指标（Success Metrics）

指标分三层，便于 3.0 验证产品与 3.5+ 验证商业化扩张。

### 9.1 个人效率

| 指标 | 说明 | 备注 |
|:---|:---|:---|
| DAU / WAU / MAU | 活跃与粘性 | 按 CLI / 企业微信分段统计 |
| 任务完成率 | 用户发起任务中 Agent 闭环完成比例 | 需定义「任务」事件 schema |
| 人机比 | 用户手动完成 vs Agent 完成 | 反映自动化渗透 |

### 9.2 Agent 进化质量

| 指标 | 说明 | 目标方向（初稿） |
|:---|:---|:---|
| LearningLoop 采纳率 | 生成变更被用户保留（未立即回滚）的比例 | **>60%** 为健康信号（待校准） |
| 人均技能数 | 注册技能数随时间增长 | 30 日留存对比 |
| Memory 命中率 | 检索记忆在下游 turn 中被有效利用的近似度量 | 需结合日志定义 |
| 变更摘要查看率 | 用户打开进化摘要的频率 | 信任产品是否被使用 |

### 9.3 企业协作（3.5 起）

| 指标 | 说明 |
|:---|:---|
| 团队技能贡献率 | 有 promote / fork 行为的成员占比 |
| 技能复用率 | 团队库中被多人使用的技能占比 |
| Org / Team Skill Library 增长率 | 技能副本数与版本迭代 |

### 9.4 商业与健康（可选扩展）

- **获客**：企业微信接入后的激活漏斗。  
- **留存**：28 日留存（按渠道）。  
- **成本**：Token / Review 成本 per DAU（延续 Memo 成本模型）。

---

## 10. 开放决策（待 Product Owner 确认）

以下事项影响预埋粒度与 GTM 文档语气，确认后应增量更新本文档。

| # | 议题 | 可选方向 | 影响 |
|:---|:---|:---|:---|
| 1 | **3.5 时间窗口** | 例如 3.0 GA 后 3 / 6 个月等 | TeamSkillHub 接口粗细、是否强制并行开发 |
| 2 | **商业模式** | 开源核心 + 企业服务 / 闭源商业许可 / 混合 | 文档对外表述、社区策略、功能分层 |

---

## 修订记录

| 日期 | 修订内容 |
|:---|:---|
| 2026-04-27 | 初版：整合 Federation 模型、竞品（含 Claude Cowork / OpenClaw）、优先级调整、信任机制、验证指标、预埋清单扩展 |
