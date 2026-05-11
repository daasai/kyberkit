# Kevin 2.0 第一次见面体验规格

> 状态：Draft  
> 第一性底层：`./00-first-principles.md`（范围与适用性 / Q4 第一刻体验）  
> **C2 Project Context 类型定义：`./12-cognitive-capital.md` §3.2**（directory_cognition 的资产定义、积累机制、消费方式）  
> 关联：`./01-product-strategy.md` §6.2 冷启动 / `./05-ux-ia-alignment.md` §4.1 Workspace Home / `./08-connector-capability-governed-action.md` §10.1 Local Files Connector / `./02-object-model-and-artifact.md` Material 类型  
> **本文档职责**：专注第一次见面的**体验实现**——5-10s 双轨扫描、下一步建议生成 UX、MVP 验收标准。directory_cognition 的类型定义见 doc 12 §3.2。

---

## 1. 设计目标

### 1.1 第一次见面的产品功能

第一次见面是 Kevin 的**最高密度价值释放时刻**。在这 5-10 秒里，Kevin 必须同时兑现三个承诺：

| 承诺 | 表现方式 |
|---|---|
| **真实读懂** | Kevin 准确说出"这是什么项目"，不靠猜测，不靠通用模板 |
| **主动洞察** | Kevin 主动指出至少一个用户没注意到、但确实存在的关联或缺口 |
| **尊重主权** | Kevin 给建议但不替用户决定；不确定时明确声明 |

这三件事一旦完成，用户在 60 秒内就形成了"这不是另一个 AI Chat"的认知——这是后续所有信任、留存、付费决策的种子时刻。

### 1.2 适用范围（领域无关）

第一次见面的机制和体验**不依赖具体职业**。下面任何场景都应用同一套机制（材料、措辞、建议方向不同，但流程相同）：

| 场景 | 用户指向的目录可能是 | Kevin 在 10 秒内应识别 |
|---|---|---|
| 产品 / 项目工作 | `~/work/project-x/` | 项目类型、核心文档、缺失的对齐 |
| 自媒体 / 内容创作 | `~/Content/2026-Q2/` | 内容主题、节奏、近期表现、待发布 |
| 个人投资 | `~/Investing/Tencent/` | 标的范围、研究阶段、关键变化 |
| 研究 / 分析 | `~/Research/RAG-Eval/` | 研究问题、证据收集状态、假设缺口 |

**这个适用范围是设计的核心约束**：spec 中所有规则、措辞模板、生成逻辑，都必须通过"换场景测试"——同一个机制在四个场景里都能产生有意义的结果。

---

## 2. 体验剧本

### 2.1 用户视角（领域无关基线）

```
T+0s     用户启动 Kevin → 看到一个简洁的入口："指一个文件夹，开始工作"
T+1s     用户选择本地目录（系统级 picker，不限制类型）
T+2s     界面切换：Kevin 的扫描工作台
         "正在认识 [目录名]……"
         流式日志开始呈现："看到 N 个文件 / 读取 README / 抽样关键文件……"
T+3-5s   首屏认知开始填充（流式渲染）：
         项目识别 → 关键观察 → 不确定声明 → 3-5 条下一步建议
T+5-10s  完整首屏认知就位
         主对话区：Kevin 主动说一句话，邀请用户回应或继续
T+10s+   后台索引继续运行（用户可以已经开始工作）
```

### 2.2 Kevin 第一句话的结构（领域无关模板）

Kevin 的开场白必须符合下列结构，让用户在一次阅读里得到完整图景：

```
[识别]   我看到这是一个 [项目类型] 项目，主要关于 [主题]。
[规模]   核心文件 N 个，最近一次更新是 [时间]。
[发现]   我注意到 [一条具体的关联 / 矛盾 / 缺口]。
[确认]   有 [X 个文件 / Y 件事] 我还没看清，会在后台继续读。
[问题]   你现在最想推进哪一件？或者我先把整体认识告诉你？
```

#### 跨场景示例（同一模板）

**产品场景：**
> 我看到这是一个产品规范项目，主要关于 Kevin 2.0 的 PRD 重构。  
> 核心文件 11 个，最近一次更新是今天上午。  
> 我注意到 06 文档引用了一些还没在 02 里展开的字段——这两份内容可能需要对齐。  
> hermes/ 目录下两份 5 月 8 日的草稿还没有被任何规范引用，我先在后台继续读。  
> 你现在想先推进 02 的字段补全，还是先看 hermes 的两份草稿？

**自媒体场景：**
> 我看到这是一个内容创作项目，主题集中在 AI 工具评测。  
> 核心素材 23 个，最近更新是昨天的读者反馈整理。  
> 我注意到这周的选题草稿和 4 月一篇高互动文章的角度有重叠——可能是机会，也可能是重复。  
> 5 个录屏文件我还没读，会在后台继续。  
> 你想先看选题草稿的角度对比，还是先看读者反馈里我整理出来的几个新方向？

