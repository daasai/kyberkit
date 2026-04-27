# KyberKit 3.0 产品决策记录

> **状态**: Q1-Q6 讨论完成，Product Owner 已确认  
> **日期**: 2026-04-26  
> **参与者**: Shawn (Product Owner) + AI Analyst  
>
> **正式产品战略文档**（定位、路线图、竞品、优先级更新、验证指标）：请见 **[Kyberkit3.0-product-strategy.md](./Kyberkit3.0-product-strategy.md)**。本文档保留历史 Q&A 决策原文；其中「3.0 交付优先级」若与战略文档不一致，以战略文档为准。

---

## 产品定位 (Q1) ✅

**决策**: KyberKit 3.0 定位为**企业内部协作智能体集群平台**的单用户深度版本。

**核心能力三层**:

| 层级 | 能力 | 版本 |
|:---|:---|:---|
| **L1 私有智能体** | 每个员工拥有可自进化的专属 Agent（人设、记忆、技能、工作区） | **3.0** |
| **L2 技能流通** | 用户间技能的 Copy-on-Write 分享（fork 副本 → 独立演化） | **3.0 预埋, 4.0 实现** |
| **L3 协作知识库** | 部门/项目级共享 Agent 上下文（Markdown 文件，外部编辑） | **4.0** |

**3.0 范围**: 单用户学习循环 + 输出防护 + Workspace Agent，充分吸收 Hermes 自进化能力。为多用户预埋接口（userId 抽象、Skill 元数据、存储 SPI、SessionFactory）。

**部署拓扑**: 纯中心化。

**协作编辑**: KyberKit 不做知识库编辑，用户使用 Obsidian/飞书等外部工具编辑，KyberKit 负责将知识库内容注入 Agent 上下文。

---

## Review 模型 (Q2) ✅

**决策**: Review 默认使用 `compactModel`（如 Haiku）。

**Fallback 链**: `reviewModel → compactModel → mainModel`

**配置路径**: `KyberConfig.model.reviewModel`

**成本依据**: 100 活跃用户日均 Review 成本从 $27/天降至 $4/天（节省 85%）。

---

## 多模型支持 (Q3) ✅

**决策**: 3.0 仅正式支持 Anthropic，但通过 ENV 支持切换到其他 OpenAI-Compatible 提供商。

**实现路径**: 路径 A（ENV baseURL 覆盖），非正式支持，用户自行承担兼容性风险。

```bash
KYBER_API_BASE=https://api.deepseek.com/v1
KYBER_API_KEY=sk-xxx
KYBER_MODEL=deepseek-chat
```

**OutputGuard**: 预留 Provider-specific 修复逻辑分支，处理不同提供商的 tool_use 格式差异。

**4.0 方向**: 引入 `ProviderRegistry` + 模型特化 Prompt 注册表，正式支持多提供商。

---

## Gateway 优先级 (Q4) ✅

**决策**: 企业微信优先，飞书第二。

**实现顺序**: 企业微信 → 飞书 → Telegram（可选）

**Gateway 设计要求**:
- `PlatformAdapter` 接口支持结构化消息类型（text / card / file / action_response），不仅是纯文本
- 消息卡片能力：进度可视化、操作按钮、结构化输出

---

## L4 用户建模层 (Q5) ✅

**决策**: 3.0 不纳入。延后至 4.0。

**理由**: L1 Prompt Memory（KK.md + MEMORY.md）+ L2 Session Retrieval + L3 Skills 三层已覆盖企业场景核心需求。L1 的 Memory Nudge 自省已能覆盖 L4 的大部分个性化价值。

---

## 技能标准 (Q6) ✅

**决策**: C — 兼容 agentskills.io Frontmatter 格式，扩展 KyberKit 自有字段。

**3.0 Skill Frontmatter 完整定义**:

```yaml
---
# === agentskills.io 兼容字段 ===
name: financial-report-analysis
description: 分析季度财务报表的标准流程
version: 1.0.0
platforms: [cli, wecom]
requires_tools: [read_file, web_search]
fallback_for_tools: []

# === KyberKit 扩展字段 ===
author: default                   # 3.0 硬编码 'default'，4.0 多用户
origin: null                      # fork 来源
forked_from: null                 # 源 skillId@version
visibility: private               # private | team | public (4.0)
tags: [finance, reporting]        # 分类检索 (4.0 技能市场)
usage_count: 0                    # 使用次数 (4.0 排序)
activation_paths: ["*.xlsx"]      # 条件激活路径模式
execution_mode: inline            # inline | fork
---
```

---

## 技能生命周期 (讨论补充) ✅

**决策**: 3.0 同时支持两种技能来源。

| 来源 | 触发方式 | 入口 |
|:---|:---|:---|
| **Agent 自生成** | Nudge 自省 → Fork Review → skill_manage | `LearningLoopMiddleware` |
| **用户主动教导** | `/teach` 或 `/skill create` 命令 | `TeachCommand` |

---

## 3.0 交付优先级

| 优先级 | 交付件 | 依据 |
|:---|:---|:---|
| **P0** | 输出防护栏 (OutputGuardMiddleware) | 可靠性基础，所有其他能力的前提 |
| **P0** | 学习循环 (LearningLoopMiddleware) | 核心差异化，Hermes 手册提供完整方案 |
| **P1** | Workspace Agent (后台异步执行) | 产品体验飞跃，依赖 P0 的可靠性基础 |
| **P1** | Skill 渐进式披露 + 条件激活 | 技能系统的完整体验 |
| **P2** | 企业微信 Gateway | 企业接入通道 |
| **P2** | FTS5 跨 Session 检索 | L2 内存系统升级 |

---

## 4.0 预埋清单 (3.0 必须完成)

| 预埋点 | 3.0 实现 | 4.0 用途 |
|:---|:---|:---|
| `userId` 参数 | 所有存储路径带 userId，默认 `'default'` | 多用户隔离 |
| Skill Frontmatter | 预留 author/origin/forked_from/visibility/tags | 技能市场 + fork 流通 |
| 存储 SPI | MemoryStore/SkillStore 保持接口抽象，实现为本地文件 | 切换到 PostgreSQL/S3 |
| SessionFactory | 工厂模式创建 AgentSession | Session Pool + 多用户并发 |
| GatewayMessage | 结构化消息类型接口 | 飞书消息卡片 + 更丰富的交互 |

---

## 版本路线图

```
3.0 (当前规划)
  ├── 单用户学习循环 (Hermes 自进化)
  ├── 输出防护栏体系
  ├── Workspace Agent (后台执行)
  ├── Skill 渐进式披露 + 双来源生成
  ├── 企业微信 Gateway
  └── 多用户预埋接口

4.0 (远期规划)
  ├── 多用户 / 多租户
  ├── 技能 Copy-on-Write 流通
  ├── 技能市场 (排序 + 推荐)
  ├── 协作知识库 (共享 Agent 上下文)
  ├── L4 用户建模层
  ├── 飞书 Gateway
  ├── ProviderRegistry (多模型正式支持)
  └── RBAC 权限系统
```