**投资场景：**
> 我看到这是一个公司研究项目，标的是腾讯，研究阶段在估值与持仓决策之间。  
> 核心研究材料 18 份，最近更新是上周的 Q1 财报笔记。  
> 我注意到你 3 月笔记里把"小程序广告复苏"列为关键看点，但最新财报里这项数据有显著变化——可能影响估值结论。  
> 4 份券商 PDF 我还没读完，会在后台继续。  
> 你想先看看这个变化对你估值假设的影响，还是先把研究流程整理一下？

### 2.3 设计要素分析

每一段开场白都满足以下要求（这是验收标准）：

- **第一句必须正确**：项目识别错误的概率必须接近 0；不确定时使用"看起来像 / 主要是"等弱化措辞
- **发现必须具体**：引用具体文件名 / 章节 / 数据，而不是"我看到很多内容"
- **不确定必须显性**：宁可少说也不能虚构；说明哪些没看完
- **结尾是问题不是结论**：把判断权交回给用户，体现尊重主权
- **2-4 句话以内**：不能让用户读 10 秒；信息密度必须高

---

## 3. 双轨时间预算

### 3.1 同步快路径（Tier 1，0-10s）

**目标**：5-10 秒内产出首屏认知 + 第一句话。

**数据采集策略（按时间预算分层）：**

| 时间窗 | 处理动作 |
|---|---|
| 0-1s | 列出目录树（前 2-3 层）、文件大小统计、扩展名分布、`.git` / `node_modules` / `.obsidian` / `.cache` / `__pycache__` / `.venv` 等隐藏与系统目录自动忽略 |
| 1-3s | 找 README / TOC / index 类文件（任意层级），完整读取；按命名信号（"plan"、"log"、"final"、"draft"、"notes"、日期）和 mtime 选 3-5 个高信号文件抽样读取 |
| 3-7s | LLM 调用一次，输入：目录结构 + README + 抽样文件内容，输出：项目识别 + 关键观察候选 + 建议候选 |
| 7-10s | 渲染首屏 + Kevin 第一句话 |

**关键原则：**

- 不阻塞等待全量内容——10s 内能拿到的就用，拿不到的明确说"还没看完"
- 信号优先级：README > 命名显著文件 > 最近修改文件 > 抽样
- 跨语言 / 跨格式宽容：能解析就解析，不能就跳过并显式声明
- 单次 LLM 调用覆盖整轮，不做多步推理（避免延迟堆叠）

### 3.2 异步深路径（Tier 2 & 3，分钟级）

**Tier 2（分钟级，自动启动）：**
- 全量文件内容读取（按可解析格式）
- 文件级语义嵌入与索引
- 跨文件关联推理（被引用、互相提及、时间序列）
- 异常 / 缺口的更深层发现

**Tier 3（按需触发）：**
- 用户查询触发的深度检索
- 主动行为（D3 阈值触发）所需的精细分析
- 全文向量索引（用于后续 Material 引用与 Evidence Badge）

**用户感知：**

- Tier 2 默默运行，状态条在角落（不打扰）
- 完成后 Kevin 主动追加："我把全部内容读完了，新增发现：…… [查看认知更新]"——这本身就是飞轮第一圈的可见性时刻
- Tier 3 在用户查询或主动行为时调用，不预热

### 3.3 大目录退化策略

当目录规模超过阈值（建议：> 500 文件 或 > 50MB），同步快路径自动降级：

| 规模 | 同步路径策略 |
|---|---|
| ≤ 200 文件 | 完整 Tier 1 |
| 200-500 文件 | 仅扫前 2 层 + README + 抽样减半 |
| > 500 文件 | 仅扫前 1 层 + README + 抽样 3 个；Kevin 明确说："这是一个较大的目录，我先看了表层，深入读取在后台进行" |

**绝不让用户看到 spinner 等待——降级永远优先于卡住。**

---

## 4. 首屏认知的输出结构

### 4.1 字段定义

第一次见面的认知，以"目录认知卡"形式呈现给用户，并同时持久化为 `directory_cognition` Material（**file-backed**，事实源是 `.kevin/cognition.md`，详见 §5）。

```typescript
interface DirectoryCognitionV1 {
  // 项目识别
  project_identification: {
    inferred_type: string;        // "产品规范项目" / "内容创作项目" / "公司研究项目" 等
    inferred_topic: string;       // 项目主题的一句话描述
    inferred_stage: string | null; // "起步 / 进行中 / 收尾"——可空（不确定时不强填）
    confidence: 'high' | 'medium' | 'low';
  };
  
  // 规模与节奏
  directory_overview: {
    total_files: number;
    file_type_distribution: Record<string, number>; // {".md": 11, ".pdf": 4, ".png": 3, ...}
    last_modified_at: string; // ISO timestamp
    activity_pattern: string; // "活跃" / "近期更新" / "搁置" / "归档"
  };
  
  // 关键发现（Kevin 主动呈现的核心价值）
  key_findings: Array<{
    finding_type: 'connection' | 'gap' | 'contradiction' | 'staleness' | 'opportunity';
    description: string;          // 具体描述，必须引用文件名 / 章节
    referenced_files: string[];   // 涉及的文件路径
    confidence: 'high' | 'medium' | 'low';
  }>;
  
  // 不确定声明（信任的关键来源）
  uncertainties: Array<{
    description: string;          // "5 个录屏文件还没读" / "这两份草稿的关系不清楚"
    affected_files?: string[];
    will_resolve_in: 'background' | 'on_demand' | 'requires_user_input';
  }>;
  
  // 下一步建议（见 §6）
  suggestions: NextStepSuggestion[];
  
  // 元数据
  generated_at: string;
  generation_tier: 'tier1' | 'tier1+tier2'; // 是否经过深度索引
  generation_model: string;
}
```

### 4.2 渲染原则

- **流式呈现**：每个字段渲染完成立刻显示，不等全部就绪
- **可折叠**：默认展示 项目识别 / 3 条关键发现 / 3 条建议；其他折叠
- **可编辑**：每一项都可以由用户点击修正——修正动作是后置沉淀的关键信号（见 §5.4）

---

## 5. 认知 Material：文件优先架构

> **类型定义权威来源**：`directory_cognition` 作为 C2 项目情境（Project Context）的实例，其资产类型定义、内容 schema、积累机制、消费方式见 `12-cognitive-capital.md` §3.2。本节专注**文件优先架构的实现细节**。

### 5.1 核心架构：文件是事实源

第一次见面产出的认知，**不是 Kevin 内部的私有对象**，而是一个真实的本地文件，住在用户的目录里。Kevin 内部的 Material 只是这个文件的镜像。

```
用户的目录 /work/project-x/
  ├── .kevin/
  │   ├── cognition.md              ← 事实源（文件）
  │   └── cognition.history.jsonl   ← 演进日志（追加式）
  ├── docs/
  ├── README.md
  └── ...

Kevin 内部对象：
  Workspace
    → 引用 directory_cognition Material（file-backed）
        → 由 LocalFilesConnector 镜像 .kevin/cognition.md
```

| 设计选择 | 说明 |
|---|---|
| **文件位置** | `.kevin/cognition.md`（隐藏目录，避免污染用户目录视图） |
| **文件格式** | Markdown 主体 + YAML frontmatter 结构化字段 |
| **演进日志** | `.kevin/cognition.history.jsonl`（独立的追加式日志） |
| **同步方向** | 双向：Kevin 写文件 / 文件变更 → Material 更新 |
| **冲突仲裁** | 时间戳比较；文件作为最终事实源 |
| **Git 集成** | 首次创建时主动询问："要不要把 .kevin/ 加入 .gitignore？默认建议是。" |

### 5.2 为什么文件优先

| 维度 | 价值 |
|---|---|
| **可见性** | 用户在 VSCode / Obsidian / 文件管理器里能看到 Kevin 的理解，不需要打开 Kevin app |
| **可移植性** | 跟随目录走——目录复制 / 同步 / 备份 / 移交 / 团队共享时，Kevin 的认知不会丢 |
| **信任** | 纯文本，所见即所得，没有黑盒；用户随时能验证 Kevin 在记什么 |
| **可编辑性** | 用任何编辑器都能编辑；用户的工作流不被绑定到 Kevin |
| **版本控制** | 直接 git diff / git log / git blame，时间线可追溯 |
| **生态对齐** | 与 AGENT.md / CLAUDE.md / CURSOR rules 等约定同源——是 AI 时代的"项目记忆约定" |
| **演示价值** | 第一次见面的延伸震撼——"你看，Kevin 把对你项目的理解写成了一个 markdown 文件，你随时可以打开它" |
| **隐私简化** | 数据完全留在用户本地目录，无需额外的本地存储隔离机制 |

### 5.3 文件格式规范（kevin-cognition/v1）

`.kevin/cognition.md` 的格式：

````markdown
---
schema: kevin-cognition/v1
generated_at: 2026-05-10T10:30:00+08:00
last_updated_at: 2026-05-10T11:45:00+08:00
generation_tier: tier1+tier2
generation_model: claude-4-sonnet
project_identification:
  inferred_type: 产品规范项目
  inferred_topic: Kevin 2.0 PRD 重构
  inferred_stage: 进行中
  confidence: high
directory_overview:
  total_files: 47
  scanned_files: 23
  pending_files: 24
  last_modified_at: 2026-05-10T09:00:00+08:00
  activity_pattern: 活跃
---

# Kevin 对这个项目的认知

> 这份文档是 Kevin 在 2026-05-10 首次扫描这个目录后形成的初始认知，会随着工作的进展持续演进。
> 你可以随时直接编辑此文件——你的修改会被 Kevin 学习。

## 项目概况

这是一个产品规范项目，主要关于 Kevin 2.0 的 PRD 重构……

## 关键发现

### 缺口：02 与 06 的字段对齐
06 文档引用了一些还没在 02 里展开的字段。
**涉及文件**：`docs/06-mvp-scope-and-metrics.md`（§7.0）、`docs/02-object-model-and-artifact.md`
**置信度**：高

### 关联：hermes 草稿与最新 Artifact
hermes/ 目录下两份 5 月 8 日的草稿与最新 Artifact 草案有相关性，但还没有被规范文档引用。
**涉及文件**：`hermes/artifact-ba1133a0-*.md`、`hermes/artifact-e185dc75-*.md`
**置信度**：中

## 还没看清的地方

- 5 个录屏文件还没看（`recordings/*.mp4`）—— Kevin 当前不解析视频
- hermes 目录的命名约定（artifact-id 格式）需要进一步理解

## 演进日志摘要

最近 5 条变更：
- 2026-05-10 11:45 [background_indexing] 新增 1 条 key_finding（hermes 草稿关联）
- 2026-05-10 11:30 [user_correction] 项目阶段：起步 → 进行中
- 2026-05-10 10:30 [tier1] 首次扫描完成

完整日志见 `.kevin/cognition.history.jsonl`。
````

YAML frontmatter 字段定义对应 §4.1 的 `DirectoryCognitionV1` 接口。`key_findings` / `uncertainties` / `suggestions` 在 markdown body 中以语义化 section 表达，便于人类阅读；Kevin 通过约定的 heading 结构解析。

### 5.4 演进触发器目录

认知文件是一份**活的文档**，演进触发器：

| 触发器 | 演进动作 | 写入来源标注 |
|---|---|---|
| 用户在 Kevin 里编辑某字段 | Kevin 写入文件 + 追加日志 | `user_edit_in_app` |
| 用户直接编辑 cognition.md 文件 | File watcher 检测 → Material 更新 + 追加日志 | `user_edit_file` |
| 用户对认知中某条建议 接受 / 拒绝 / 修改 | Kevin 推断隐含偏好并更新对应字段 | `inferred_from_user_action` |
| 用户在 Chat 中纠正 Kevin 的理解 | Kevin 更新认知，并在演进日志中记录修正与解释 | `user_correction_in_chat` |
| 后台索引完成（Tier 2） | 更新 `key_findings` / `uncertainties` / 解决 `will_resolve_in: background` 项 | `background_indexing` |
| 目录新增重要文件（D3 阈值触发） | 提示用户认知可能需要更新 | `directory_change` |
| 用户产出第一份 Artifact | 校准 `inferred_stage` 等行为推断字段 | `artifact_signal` |
| 长期未活动（>30 天无写入） | 更新 `activity_pattern` 为"搁置" | `activity_signal` |

### 5.5 演进日志（cognition.history.jsonl）

每条修改作为一行 JSON 追加：

```jsonl
{"ts":"2026-05-10T10:30:00+08:00","source":"tier1","type":"create","summary":"首次扫描完成"}
{"ts":"2026-05-10T11:30:00+08:00","source":"user_correction_in_chat","type":"field_update","field":"project_identification.inferred_stage","before":"起步","after":"进行中","reason":"用户说：'已经过设计阶段了'"}
{"ts":"2026-05-10T11:45:00+08:00","source":"background_indexing","type":"finding_added","field":"key_findings","added":{"description":"hermes 草稿关联","confidence":"medium"}}
```

特性：
- **追加式**：永不修改历史；JSONL 格式适合长期追加且 git diff 友好
- **可读性**：用户可直接阅读；Kevin 可解析
- **可审计**：每条记录有时间戳、来源、变化前后值
- **演进可见性**：从这份日志，用户能清晰看到"Kevin 越来越懂这个项目"的过程——这是飞轮可见性的核心载体

### 5.6 同步与冲突处理

**Kevin → 文件（写入路径）：**

1. Kevin 持有 Material 内存对象
2. 修改字段 → 序列化为 cognition.md → 原子写（写临时文件 + rename）
3. 同时追加 cognition.history.jsonl 一行
4. 更新内存 Material 的 `last_synced_at`

**文件 → Kevin（监听路径）：**

1. File watcher 检测 cognition.md 修改（mtime 或 hash 变化）
2. 比较文件 `last_updated_at` vs Material `last_synced_at`
3. 文件较新 → 解析文件 → 更新 Material → 追加 history（来源 `user_edit_file`）
4. 解析失败（用户写错 YAML） → 不强制覆盖；UI 提示"cognition.md 似乎有格式错误，要 Kevin 帮你修复吗？"，提供 diff 预览

**冲突场景：**

- **用户编辑中 + 后台索引完成**：当用户正在 VSCode 里编辑 cognition.md，同时 Tier 2 后台索引完成想写入 → Kevin **等待文件稳定**（300ms 无变化），然后将后台索引的修改作为追加合并，而不是覆盖用户的修改
- **文件被外部删除**：Kevin 检测到后，从 Material 内存重建文件并追加 history（来源 `recovered_from_deletion`），不丢失认知
- **目录被整体移动**：Workspace 路径绑定更新；cognition.md 跟随目录走，无需迁移

### 5.7 与现有 Material 类型的关系

`directory_cognition` 不取代普通 `local_file` Material；它是更高层的语义对象，引用多个 `local_file` Material 作为来源（key_findings 中的 referenced_files）。

新增 Material 子类型 **`file_backed_material`**：表示 Material 的数据来自用户目录中的真实文件（事实源在文件系统，不在 Kevin 内部存储）。`directory_cognition` 是这个子类型的第一个具体实例；未来其他工件（如用户的 AGENT.md、glossary.md、decision-log.md 等）也可以用同样的机制接入 Kevin。

> **架构含义**：file-backed 不是 directory_cognition 一个对象的特殊设计，而是一个可推广的 Material 抽象。这是 Kevin 与本地文件生态深度融合的基础设施。

---

## 6. "下一步建议"生成规则

### 6.1 建议的分类

第一次见面的建议覆盖**三类基本动作**，至少各覆盖一类（不要全部集中在某一类）：

| 类别 | 含义 | 跨场景示例 |
|---|---|---|
| **补缺口** | 指出认知中的明显缺失 | 产品："02 的字段定义缺失"；自媒体："本周选题缺读者数据支撑"；投资："最新财报对你假设的影响未评估" |
| **推动决策** | 把已就绪材料推向下一个判断点 | 产品："访谈笔记已就绪，可以开始 Problem block 撰写"；自媒体："3 个候选选题已聚拢，可以做角度对比"；投资："估值数据齐了，可以做敏感性分析" |
| **整合输出** | 把分散内容整合为一个产物 | 产品："多份草稿可以合并为正式 PRD"；自媒体："读者反馈可以整理为下季度选题方向"；投资："多份研究笔记可以整合为投资决策备忘录" |

### 6.2 建议的质量标准（每一条都要满足）

| 标准 | 含义 | 反例 |
|---|---|---|
| **基于真实观察** | 必须引用具体文件 / 内容；不能是通用模板 | ❌ "你可以开始整理资料" |
| **特异于这个目录** | 换一个目录这条建议就不成立 | ❌ "建议先做选题分析"（不基于具体材料） |
| **不替用户决定** | 是邀请，不是指令 | ❌ "你应该先做 X" → ✅ "要不要先看 X？" |
| **可拒绝** | 用户拒绝任何一条都是合理的，UI 必须明确显示拒绝按钮 | — |
| **不通用化** | 不出现"要不要总结一下 / 整理一下"这种万能建议 | ❌ "Kevin 帮你做个总结？" |

### 6.3 数量与排序

- **3-5 条**（不少于 3，不多于 5）
- 按"可立即开始 + 价值高 + 风险低"排序
- 第一条总是最值得做的——用户视线大概率只会停留在第一条

### 6.4 接受 / 拒绝 / 修改的后置沉淀

每条建议都会被用户做出反应：

| 用户行为 | 后置沉淀 |
|---|---|
| 接受（点击进入） | 记录为接受信号；强化此类建议的生成模式 |
| 拒绝（点击 X） | 记录为拒绝信号；同类建议不再立即重复 |
| 修改后接受（编辑措辞或范围） | 记录为修正信号——这是私有方法学习的高价值数据 |
| 完全忽略（无反应） | 较弱信号；多次忽略后降低同类建议优先级 |

这些信号经 Skill Forge 处理后，将影响后续 Suggested Next Step 的生成。**第一次见面是后置沉淀的第一个数据采集点。**

---

## 7. 失败与不确定性处理

### 7.1 空目录或近空目录

```
我看到这是一个新目录，里面只有 N 个文件。
要先聊一聊这个项目是关于什么的，还是直接把已有的几个文件给我看看？
```

- 不假装认识不存在的项目
- 主动给用户两条路径（口述介绍 / 直接读已有文件）

### 7.2 大量不可解析文件

```
我看到 N 个文件，其中 K 个是图像 / 视频 / 二进制。
我目前只读了 [可解析的文件列表]，对这个项目的整体认识还有限。
能用一句话告诉我这个项目主要做什么吗？或者先指几个最重要的文件给我？
```

### 7.3 信心低的项目识别

```
我看到的内容比较零散，不太确定这是一个什么类型的项目。
看到的关键词包括 [关键词列表]——你能确认一下这是关于什么的吗？
```

**核心原则：低信心时**不要选一个"最像的"硬填，而是诚实声明并邀请用户校准。这是建立信任而非破坏信任的时刻。

### 7.4 用户纠正后的处理

当用户说"这不是 X，是 Y"时：

1. 立即更新 `directory_cognition.project_identification` 字段
2. 重新生成 `key_findings` 与 `suggestions`（基于新的项目类型框架）
3. 在演进日志中记录："用户纠正：识别从 X → Y，原因：[用户说明]"
4. Kevin 简短致谢并继续："谢谢校准，那我重新看一下——基于 [新类型]……"
5. **不要过度道歉**——这是正常的校准过程

---

## 8. 目录变化的响应行为（D2 + D3）

### 8.1 D2：默默更新索引（默认行为）

- 监测目录变化（文件新增 / 修改 / 删除 / 移动）
- 后台触发增量索引更新
- 不打扰用户
- 在 Inspector 状态条体现"索引中"

### 8.2 D3：阈值触发主动提示

**触发阈值（建议起步值，可调）：**

- 新增 ≥ 3 个文件 在一次会话外（即用户离开后回来发现）
- 单次新增内容总量 ≥ 50KB
- 出现新的子目录
- 关键文件（README / 标题含 "decision"、"final" 等关键词的文件）被修改

**触发后的 Kevin 行为：**

```
你这两天在这个项目里加了 N 个新文件。
我大致扫了一下：[1-2 句具体观察]。
要不要我把认知更新一下？或者你直接告诉我这次的重点？
```

**底线：每次会话最多触发 1 次主动提示**——避免变成打扰。

### 8.3 用户主动重扫

提供"重新认识这个项目"入口（Workspace Home 或 Inspector）。点击后：
- 触发完整 Tier 1 + Tier 2 重扫
- 旧 `directory_cognition` 进入"已修订"状态，演进日志保留
- 新认知作为最新版

---

## 9. 与现有文档的衔接

### 9.1 doc 02（对象模型）需要补充

新增 Material 类型 `directory_cognition`，schema 见 §4.1。这是 doc 02 后续轻度调整的核心新增内容。

### 9.2 doc 04（Evidence Chain）的延伸

`directory_cognition` 中每个 `key_finding` 都引用 `referenced_files`，这些引用应作为 Evidence 在 Inspector 可点击溯源。

### 9.3 doc 05（UX/IA）的关系

| 现有 Workspace Home 设计 | 第一次见面的关系 |
|---|---|
| 空状态引导（"帮 Kevin 了解你的工作"3 步） | **替换**——第一次见面不再是空状态卡片，而是直接进入扫描工作台。空状态引导仅适用于"用户跳过指定目录"的备选路径 |
| 5 张卡片（Recent / Pending / Materials / Suggested / Connectors） | 第一次见面**之后**进入 Workspace Home，5 张卡片正常呈现 |
| Suggested Next Step 卡片 | 第一次见面的 `suggestions` 与此**不重叠**：第一次见面的建议在用户做出第一次反应后即归档，之后由 Suggested Next Step 接管 |
| 入口位置 | Workspace Home 增加"目录认知" Material 入口（点击查看 / 编辑 `directory_cognition`） |

### 9.4 doc 08（Local Files Connector）的能力扩展

§10.1 Local Files Connector 当前 capabilities：
- read file
- materialize local file
- write to library

**需要补充的 capabilities：**

| 新增 capability | 用途 |
|---|---|
| **scan directory tree** | 列出目录树，限制层级，自动忽略系统目录（`.git` / `node_modules` / `.obsidian` / `.cache` / `__pycache__` / `.venv` / `.DS_Store` 等） |
| **watch directory** | 监听目录变更（新增 / 修改 / 删除 / 移动），用于 D2/D3（见 §8） |
| **batch read with sampling** | 按抽样规则（README 优先 / 命名信号 / mtime）读取代表性文件 |
| **file-backed material write** | 将 Material 持久化为用户目录中的真实文件（原子写：临时文件 + rename），用于 directory_cognition 等 file-backed 类型 |
| **file-backed material watch** | 监听 file-backed Material 对应文件的外部修改（用户 / 其他工具修改），触发 Material 更新 |
| **append-only log write** | 追加式写入 `.jsonl` 日志（用于 cognition.history.jsonl 及未来其他需要追加日志的场景） |

后三项构成新的子能力分组 **"file-backed material primitives"**——这是 directory_cognition 实现的基础设施，未来也支持其他 file-backed Material 类型。

**权限与安全：**

- file-backed material write **仅写入** `.kevin/` 子目录下，不写到目录其他位置
- 首次创建 `.kevin/` 目录时主动询问用户："要不要把 .kevin/ 加入 .gitignore？默认建议是。"
- 文件解析失败时不破坏用户文件——保留原文件，UI 提示用户检查
- 敏感文件名（`.env` / `credentials.*` / `*.pem` / `*.key` / 含 "secret" / "password" 命名）在抽样阶段自动跳过

### 9.5 doc 06（MVP 评测）的新任务

已在 `06-mvp-scope-and-metrics.md` 中作为 T8 纳入评测任务集：

- **T8 Always-on / First Encounter**：用户指认一个真实工作目录，Kevin 在 10 秒内生成 `directory_cognition`；关闭再进入 Workspace 后能展示项目状态和 Suggested Next Step。

补充抽样要求：

- 在 10 个真实目录上测试，要求 `project_identification.inferred_type` 准确率 ≥ 80%。
- `key_findings` 中至少 1 条被用户确认为"我没注意到但确实存在"。
- 关闭并重新进入 Workspace 后，用户能感知 Kevin 记住了项目状态，而不是重新开始一次 Chat。

---

## 10. 候选差异性标签

基于第一次见面体验，以下是候选标签（按倾向性排序）：

| 标签 | 优势 | 风险 | 适用人群 |
|---|---|---|---|
| **"指一下，我就懂"** / "Just point. I'll read." | 极简、动作具象、强暗示主动性 | 可能被误读为"读文件 AI"通用品类 | 通用 |
| **"AI 同事的第一天，从读懂你的项目开始"** | 类比清晰、温度感强、暗示"持续在场" | 较长，传播阻力大 | 个人专业用户 |
| **"在你说话之前，先读懂你"** | 反差感强（其他 AI 等你提问，Kevin 先理解） | 可能被解读为"侵入性" | 通用 |
| **"先看见，再帮忙"** | 对比鲜明（其他 AI 一上来就想帮你做事） | 略抽象 | 通用 |
| **"你的工作有了一双新眼睛"** | 感性表达、隐喻清晰 | 不直接暗示行动 | 通用 |
| **"AI 不是工具，是一个开始读你工作的同事"** | 触及关系本质 | 太长，定位语而非标签 | 长文营销 |

**我的倾向：组合使用。**

- 主标签（短）：**"指一下，我就懂"** —— 第一次见面动作的精准凝结
- 副定位（长）：**"AI 同事的第一天，从读懂你的项目开始"** —— 解释主标签背后的关系含义
- 演示叙事：**"先看见，再帮忙"** —— 对比性话术，用于和通用 AI Chat 区隔

> 标签的最终选择应在 5-10 个真实用户的"第一次见面"测试后做出——让用户自己复述时，看哪种表达最自然出现。

---

## 11. MVP 验收标准

### 11.1 体验验收

| 项 | 标准 |
|---|---|
| 时间 | 从用户选择目录到看到 Kevin 第一句话 ≤ 10 秒（小目录 ≤ 7 秒） |
| 项目识别准确率 | 在 10 个真实测试目录上 ≥ 80% |
| 关键发现质量 | 每个测试目录至少有 1 条用户确认"我没注意到但确实存在"的发现 |
| 建议特异性 | 100% 的建议都引用具体文件名或章节，无通用模板表述 |
| 不确定声明 | 100% 的目录都有显性的"还没看完"声明（即使是小目录） |
| 失败处理 | 空目录 / 异常目录 / 低信心场景都不会让 Kevin 编造内容 |

### 11.2 功能验收

- [ ] 用户从入口选择目录到 Workspace 自动创建（隐式，不暴露 Workspace 概念）
- [ ] 同步快路径在 10 秒内产出首屏认知与第一句话
- [ ] `.kevin/cognition.md` 文件被创建（YAML frontmatter + Markdown body 格式正确）
- [ ] `.kevin/cognition.history.jsonl` 创建并追加首次扫描记录（`source: tier1`）
- [ ] 首次创建 `.kevin/` 时主动询问用户是否加入 `.gitignore`
- [ ] `directory_cognition` Material 镜像就位，与文件双向同步
- [ ] Tier 2 后台索引启动并最终更新认知（文件被追加修改、history.jsonl 追加日志）
- [ ] 用户在 Kevin 内编辑认知字段 → 文件被原子更新 + history.jsonl 追加
- [ ] 用户在外部编辑器修改 cognition.md → File watcher 检测 → Material 更新 + history.jsonl 追加（来源 `user_edit_file`）
- [ ] cognition.md YAML 解析失败时不覆盖用户文件，UI 显式提示
- [ ] 目录变更触发 D2（默默索引）；阈值触发 D3（主动提示）
- [ ] 用户对建议的接受 / 拒绝 / 修改 / 忽略均被记录为后置沉淀信号
- [ ] 演进日志在 Workspace Home 可入口查看，并可直接打开 `.kevin/cognition.history.jsonl`

### 11.3 跨场景通用性 sanity check

MVP 工程深度聚焦"产品 / 项目工作"场景。**主验收只在产品 / 项目工作目录上做**：

- **主验收**：5 个真实产品 / 项目目录 + 满足 §11.1 全部标准

但产品定义层（见 §1.2）的通用性必须守住底线，因此增加**轻量跨场景 sanity check**——不属于 MVP 主路径，但属于发布的最低守门员：

**Sanity check 要求：**

- 在自媒体素材目录、投资研究目录、研究笔记目录**各跑 1 个真实样本**（手动选取，不要求规模）
- 标准（不要求达到主验收水准，只要求"机制不崩溃"）：
  - Kevin 不会硬给一个错误的 `inferred_type`（低信心时必须显性声明）
  - 至少能产出 1 条引用具体文件的发现或建议
  - 不确定声明显性、合理
  - **不出现 PM 场景特有的措辞或术语**（如"PRD"、"需求"、"工程对齐"、"PM"、"产品经理"等不应出现在自媒体或投资目录的认知里）

**Sanity check 失败的含义：**

如果 sanity check 失败，意味着第一次见面机制**隐式地针对 PM 文件特征做了过拟合**——比如对 PRD 关键词的偏向、对项目结构假设的内置——需要回头修复。这不是"功能 bug"，而是"产品定义违反"。

> 这一守门员的存在，确保 MVP 不会以牺牲产品定义通用性为代价换取交付速度。

---

## 12. 需要在后续设计 / 实现中解决的开放问题

### 12.1 跨语言 / 跨格式覆盖度

- 中英文混合目录在 LLM 处理时是否一致？
- PDF / Word / Excel / 图片的解析依赖？哪些 MVP 内做、哪些后置？
- 二进制 / 加密文件的优雅降级？

### 12.2 隐私与本地优先（file-backed 架构带来的简化与新问题）

§5 的 file-backed 架构**天然解决了大部分本地优先的疑虑**——认知数据完全留在用户的目录里（`.kevin/cognition.md`、`.kevin/cognition.history.jsonl`），不进 Kevin 内部隔离存储。但仍有以下需要在后续设计中明确：

**LLM 调用的隐私边界：**
- 第一次见面的 Tier 1 LLM 调用是否完全本地（如本地 ollama / mlx 模型）还是允许调用云端模型？
- 默认行为是什么？用户在 Settings 里如何选择？
- 不同选择对体验的影响（本地模型可能慢、识别准确率低；云端模型快但需上传内容）

**同意流程：**
- 用户在第一次见面前是否需要显式同意"Kevin 可以读这个目录的内容并发送给 LLM"？
- 同意是一次性（首次启动）还是每个新目录一次？
- 拒绝同意时的降级体验？

**敏感文件跳过：**
- 抽样阶段已规定自动跳过的命名模式（见 §9.4 权限与安全）
- 但用户能否扩展 deny list？通过文件还是 Settings？
- 是否需要在目录扫描完成后，向用户展示"被跳过的敏感文件清单"以便确认？

**.gitignore 提议：**
- 提议时机：首次创建 `.kevin/` 时弹出？还是检测到 `.git/` 存在时？
- 提议被拒绝后是否再询问？
- 用户允许后是否需要 commit `.gitignore` 修改？

**可分享性的双面：**
- cognition.md 的可分享性是优势（团队、备份、迁移），但也意味着可能被误推送到公开仓库
- 是否需要在 cognition.md 顶部加警示行："此文件包含 Kevin 对你项目的私人理解，发布前请检查内容"？
- cognition.history.jsonl 比 cognition.md 更敏感（包含原始变更记录，可能含用户原话）——是否默认更严格地不可分享？

### 12.3 演进日志的 UI 设计

- 演进日志展示在哪？时间线？变更面板？
- 用户能否回滚到某个历史版本的认知？
- 演进日志本身要不要成为"Kevin 越用越聪明"的可见证据？怎么呈现？

### 12.4 与 Skill Forge 的接口

- 第一次见面捕获的接受 / 拒绝 / 修改信号，如何接入 Skill Forge 的判断模式提取？
- 这是 Skill Forge 重新定义为"判断框架引擎"后的具体输入源之一——需要在 Skill Forge spec 重写时明确接口

### 12.5 多目录 / 多 Workspace 的界面体验

- 一个用户有多个 Workspace 时，第一次见面的体验在哪个层级？
- 如何在 Workspaces 之间切换时维持"Kevin 记得这个项目"的连续感？

---

> 本规格作为 Kevin 2.0 的核心体验入口规范。所有触及"第一次见面"的设计与实现，都应回到本文件做对齐。
