# Kevin v1.5 产品需求文档 (PRD) — Rev2

> **Rev3 架构补丁（2026-05-08）**：**Space / Library / 本机存储路径 / `KYBER_SPACES_ROOT` 边界** 等产品架构条款已迁移至 **[`kevin-v1.5-prd-rev3.md`](./kevin-v1.5-prd-rev3.md)**。实现与评审路径模型时 **以 Rev3 为准**；Rev2 其余章节仍为 v1.5 功能与交互的主本。
>
> **版本说明**：本文档是 [`kevin-v1.5-prd.md`](./kevin-v1.5-prd.md) 的重构与扩写版本。基于 2026-05-06 的产品研讨：
> - 收敛 v1.5 的明确范围（Q1–Q6 决策）
> - 新增 Skill 体系完整设计（D2–D16 决策）
> - 新增 HITL Sign-off 基础契约
> - 新增异步任务生命周期与通知聚合
> - 补全 v1.5 In/Out 边界与验收指标
>
> **2026-05-06 第一轮精修**（GUI / 协议 / Skill 范围）：
> - §6 轻量态延后到 v1.6+，改为企微/飞书 IM 嵌入形态
> - §8.4 模型协议明确为 Anthropic SDK 一统（废弃 `KYBER_MODEL_PROVIDER`）
> - §9 重定位：v1.5 不预装任何 Skill；3 个示例契约保留为设计蓝本；v1.6+ 改预装"原子 Skills"
> - §7.1 拆分 Sensor 状态区与历史会话；历史会话采用 Codex 式行布局
> - §10.2 Sign-off 提示扩展为对话面板 / 灵动岛 / 左侧会话三处同步
>
> **2026-05-06 第二轮精修**（用户层架构 — H1–H5 全部纳入）：
> - 新增 §8.1 三层资产架构（Global / User / Space）
> - 新增 §8.2 用户层物理结构与凭证池契约（凭证一次授权、所有 Space 复用）
> - §12.6 Skill 升级为三级 scope；"提升为全局" → "提升为用户级"，修复权属概念
> - §10.3 审计日志路径迁移到 User 层
> - §16 TODO-H 已决议；新增 TODO-J（跨 Space 审计聚合 v2.0+）
>
> **与原 PRD 关系**：原文档保留为愿景叙事的"产品白皮书"；本文档为 v1.5 阶段的工程化交付契约。

---

## 0. 术语表 (Glossary)

| 术语 | 定义 |
|---|---|
| **Kevin** | KyberKit 智能 Agent 网络的桌面终端与边缘节点 |
| **Space** | 一个完全隔离的工作空间（含独立的文档库、Sensors、Skills、对话历史） |
| **Sensor** | 数据感知/接入能力（飞书、数仓、埋点、CLI…） |
| **Actuator** | 数字/物理执行能力（生成文档、写飞书、调用业务系统…） |
| **Artifact** | Agent 产出的业务制品（文档/表格/PPT/看板等） |
| **Skill** | 可复用的能力封装单元（`SKILL.md` + 可选附属资源） |
| **Skill Forge** | Kevin 独有的"使用过程蒸馏 Skill"机制 |
| **LearningLoop** | Skill 的自演进通道（Layer 1 隐式 + Layer 2 显式 Fork） |
| **HITL** | Human-in-the-Loop，人在回路 |
| **Sign-off** | 高风险 Actuator 的强制审批卡片 |
| **灵动岛** | 顶部菜单栏中央的智能感知组件，承载异步任务进度与摘要 |

---

## 1. 产品愿景与定位 (Vision & Positioning)

**Kevin** 是 KyberKit 智能 Agent 能力网络（企业级多用户多场景协作集群）的**桌面终端与边缘节点**。

- **愿景**：成为面向平台产研和职能用户的「数字化协同工作台」。辅助并接管用户日常的「标准工作」，彻底释放用户精力，使其能够专注于更具探索性和创造力的工作。
- **定位**：不是一个传统的"套壳 AI 聊天窗口"，而是一个泛在的、具备极强上下文感知能力、隐去系统复杂度的**智能路由与执行网关**。

---

## 2. 核心设计哲学 (Design Philosophy)

### 2.1 极简外观，无限延展 (The "iPhone" Paradigm)
- 面向非程序员群体设计，提供极简、直觉式的交互界面。将背后极其复杂的跨系统调度、Agent 路由、大模型推理等过程完全包装、隐藏起来。
- 在极简的交互之下，保留面向两端的极致拓展性（传感器 Sensors 与执行器 Actuators）。

### 2.2 生命体特征：持续演进与自举 (Self-Evolution)
- Kevin 会随着用户的使用和成长而持续演进。
- **核心机制**：Skill 不是被"定义"出来的，而是从用户使用过程中**蒸馏**出来的（详见 §12 Skill Forge）。
- 每个 Skill 在日常执行中通过反馈数据（LearningLoop）实现自我迭代与优化。

### 2.3 工业级可靠 (Industrial-Grade Reliability)
- 输出格式严格被模板契约约束
- 长任务有确定性进度反馈
- Sensor 与 Actuator 挂掉有明确反馈（含失败原因、影响范围、可执行的恢复路径）
- 制品全程可回溯
- 高风险动作强制 HITL Sign-off

---

## 3. 核心能力模型：Sensor 与 Actuator 的双向解耦

突破传统的"API 互联"思维，Kevin 将工作流抽象为人类数字孪生的"感官"与"四肢"。

### 3.1 传感器端 (Sensors - 泛在的感知与监听)

负责获取、接入和监听支撑用户工作上下文的所有触角。

- **知识与文档感知**：读取项目/个人文档库（如飞书文档、本地知识库）的终端能力
- **系统状态感知**：读取与分析系统运行日志的 CLI
- **数据资产感知**：对接数仓查询接口、业务系统的指标看板
- **实时事件感知**：监听监控系统报警、企业社交媒体账号评论的 API

### 3.2 执行器端 (Actuators - 意图的物理/数字投射)

负责能力输出、操作干预或是传递工作意图。**v1.5 严格控制 Actuator 范围**，仅启用低/中风险品类，业务系统干预等高风险品类延后到 v2.0。

#### 3.2.1 v1.5 Actuator 白名单

| Actuator ID | 描述 | 风险等级 | Sign-off |
|---|---|---|---|
| `artifact.markdown.generate` | 生成 Markdown 文档（落库到文档库） | low | 无需 |
| `artifact.html-ppt.generate` | 生成 HTML 版动态 PPT | low | 无需 |
| `artifact.xls.generate` | 生成 XLS / CSV 数据表 | low | 无需 |
| `artifact.feishu-doc.write` | 写入飞书文档（新建或追加） | medium | **必需**（Diff 预览 + 一键确认） |

#### 3.2.2 v2.0+ Roadmap（不在本期范围）

- `crm.action.execute` / `boss.config.write` / `marketing.strategy.dispatch` 等业务系统干预 → **high risk**
- 物理设备控制 → **high risk**

> **In v1.5**：Actuator 数量 4 个（3 low + 1 medium）  
> **Out of v1.5**：所有 high-risk Actuator 与对应签批流程

---

## 4. 核心工作场景：数据到行动的闭环

以**「单个产品的日常运营闭环」**为标准场景模版，Kevin 将接管以下全链路：

1. **数据获取 (Observe)**：自动跨系统提取（数仓、飞书多维表格、企业微信沟通流等）
2. **加工与分析 (Orient)**：按照既定分析目标，对庞杂数据进行清洗、降噪与结构化
3. **洞察与决策 (Decide)**：在每日站会前，自动生成可供决策的洞察报告
4. **举措实施 (Act)**：v1.5 仅完成「文档/方案产出」环节；下发任务、调整营销策略等动作延后到 v2.0
5. **反馈监听 (Monitor)**：v1.5 通过 Sensor 持续读取数据反馈，闭环完整性在 v2.0 通过高风险 Actuator 完成

> **In v1.5**：Observe + Orient + Decide + Act（仅文档/方案产出）+ Monitor（只读）  
> **Out of v1.5**：Act 中涉及业务系统下发的部分

---

## 5. 边缘节点（本地）能力边界 (Edge / Local Capabilities)

作为 KyberKit 网络在用户桌面的"锚点"，本地设备承载以下独特使命。**v1.5 仅交付第 1 项的初步形态，第 2、3 项为 v2.0+ Roadmap**。

1. **本地设备执行能力集成**（v1.5 P1）
   - 提供本地沙箱环境，安全执行本地代码以处理大文件或涉密数据
   - 在自动化中心可调起本地无头浏览器处理私密任务
2. **私有上下文的安全调用**（v2.0，待讨论 → §16 TODO-F）
   - 将高度敏感或私有的用户工作上下文保留在本地
   - 与云端大模型交互时执行脱敏与受控注入
3. **端侧基础模型的温床**（v2.0+）：为未来本地化的小参数模型预留阵地

> **In v1.5**：本地沙箱 + 本地无头浏览器（仅自动化中心调用）  
> **Out of v1.5**：私有上下文脱敏机制、端侧模型

---

## 6. 桌面级极简 GUI 交互隐喻

摒弃类似"飞书/钉钉"那种侧边栏堆砌、功能繁复的传统桌面软件范式。Kevin 在 PC 大屏上的交互必须像当年 iPhone 取消全键盘一样，实现**"界面复杂度的彻底收敛"**。收敛方向不是"无界画布"（自由度过高、认知负荷太大），而是以下三态。

### 6.1 v1.5 三态

- **重度态（复杂工作流）**：类 Cursor 的严谨双栏工作台——中侧承载业务制品（Artifact），右侧展示 Agent 执行轨迹与对话。业务数据是主角，AI 退居配角
- **异步态（后台执行）**：任务进入异步队列，顶部灵动岛承载进度与摘要（详见 §11）
- **签批态（HITL）**：高风险动作触发强制审批卡片（详见 §10）

三态的转换由系统自动判定与切换，用户无需操心 UI 模式选择。

### 6.2 轻量态延后到 v1.6+（IM 嵌入形态）

原计划的"类 Glean 极简唤起 + 结果卡片"轻量态，**v1.5 不交付独立 GUI 形态**。  
这一态在 v1.6+ 改为**嵌入企业 IM**（企微 / 飞书）的形态实现：用户在 IM 内通过 @Kevin 或卡片菜单触发轻量查询，结果以卡片形式直接回流 IM 会话，覆盖"用完即走"场景。

> **In v1.5**：重度态 + 异步态 + 签批态  
> **Out of v1.5**：独立轻量态 GUI；轻量态以 v1.6+ IM 嵌入形态承载

---

## 7. v1.5 界面设计与信息架构

### 7.1 左侧导航栏（LeftSidebar）

左侧栏是空间导航与资产管理的枢纽，划分为四个逻辑区域。

#### A. 顶部操作区

| 元素              | 功能定义                                       | 展现形式                           |
| --------------- | ------------------------------------------ | ------------------------------ |
| **新建会话**        | 发起新的智能对话流                                  | 核心 CTA 按钮                      |
| **搜索**          | 全局检索中心：穿透检索已接入的 Sensor 数据、历史会话、历史 Artifact | 在 CenterPanel 展开沉浸式搜索结果        |
| **Skill Store** | 能力集市：浏览公共 Skills、管理我的 Skills、新建私有 Skill    | 在 CenterPanel 展开商店视图（详见 §12.7） |
| **自动化**         | 后台任务中心：管理异步自动化任务；可调起本地无头浏览器                | 在 CenterPanel 展开任务仪表盘（详见 §11）  |

#### B. 文档库区（知识枢纽）

基于 KyberKit 的 Workspace 机制构建空间隔离的专属知识库。

- **空间隔离**：每个 Space 拥有完全独立的文档库，不跨 Space 泄漏
- **格式兼容**：原生支持 Markdown / PDF / XLS / Word / PPT，打通旧有工作模式
- **双向联动**：
  - *输入*：用户可自由浏览目录结构，通过 `@` 或附件选取任意文件作为对话上下文
  - *输出*：Agent 产出的新 Artifact 自动归档至该文档库；**v1.5 采用"建议路径 + 一键采纳/修改"的渐进式归档**，避免完全自动归档造成用户对"文件去哪了"的焦虑

#### C. Sensor 状态区

- **已接入 Sensor**：展示当前 Space 挂载的外部感知器，通过 🟢/🟡/🔴 状态灯指示健康度
  - 🟢 在线 / 🟡 降级（部分功能可用）/ 🔴 离线
- **基础交互**（v1.5 必交付）：点击任一 Sensor 展开详情，至少含以下信息：
  - 失败原因（人类可读）
  - 最近一次成功时间
  - 一键重连 / 重新授权按钮
- **展开详情的完整交互形态**：参见 §16 TODO-G（待讨论）

#### D. 历史会话

按时间倒序排列当前 Space 的对话历史，参考 Codex 的布局方案：

1. **行结构**：每个对话占一行，格式 = `标题（截断省略号）+ 创建时长简写`（如"3 小时前 / 昨天 / 周二"）
2. **悬浮操作**：鼠标移到行上时，行尾浮现两个图标按钮：
   - 📌 **置顶**：将该会话固定在历史区顶部
   - 🗄 **存档**：将该会话归档（从默认列表移除，可在"已存档"视图回查）
3. **折叠展示**：默认显示最近 **6 条**；其余收敛到底部 `Show more` 链接，点击逐次展开 +6 条
4. **签批提醒标记**：若某会话有 `awaiting-signoff` 状态的任务，在该行右侧展示红色脉冲圆点（详见 §10.2）

> 视觉布局设计稿：`Pasted image 20260506145118.png`（与本 PRD 同目录或设计稿仓库）

#### E. 底部（Space 切换器）

- **Vault 隐喻**：借鉴 Obsidian 设计，Space 切换器置于最底部（极小图标 + 名称）
- **多线程并发**：切换 Space = **打开一个全新的独立应用窗口**，新窗口完整加载目标 Space 的文档库、Sensors 和对话流
- **多窗口治理**（详见 §13）：
  - 设置/API Key/模型选择 → 跨窗口实时同步
  - 后台任务通知 → 归属于创建该任务的 Space，仅在该窗口弹出
  - macOS Dock → 聚合为单图标
  - 跨窗口快捷键 → `Cmd+\``

### 7.2 顶部菜单栏（AppHeader）

**彻底移除 Tab 导航（如 Drafts/Published），回归纯粹的"操作条 + 灵动岛"。**

```text
[Kevin Logo]  [灵动岛区域：当前会话标题 / 异步任务进度 / 摘要]  ··  [🔔] [⚙️] [头像]
```

- **Kevin Logo**：品牌锚点；点击回到当前 Space 的主页/空会话状态
- **灵动岛（Dynamic Island）**：v1.5 一等公民模块（详见 §11.3）
  - 空闲态：显示当前会话标题（可点击编辑）
  - 任务执行中：显示进度环 + 任务名 + 预计耗时
  - 任务完成：短暂展开摘要，3 秒后优雅收回
  - 等待签批：高亮红色脉冲，点击展开 Sign-off 卡片
- **🔔 通知**：汇聚后台任务完成通知、系统告警、Sensor 离线提醒（详见 §11.4）
- **⚙️ 设置**：唤起全局设置面板（API Key、Sensor 授权、Skill 学习开关等）
- **头像**：账户信息、登出、切换账号

### 7.3 中/右侧工作区 (Workspace Panels)

- **右侧对话面板**：任务的"指令输入舱"与"过程追踪器"
  - **Input Toolbar**：包含 **📎 附件**（选文档库文件或传本地临时文件）和 **@ 提及**（精准召唤特定文件、Sensor 或 Skill）
  - **Slash 命令**：`/` 触发已安装 Skill 列表（如 `/standup-brief`）
  - 所有任务状态（后台流转进度、结果通知）均**内联**在对话流中展示，不强制跳转
- **中间制品面板**：任务的"结果展示台"
  - 动态渲染生成的图表、文档或看板
  - 配备专属的 **Artifact Toolbar**：包含 `Export (导出)`（PDF/MD/剪贴板）、`Share (分享)`（推至飞书/内部分享）、`编辑/预览` 切换

> **In v1.5**：完整的左/中/右三栏 + 顶部灵动岛 + 多 Space 多窗口  
> **Out of v1.5**：可拖拽分栏、可分离面板、Pin to top 等高级窗口管理

---

## 8. 用户层与初始化配置 (User Layer & Onboarding)

### 8.1 三层资产架构（v1.5 关键架构升级）

v1.5 在原"Global / Space 双层"之间正式引入 **User 层**，形成三层资产架构。这一改动解决了 4 个关键痛点：Sensor 凭证一人一份的现实需求、个人风格 vs 公司知识的混淆、"提升为全局"的权属语义不清、跨 Space 的模板复用。

```
Tier 1 — Global  （KyberKit / IT 拥有，所有 User 共享）
  ├── KyberKit 官方 Skills（v1.6+ 预装的原子 Skills 落于此）
  ├── IT 推送的合规 Skills / Sensor 配置
  └── 平台 .env

Tier 2 — User   （"我"作为一个人的资产，跨 Space 持续）  ← v1.5 新增
  ├── 身份与配置：API Key / 模型 / 网关 / 偏好
  ├── 用户级 Skills（Layer 2 Fork 的默认落点，跨 Space 复用）
  ├── 用户级凭证池：Feishu OAuth / 数仓 token / 企微 cookie ……
  ├── 用户级模板：个人 PRD / 周报 / OKR 模板
  └── 跨 Space 审计聚合（v2.0+，本期占位）

Tier 3 — Space  （某个具体工作背景的资产，物理隔离）
  ├── docs/         业务文档
  ├── skills/       Space 私有 Skill（强场景化，如"贝易转专属"）
  ├── sensors.json  Sensor "订阅声明"（引用 User 层凭证，不存原始 token）
  ├── sessions/     会话历史
  └── learning/     Space 局部偏好（公司术语、KR 定义等）
```

**级联可见性原则**：在某 Space 内活动时，可见资产 = `Global ∪ User ∪ <current-space>`，三层并集。同名冲突时**更具体覆盖更通用**（Space > User > Global）。

> **In v1.5（H1–H5 全部纳入）**：物理目录三层骨架 + Skill 三级 scope + Sensor 凭证池（最小版） + 用户级模板（最小版） + "提升为用户级"操作  
> **Out of v1.5**：多账户切换、Sensor 订阅细粒度 GUI 审批、用户级模板的可视化管理、跨 Space 审计聚合视图（→ TODO-J）

### 8.2 用户层物理结构与凭证池契约

#### 8.2.1 物理目录布局

```
~/.kyberkit/
├── global/                            # Tier 1（KyberKit / IT 写）
│   └── skills/
├── users/
│   └── default/                       # Tier 2（v1.5 仅 default 单用户；目录骨架预留多用户扩展位）
│       ├── profile.json               # 用户身份与偏好
│       ├── config.enc                 # API Key / 模型 / 网关（替代旧 AppData 路径）
│       ├── skills/                    # 用户级 Skills
│       ├── credentials/               # Sensor 凭证池（加密存储）
│       │   └── feishu.oauth.enc
│       ├── templates/                 # 用户级模板（v1.5 仅文件级，无 GUI 管理）
│       │   ├── prd.md
│       │   └── weekly-report.md
│       └── audit/                     # 审计日志（原 ~/.kyberkit/audit/ 迁移至此）
│           └── <date>.jsonl
└── spaces/
    └── <space-id>/                    # Tier 3
        ├── docs/
        ├── skills/
        ├── sensors.json               # 仅声明订阅，不存原始凭证
        ├── sessions/
        └── learning/
```

> **路径变更说明**：v1.0 中存放于系统级 AppData（`~/Library/Application Support/...`）的用户配置，v1.5 起统一迁移到 `~/.kyberkit/users/default/config.enc`，与其他用户层资产同根。Tauri 仍可通过 `appDataDir()` API 间接访问，但物理路径归口于此。

#### 8.2.2 Sensor 凭证池契约

- **凭证文件**：`~/.kyberkit/users/default/credentials/<sensor-id>.<scheme>.enc`（如 `feishu.oauth.enc`）
- **Space 订阅声明**（`spaces/<id>/sensors.json` 片段）：

  ```json
  {
    "sensor_id": "feishu.task-board",
    "uses_credential": "feishu.oauth"
  }
  ```

- **Skill / Agent 调用链**：通过订阅句柄消费凭证，**永远拿不到原始 token**
- **v1.5 默认行为**：所有 Space 隐式订阅 User 层全部可用凭证（无需用户授权点击）
- **v2.0 升级路径**：Space 必须显式订阅 + GUI 授权审批

#### 8.2.3 用户级模板引用语法

- 在对话框中可通过 `@user:template-name` 引用 User 层模板
- 在 Skill 中可通过 frontmatter 字段 `kevin.templates: [user:prd, user:weekly-report]` 声明依赖
- v1.5 不提供模板 GUI 管理；用户通过文件系统直接放置模板文件

### 8.3 开发者与用户两层配置（Tier 1 + Tier 2 落点）

摒弃让普通用户手工编辑 `.env` 的高门槛做法。

- **开发者层 (`.env`，Tier 1)**：由 IT 团队控制平台级策略
  - `KYBER_MODEL_LIST`：公司允许接入的大模型清单
  - `KYBER_MODEL_DEFAULT`：默认选中模型
- **用户层 (GUI 写入到 Tier 2)**：用户仅需通过 UI 填入信息
  - 配置加密持久化于 `~/.kyberkit/users/default/config.enc`
  - 热重载生效，绝不明文覆写 `.env`

### 8.4 模型与网关接入策略

- **统一协议**：底层统一保持 **Anthropic SDK 接口**，**废弃 `KYBER_MODEL_PROVIDER`**。Anthropic SDK 通过 `ANTHROPIC_API_KEY` + `KYBER_MODEL_BASE_URL`（可选）+ `KYBER_MODEL_NAME` 三件套即可对接所有兼容网关（含 VolcEngine 等公司自建网关）
- **环境变量约定**：

  | 变量 | 层级 | 用途 |
  |---|---|---|
  | `ANTHROPIC_API_KEY` | 用户层（GUI 写入） | 用户密钥 |
  | `KYBER_MODEL_BASE_URL` | 用户层（GUI 写入，可选） | 自定义网关地址；不填则走 Anthropic 官方 |
  | `KYBER_MODEL_NAME` | 用户层（GUI 选择） | 用户当前选定的模型；从 `KYBER_MODEL_LIST` 中选 |
  | `KYBER_MODEL_LIST` | 开发者层（`.env`） | 公司允许的模型清单，用于渲染下拉框 |
  | `KYBER_MODEL_DEFAULT` | 开发者层（`.env`） | 首次 Onboarding 默认预选 |

- **内置预设**：开发者层 `.env` 中的 `KYBER_MODEL_LIST` 默认自带 `DeepSeek V4 Flash`、`MiniMax M2.5`、`Qwen 3.x`、`GLM-5`、`Kimi K2.5` 等预设组合，IT 团队可按需删改

### 8.5 首次启动向导 (Onboarding Wizard)

强制全屏展示极简初始化卡片，阻断进入主界面，直至验证通过：

1. **选择模型**：下拉框（由 `.env` 中的 `KYBER_MODEL_LIST` 动态渲染）
2. **输入 API Key**
3. *(可选展开)* **自定义接入地址**
4. **真实网络验证**：点击提交后，Sidecar 调用 `POST /config/validate` 发起真实 Ping 请求。仅当网络打通且 Key 有效时，方可进入主界面；失败则原位提示

完成后进入主界面的空 Space，展示一张"现在你可以做什么"的引导卡片，引导用户：
- 通过 `@` 选取文档库文件作为对话上下文
- 通过自然语言或 Slash 命令发起首个任务
- 在使用过程中触发 Skill Forge 蒸馏，沉淀属于自己的 Skill（详见 §12.3）

> **v1.5 不预装任何内置 Skill**。理由与替代方案见 §9。

### 8.6 多窗口配置同步

- **配置共享语义**：所有 Space 窗口读写**同一份 User 层配置**（`~/.kyberkit/users/default/config.enc`）。这是 §8.1 三层架构的自然推论——配置属于"我"，不属于某个工作空间
- 在任一窗口的 ⚙️ 设置中修改 → Sidecar 热重载 → 所有窗口实时生效
- **新增 API**：`POST /config` 写入后通过 SSE 广播给所有连接的前端窗口
- 凭证池同理：`~/.kyberkit/users/default/credentials/` 是单一真相源，所有 Space 窗口订阅同一份

> **In v1.5**：三层资产架构 + 用户层物理结构 + Sensor 凭证池（最小版）+ 用户级模板（最小版）+ Onboarding + 真实网络验证 + 多窗口配置同步  
> **Out of v1.5**：多账户切换、Sensor 订阅细粒度 GUI 审批、用户级模板的可视化管理、跨 Space 审计聚合视图（→ TODO-J）、团队级配置、SSO、配额管理

---

## 9. Skill 契约样板（Reference Designs）

### 9.0 v1.5 不预装内置 Skill — 设计变更说明

经研讨决定 **v1.5 不预装任何内置 Skill**。原因与后续路径如下：

- **避免错误的默认值**：站会 / PRD / 周报这类高度场景化的 Skill 涉及强公司假设（飞书、特定 OKR 模板、特定数据源），不同团队差异大，预装会带来"删不掉的坏默认"
- **强化 Forge 蒸馏的产品定位**：v1.5 的核心叙事是"用户用着用着，Skill 就被蒸馏出来了"。预装会稀释这个差异化体验
- **解耦外部依赖**：3 个示例 Skill 强依赖飞书 MCP（外部团队交付），不预装可让 v1.5 主版本不被外部依赖卡住

**v1.6+ 改预装"原子 Skill"**：以基础的、跨团队通用的原子能力为主，例如：

- `pdf-to-markdown` / `ppt-to-markdown` / `word-to-markdown`
- `dwh-query`（数仓 MCP 的通用查询封装）
- `csv-import-and-clean`（数据导入与清洗）
- ……

原子 Skills 是稳定的"乐高积木"，由各团队/用户自行组合（含通过 Forge 蒸馏复合 Skill）。

### 9.1 三大目标场景的 Skill 契约（设计示例）

> **以下三段 SKILL.md 在 v1.5 中作为 SKILL 体系的"契约示例蓝本"保留**，承担三个作用：
> 1. 为研发提供完整的 SKILL.md frontmatter 字段使用范例
> 2. 为后续 Forge 蒸馏的目标产物提供参照
> 3. 为有需要的团队提供"开箱即用的 Fork 起点"——可由 IT 团队按需手动放入 `~/.kyberkit/skills/`，不在主版本 Onboarding 中默认安装

#### 9.1.1 `standup-brief` — 站会数据简报

**SKILL.md 契约**：

```yaml
---
name: standup-brief
description: 当用户需要在每日站会前快速准备一份业务数据简报时使用。会自动跨飞书任务看板和数仓拉取昨日数据，输出含核心指标对比、任务进展摘要、3 条关键洞察的结构化简报。触发关键词：站会、晨会、昨日数据、业务简报。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
    - "cron:0 9 * * 1-5"
  sensors:
    required: [feishu.task-board]
    optional: [dwh.query, tracking.events, wechat-work.consult]
    fallback: csv-import
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---
```

- **执行逻辑**：自动识别"昨日"时间窗，提取核心指标
- **降级策略**：若 P1 Sensor（数仓/埋点/企微）未就绪或超时，对应数据块标注 `⚠️ 数据获取失败，可手动上传 CSV`，不阻断整体流程
- **输出物**：严谨的 Markdown 数据表 + 关键异动高亮 + 3 条洞察 + 1 条关注建议
- **Sign-off 触发**：仅当用户选择"推送到飞书"时（medium 风险）

#### 9.1.2 `prd-draft` — 运营方案 / PRD 起草

**SKILL.md 契约**：

```yaml
---
name: prd-draft
description: 当用户需要基于会议决策结论或既定输入，按照公司规范起草产品需求文档或运营方案草案时使用。会优先从文档库命中预设模板，强制结构化输出。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
  sensors:
    required: [local-fs.template]
    optional: [feishu.docs, prior-skill-output]
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---
```

- **执行逻辑**：必须在文档库中命中预设模板（强模板契约）；若缺失模板，强制要求用户补充，拒绝大模型自由散漫发挥
- **上下文衔接**：若当前会话包含 `standup-brief` 的输出，自动作为草稿背景注入
- **输出物**：标准格式的 PRD/方案文档 Artifact，支持 CenterPanel 局部微调，支持一键 Share 推送至飞书文档

#### 9.1.3 `weekly-report` — 周报生成

**SKILL.md 契约**：

```yaml
---
name: weekly-report
description: 当用户需要在周末根据个人 OKR 汇总整周系统数据与任务进展、生成绩效周报时使用。会自动框定本周时间范围，严格读取 OKR 文档中的 KR 目标值进行差值计算。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
    - "cron:0 17 * * 5"
  sensors:
    required: [local-fs.okr, feishu.task-board]
    optional: [dwh.query, tracking.events]
    fallback: csv-import
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---
```

- **执行逻辑**：自动框定本周时间范围；严格读取 OKR Markdown 文档中的 KR 目标值进行差值计算
- **OKR 格式约定**：需在文档库中提供 OKR Markdown 模板；若格式不符，提示用户修正而不是静默出错
- **输出物**：实际 vs 目标对比表 + LLM 归因分析 + 下周重点计划

### 9.2 共享基础设施优先级

支撑 Skill 体系（含上述示例契约的可选落地）的底座能力排期：

| 基础设施 | 优先级 | 责任方 | 说明 |
|---|---|---|---|
| **飞书 MCP Server** | 外部依赖 P0 | 外部团队 | 示例 Skill 全覆盖；若 ETA 延期，对应能力全部走 `csv-import` 降级 |
| **本地文件 MCP 增强** | 内部 P0 | Kevin 团队 | 支撑文档库树形结构、模板强匹配、多格式解析（PDF/XLS/Word） |
| **万能数据导入通道** | 内部 P0 | Kevin 团队 | 所有 P1 外部系统接口的临时降级护城河 |
| **数仓 / 埋点 / 企微 MCP** | 内部 P1 | Kevin 团队 | 尽力接入；任一未就绪 → 自动走 `csv-import` 降级 |

> **In v1.5**：SKILL.md 规范 + Forge 蒸馏 + 3 个示例契约（不预装）+ 本地文件 MCP 增强 + 万能数据导入通道；飞书 MCP 由外部团队交付  
> **Out of v1.5**：内置预装 Skill；业务系统级 Actuator（dispatch task / write CRM / 调整营销）；飞书任务看板的写入

---

## 10. HITL Sign-off 基础契约（新增 P0）

### 10.1 Actuator 风险分级

每个 Actuator 在注册时声明 `risk_level`，执行链路由系统按等级路由：

| Risk | v1.5 触发场景 | 执行链路 | UI |
|---|---|---|---|
| **low** | 仅本地 Artifact 生成（MD/HTML PPT/XLS） | 直接执行；写审计日志 | 无审批；进度条 |
| **medium** | 飞书文档写入 | 弹"Diff 预览 + 一键确认"卡片；60s 超时 → 入待签批队列 | Sign-off 卡片 |
| **high** | 业务系统配置变更（v2.0） | Dry-run + 详细 Diff + 双重确认（手动键入"confirm"） | （v2.0） |

### 10.2 Sign-off UI 契约

**触发位置**：三处同步提示，确保用户在任意视图都能感知到待签批：

1. **右侧对话面板**：内联展示完整 Sign-off 卡片
2. **顶部灵动岛**：红色脉冲提示"X 项任务等待签批"，点击展开列表跳转
3. **左侧会话历史**：对应会话行右侧出现红色脉冲圆点（见 §7.1D）；点击该会话直接跳转到 Sign-off 卡片所在位置

**卡片内容**（medium 级最小集）：

```
┌──────────────────────────────────────────────────────┐
│ ⚠️  即将执行：写入飞书文档                             │
│                                                      │
│  目标：飞书文档「Q2 站会简报 - 5月6日」                │
│  动作：创建新文档                                     │
│                                                      │
│  [预览内容]                                          │
│   # 5月6日站会简报                                   │
│   ## 核心指标                                        │
│   ...                                                │
│                                                      │
│  [✓ 确认执行]   [✗ 取消]   [✎ 编辑后再执行]           │
│                                                      │
│  60s 后自动入"待签批"队列                            │
└──────────────────────────────────────────────────────┘
```

### 10.3 超时与队列行为（D6 决策落地）

**60 秒未确认 → 自动入"待签批"队列**：
- 任务暂停在 `awaiting-signoff` 状态
- 在通知中心首位置顶展示
- 用户下次上线时（无论同窗口或其他 Space 窗口）灵动岛红色脉冲提示
- 用户可随时在通知中心展开签批 / 取消
- 队列任务无 TTL，除非用户主动取消

**审计日志**：所有 medium / high 级 Actuator 调用，无论是否签批通过，均落本地审计日志（`~/.kyberkit/users/default/audit/<date>.jsonl`，归属 User 层），含调用方 Skill、目标系统、动作摘要、用户决策、时间戳。跨 Space 聚合视图待 v2.0 实现（→ TODO-J）。

### 10.4 v1.5 Sign-off 范围

> **In v1.5**：风险分级机制 + low/medium 两档完整流程 + 审计日志  
> **Out of v1.5**：high 级双重确认流程、Sign-off 委托（让其他人代签）、Sign-off 策略模板

---

## 11. 异步任务生命周期 & 通知聚合（新增 P0）

### 11.1 任务生命周期状态机

```
[创建]
   ↓
queued ──────────→ running ──────→ awaiting-signoff ──→ completed
                       │                  │
                       ↓                  ↓
                    failed            cancelled
```

| 状态 | 含义 | UI 表现 |
|---|---|---|
| `queued` | 已入队，等待执行槽 | 自动化中心列出，灵动岛不显示 |
| `running` | 正在执行 | 灵动岛进度环 + 任务名 |
| `awaiting-signoff` | 等待用户签批（见 §10） | 灵动岛红色脉冲 + 通知中心首位 |
| `completed` | 执行完成 | 灵动岛 3 秒摘要 + 通知中心新条目 |
| `failed` | 执行失败 | 灵动岛 5 秒错误摘要 + 通知中心持久化 |
| `cancelled` | 用户主动取消 | 仅审计日志，UI 无明显提示 |

### 11.2 触发方式

| 触发方式 | v1.5 状态 | 说明 |
|---|---|---|
| **Manual** | ✅ P0 | 用户在对话中触发（自然语言或 `/skill-name`） |
| **Cron Schedule** | ✅ P0 | Skill frontmatter 中声明 `triggers: ["cron:..."]` |
| **Sensor Event** | ❌ v2.0 | Sensor 上报事件触发 Skill |

**Cron 调度引擎**：在 Sidecar 中由 `tokio-cron-scheduler` 或等效组件承载；调度命中后向当前 Space 推送任务到队列。

### 11.3 灵动岛展示形态

灵动岛是顶部 AppHeader 中央区域的智能感知组件，**v1.5 P0 必交付**。它有四种状态：

| 状态 | 视觉 | 内容 |
|---|---|---|
| 空闲 | 普通文本 | 当前会话标题（可点击编辑） |
| 执行中 | 蓝色脉冲 + 进度环 | `running` 任务名 + ETA |
| 待签批 | 红色脉冲 | "1 项任务等待签批" |
| 完成（瞬态） | 绿色短暂展开 | 任务名 + 一句话摘要 + "查看制品"按钮，3 秒后自动收回 |

**多任务并发**：若同时有 N 个 `running` 任务，灵动岛展示 `N 项任务进行中`，点击展开任务列表。

### 11.4 通知中心（🔔）聚合策略

通知中心承载所有需要持久化的事件：
- 后台任务完成 / 失败
- Sensor 健康状态变更
- 待签批任务（首位置顶）
- 系统告警

**聚合规则**：
- 同一 Skill 在 1 小时内的多次完成事件 → 折叠为一条"X 已完成 N 次"
- 同一 Sensor 的反复抖动 → 折叠为一条"X 在过去 1 小时连接异常 N 次"
- 红点角标 = 未读条目总数

### 11.5 跨 Space 通知归属（Q5-b 决策落地）

**核心原则**：**任务归属于创建它的 Space。**

- 用户在 Space A 触发的任务（无论手动还是 cron），其灵动岛进度、签批提示、完成通知**仅在 Space A 窗口展示**
- Space B 窗口的灵动岛与通知中心**完全不感知** Space A 的任务
- 这避免了多窗口下的重复弹窗与心智混乱
- 实现层面：每个 Space 窗口的前端只订阅 Sidecar 中归属本 Space 的事件流（按 `space_id` 过滤的 SSE channel）

> **In v1.5**：完整生命周期状态机 + Manual/Cron 触发 + 灵动岛 + 通知中心聚合 + Space 归属  
> **Out of v1.5**：Sensor Event 触发、跨 Space 通知 dashboards、Slack/邮件外发通知

---

## 12. Skill 体系与 Forge 蒸馏机制（新增，最核心）

> 本章是 v1.5 与所有竞品的核心差异化所在。Skill 不是"被定义出来"的，而是"被蒸馏出来"的。

### 12.1 SKILL.md 规范

#### 12.1.1 基础原则

- **格式**：Markdown 文件，顶部 YAML Frontmatter + 正文
- **兼容性**：完全兼容 Anthropic Skills 规范；可被 Claude Code / Claude Skills runtime 直接加载
- **必填字段**：仅 `name` + `description` 两项；其余按需扩展
- **Kevin 扩展**：所有 Kevin 特有字段统一放在 `kevin:` 命名空间下，Anthropic 生态见到自动忽略

#### 12.1.2 Frontmatter 字段全表

| 字段 | 必填 | 类型 | 来源 | 说明 |
|---|---|---|---|---|
| `name` | ✅ | string (kebab-case) | Anthropic 标准 | 小写连字符，最长 64 字符 |
| `description` | ✅ | string (max ~500 chars) | Anthropic 标准 | 自然语言描述"做什么 + 何时调用"。**这是 LLM 检索时的唯一信号源** |
| `license` | ◯ | SPDX id | Anthropic 标准 | 例如 `MIT` |
| `allowed-tools` | ◯ | string[] | Anthropic 标准 | 该 Skill 允许调用的 Actuator/工具列表 |
| `kevin.scope` | ◯ | `space \| user \| global` | Kevin 扩展 | Skill 所属层级；默认 `space`（参见 §12.6） |
| `kevin.risk` | ◯ | `low \| medium \| high` | Kevin 扩展 | 默认 `low` |
| `kevin.triggers` | ◯ | string[] | Kevin 扩展 | `manual` / `cron:...` / `sensor-event:...`（v2.0） |
| `kevin.sensors.required` | ◯ | string[] | Kevin 扩展 | 必需 Sensor；缺失则拒绝执行 |
| `kevin.sensors.optional` | ◯ | string[] | Kevin 扩展 | 可选 Sensor；缺失则降级 |
| `kevin.sensors.fallback` | ◯ | string | Kevin 扩展 | P1 Sensor 不可用时的降级方案（如 `csv-import`） |
| `kevin.templates` | ◯ | string[] | Kevin 扩展 | 引用 User 层或 Space 层模板（如 `[user:prd, user:weekly-report]`） |
| `kevin.learning.enabled` | ◯ | boolean | Kevin 扩展 | 默认 `true`（D3 决策） |
| `kevin.learning.share` | ◯ | `local \| network` | Kevin 扩展 | 学习数据共享范围；默认 `local`；`network` 对应 v1.6+ Layer 3 |
| `kevin.upstream` | ◯ | string | Kevin 扩展 | 若为 Fork 产物，记录原 Skill 的 `<id>@<version>` |
| `kevin.schema` | ◯ | path | Kevin 扩展 | 输出结构 Lint 校验文件路径 |

#### 12.1.3 完整示例

参见 §9.1–9.3 内置 Skill 的 frontmatter。

### 12.2 Skill 容器结构（三层 scope 落点）

```
~/.kyberkit/global/skills/                 # Tier 1: KyberKit/IT 写入；用户只读
└── pdf-to-markdown/                       # v1.6+ 预装的原子 Skills 落于此
    └── SKILL.md

~/.kyberkit/users/default/skills/          # Tier 2: 用户级 Skills（Layer 2 Fork 默认落点）
└── my-writing-style-prd/
    └── SKILL.md

~/.kyberkit/spaces/<space-id>/skills/      # Tier 3: Space 私有 Skills（Forge 蒸馏默认落点）
└── beiyizhuan-standup/                    # 例：高度场景化的 Space 专属 Skill
    ├── SKILL.md
    ├── schema.json
    ├── examples/
    │   └── 2026-05-04.md
    └── learning/                          # 系统写入：Layer 1 沉淀（跟随 Skill 物理位置）
        └── style-notes.md
```

#### 12.2.1 加载与冲突解决

- 启动时扫描三个目录，合并加载
- 同名冲突优先级：**Space > User > Global**（更具体覆盖更通用）
- 注入 system prompt 的 Skill 目录 = `Global ∪ User ∪ <current-space>` 三层并集
- "提升"操作（详见 §12.6）：
  - **提升为用户级**：物理移动 Space 本地副本 → `users/default/skills/`，原 Space 副本删除
  - **私有化** (User → Space)：拷贝（保留 User 层副本），独立演进
  - **系统全局（Tier 1）**：v1.5 不向用户开放，仅 IT 通过文件系统操作

### 12.3 Skill Forge — 蒸馏体系（v1.5 核心创新）

> **核心命题**：普通用户不需要"写 Skill"。用户在使用过程中只要把工作完成，Kevin 自动观察、识别、蒸馏出 Skill。

#### 12.3.1 蒸馏触发信号（D10 决策：P0）

| 信号 | 触发条件 |
|---|---|
| **复用模式探测** | 同一 Space 内 7 天滚动窗口中，语义相似的对话流 ≥ 3 次 |
| **结构化产出探测** | 用户连续两次产生稳定结构的 Artifact（且做过编辑） |
| **显式语句触发** | 用户对话中出现"以后都这样做 / 把这个流程记下来 / 每次 X 都要 Y"等模式 |
| **Slash 主动触发** | 用户输入 `/save-as-skill` |

#### 12.3.2 蒸馏过程

被触发后，LLM 拿到三类输入：
1. **本次会话完整轨迹**（用户提问 + 调用的 Sensor + 输出的 Artifact + 用户编辑 diff）
2. **同一 Space 中的同类历史会话**
3. **当前已安装 Skill 列表**（避免重复造轮子）

输出 SKILL.md 草案：
- `name`：从会话语义抽取动词性短语（kebab-case）
- `description`：自然语言概括"什么场景调用我"
- 正文：把会话中 Kevin 实际遵循的隐式 system 行为显式化
- 可选附件：从历史 Artifact 中提取稳定结构骨架 → `examples/`
- 进阶字段：识别会话中调用的 Sensor 自动写入 `kevin.sensors.required`；识别写入操作自动建议 `kevin.risk: medium`

#### 12.3.3 用户确认 UX

**Skill 必须经用户确认才落盘**，禁止系统在用户不知情的情况下创建。

```
┌──────────────────────────────────────────────────────┐
│ ✨ 我注意到你已经第 3 次让我做这件事了。              │
│   要不要把它存成一个 Skill，下次一句话就能调用？        │
│                                                      │
│   建议名称：site-traffic-analysis                    │
│   适用场景：当你需要分析网站流量异动时                  │
│   未来可通过 /site-traffic-analysis 调用              │
│                                                      │
│   [查看完整 SKILL.md]  [稍后再说]  [✓ 留下这个]       │
└──────────────────────────────────────────────────────┘
```

- 点"查看完整 SKILL.md"：右侧面板展开可编辑视图
- 点"稍后再说"：标记本次蒸馏建议被跳过，1 周内不再为同模式重复提示
- 点"✓ 留下这个"：写入 Space 本地 Skills 目录，立即可用

### 12.4 LearningLoop 自演进

#### 12.4.1 Layer 1 — 实例级隐式学习（默认开启，D3 可关闭）

- **采集**：每次 Skill 执行后，LLM 自动 diff "原始输出 vs 用户最终编辑版"
- **沉淀**：高频 diff 模式压缩为"User Style Notes"，写入 `learning/style-notes.md`
- **回灌**：下次同 Skill 调用时，自动作为 few-shot 拼接到 system prompt 末尾
- **用户感知**：灵动岛短暂提示"已记下您的修改偏好"
- **关闭路径**：⚙️ 设置 → "我的 Skills" → 单 Skill 关闭 / 整 Space 关闭 / 全局关闭三档

#### 12.4.2 Layer 2 — 用户级显式 Fork

- **触发**：当 Layer 1 的 style notes 累计 ≥ 5 条稳定模式 且 Skill 运行 ≥ 10 次 → 提示卡片
  > "这个 Skill 你已经修改过 12 次。要不要 Fork 一个『我的站会简报』，把这些偏好固化进去？"
- **Fork 时再次调用 Forge**：把 style-notes 蒸馏回 SKILL.md 主体，清空 learning/
- **默认落点**：Fork 产物默认写入 **User 层**（`~/.kyberkit/users/default/skills/`），即 `kevin.scope: user`——这意味着 Fork 后的 Skill 自动跨所有 Space 可用，符合"个人风格跟着我走"的产品直觉
- **版本管理**：Fork 后的 Skill 拥有独立版本号（SemVer）；frontmatter 增 `kevin.upstream: <original-skill-id>@<version>` 字段
- **演进时间线**：⚙️ 设置 → "我的 Skills" 中显示版本时间线，每个版本附"该版本来自哪条用户反馈"

#### 12.4.3 Layer 3 — 网络级回贡（D4 决策：v1.5 不含）

延后到 v1.6+。届时考虑：用户主动把私有 Fork 贡献回 KyberKit Skill Store；隐私字段自动脱敏；上游维护者 review 后 merge。

### 12.5 Skill 检索与渐进式披露（D11 + D15 决策）

**机制**：完全不引入 embedding / 向量检索；采用 Claude Code 风格的"系统提示词技能目录"。

#### 12.5.1 两层披露

```
[L1 索引层]
当前 Space 所有可见 Skill 的 (name + description) 全量注入 system prompt
↓
[LLM 自主选择]
基于自然语言匹配，决定是否调用 Skill
↓
[L2 完整层]
LLM 决定调用某 Skill 后，二次加载该 Skill 的完整 SKILL.md / examples / schema
```

#### 12.5.2 Token 经济性

- 每个 Skill 目录条目：~150 tokens
- v1.5 典型用户：3 内置 + ~10 蒸馏 = 13 个 Skills → ~2000 tokens 系统开销
- **退化策略**：当 Skill 数量 > 50，自动按"使用频次 Top-30 + 当前 Space 关键词预筛"截断目录

### 12.6 Skill 三级作用域与跨 Space 共享（D12/D14/D16 经 Rev2 修订）

> **重要修订**：v1.5 引入 User 层后，Skill 作用域从原"Space / Global"两级升级为 **Space / User / Global** 三级。原"提升为全局"按钮在用户侧改为"提升为用户级"；系统全局层（Tier 1）只对 IT 可写。

#### 12.6.1 三级 scope 定义

| `kevin.scope` | 物理位置 | 可见范围 | 可写主体 | 典型用例 |
|---|---|---|---|---|
| `space`（默认）| `spaces/<id>/skills/` | 仅当前 Space | 用户 + Forge | 高度场景化（如"贝易转专属站会简报"） |
| `user` | `users/default/skills/` | 该用户所有 Space | 用户 + Forge（Fork 默认落点） | 个人风格 / 跨项目通用 Skill |
| `global` | `global/skills/` | 所有用户所有 Space | **仅 IT**（v1.5 不向用户开放） | KyberKit 官方 Skills、IT 推送的合规 Skills |

#### 12.6.2 各情境的默认行为

| 情境 | 默认行为 |
|---|---|
| Forge 蒸馏出新 Skill | **存到产生它的 Space**（`scope: space`）——保留场景化 |
| Layer 2 Fork 升级 | **存到 User 层**（`scope: user`）——个人风格跟着我走 |
| 用户在 Skill Store"+ 新建私有 Skill" | 默认 Space；GUI 提供 scope 选择器（space / user） |
| KyberKit 官方 Skill 安装 | 落到 Global（`scope: global`），用户只读 |
| v1.6+ IT 推送的原子 Skills | 落到 Global，用户只读 |

#### 12.6.3 用户可执行的"提升 / 私有化"操作（D12/D16 修订版）

| 操作 | v1.5 行为 | 备注 |
|---|---|---|
| **Space → User**（提升为用户级） | 物理移动 `spaces/<id>/skills/X` → `users/default/skills/X`；**原 Space 副本删除** | 替代原"提升为全局"按钮 |
| **User → Space**（私有化复制） | 拷贝到 `spaces/<id>/skills/`；**保留 User 层副本** | 用于在 Space 内独立演进而不影响其他 Space |
| **User → Global** | **v1.5 不向用户开放** | v1.6+ 通过 Layer 3 网络回贡机制实现 |
| **Global → User**（KyberKit 官方 Fork） | 拷贝到 `users/default/skills/`；保留全局原版 | 为用户调整官方 Skill 的入口 |

### 12.7 Skill Store v1.5 形态（D5 决策：B 方案）

CenterPanel 中的 Skill Store 以 Tab 切换：

| Tab | 内容 |
|---|---|
| **公共 Skills** | KyberKit 官方 Skill 列表，只读浏览 + 一键安装 |
| **我的 Skills** | 当前 Space 已安装 + 全局 Skills，可见演进时间线、Fork 历史；右上角 `[+ 新建私有 Skill]` 按钮（GUI 表单从零创建） |

每个 Skill 卡片展示：图标、`description`、Sensor 依赖、Actuator 风险等级、累计运行次数、版本号。

> **In v1.5**：SKILL.md 规范 + Forge 蒸馏（4 类触发）+ Layer 1/2 演进 + 系统提示词技能目录 + Skill Store B 形态 + 3 内置 Skills 自动安装  
> **Out of v1.5**：Layer 3 网络回贡、向量检索、Skill 评分/订阅、Skill 编排（Skill-of-Skills）、Sensor-event 触发

---

## 13. 多窗口与多 Space 协同（Q5 决策汇总）

### 13.1 窗口模型

- **1 个 App 进程 = N 个 Space 窗口**：每个 Space 启动独立的 Tauri WebView 窗口
- **Sidecar 多 Session**：Sidecar 单进程承载多 Space 的 Session 状态，按 `space_id` 路由
- **底层 KyberKit 是否多实例**：单独的技术议题，参见 §16 TODO-B

### 13.2 跨窗口同步策略

| 资源 | 策略 |
|---|---|
| 用户配置（API Key / 模型 / 网关） | **跨窗口实时同步**（Sidecar 持有全局态，SSE 广播变更） |
| 全局 Skills | **跨窗口共享**（同一文件系统位置） |
| Space 本地 Skills | 仅本 Space 窗口可见 |
| 后台任务 | **归属创建它的 Space**，仅该窗口接收事件 |
| 通知 / 灵动岛 | 仅显示本 Space 的事件 |

### 13.3 macOS Dock 与系统集成

- **Dock 图标**：聚合为单图标（类似 macOS Notes 多窗口）
- **窗口列表**：右键 Dock 图标展示当前所有 Space 窗口
- **快捷键**：`Cmd+\`` 在 Kevin 的所有窗口间循环切换（macOS 原生行为，无需自定义）

> **In v1.5**：多窗口 + 配置同步 + 任务归属 + Dock 聚合  
> **Out of v1.5**：跨窗口拖拽内容、窗口分组、窗口模板

---

## 14. v1.5 In / Out 与依赖矩阵

### 14.1 v1.5 范围总表

| 能力             | In v1.5                                        | Out / Roadmap                                  |
| -------------- | ---------------------------------------------- | ---------------------------------------------- |
| **资产架构**       | **三层（Global / User / Space）骨架完整**              | 多账户切换、跨 Space 审计聚合（TODO-J）                     |
| GUI 三态         | 重度态 + 异步态 + 签批态                                | 独立轻量态 GUI（v1.6+ 改 IM 嵌入）                       |
| Sensor 接入      | 飞书 / 数仓 / 埋点 / 企微 / 本地 FS                      | 业务系统读、监控告警                                     |
| Sensor 凭证管理    | User 层凭证池（最小版） + Space 默认全订阅                   | 细粒度订阅 GUI 审批、凭证轮换告警                            |
| Actuator 白名单   | 4 个（MD / HTML PPT / XLS / Feishu Doc Write）    | 业务系统写、营销下发等                                    |
| Sign-off 风险等级  | low + medium 完整                                | high 双重确认                                      |
| 异步任务触发         | manual + cron                                  | sensor-event                                   |
| 灵动岛            | 4 状态完整                                         | 多任务详细面板、自定义动画                                  |
| Skill 三级 scope | space / user / global 三级 + 提升 / 私有化操作          | 用户写入 Tier 1 Global（→ Layer 3）                  |
| Skill 蒸馏       | 4 类信号触发 + Layer 1/2 演进（Fork 默认落 User 层）        | Layer 3 网络回贡                                   |
| Skill 检索       | 系统提示词目录（三层并集）                                  | 向量检索（Skill > 50 时退化策略）                         |
| Skill Store    | B 形态（公共只读 + 我的可写）                              | 评分 / 订阅 / 上传                                   |
| 内置 Skills      | **0 个**（提供 3 个契约示例蓝本，IT 可手动放置）                 | v1.6+ 预装原子 Skills（pdf/ppt/word→md、dwh-query 等） |
| 用户级模板          | 文件级 `users/default/templates/` + `@user:` 引用语法 | 模板 GUI 管理、模板分享                                 |
| 历史会话           | Codex 式行布局 + 置顶/存档 + 折叠 + 签批提醒标记               | 按日期分组、标签、搜索高亮                                  |
| 多窗口            | Space = 独立窗口、Dock 聚合、Cmd+`                     | 跨窗口拖拽                                          |
| 配置             | 三层资产架构 + 真实验证 + 多窗口同步（共享 User 层 config.enc）    | 团队级、SSO、配额                                     |
| 文档库            | 自动归档采用"建议路径 + 一键采纳"                            | 全自动归档（待行为数据足够后升级）                              |
| 边缘节点能力         | 本地沙箱 + 无头浏览器                                   | 私有上下文脱敏（TODO-F）、端侧模型                           |
| 模型协议           | Anthropic SDK 一统 + 可指定网关 BaseURL               | OpenAI 兼容协议（不再支持）                              |

### 14.2 依赖矩阵

| 依赖 | 责任方 | 优先级 | 风险 | 兜底 |
|---|---|---|---|---|
| 飞书 MCP Server | 外部团队 | P0 | ETA 不确定 | 全部走 csv-import 降级 |
| 本地文件 MCP 增强（多格式） | Kevin 团队 | P0 | 中（PDF/XLS 解析复杂度） | 仅支持 MD 起步，PDF/XLS 增量交付 |
| 万能数据导入通道 | Kevin 团队 | P0 | 低 | — |
| Cron 调度引擎 | Kevin 团队 | P0 | 低 | — |
| 数仓 / 埋点 / 企微 MCP | Kevin 团队 | P1 | 中 | csv-import |
| KyberKit 多实例（TODO-B） | 技术评审待开 | 待定 | 高（架构层面） | 单实例多 Session 起步 |

---

## 15. 验收标准 & 北极星指标 (DoD)

### 15.1 北极星指标（v1.5 上线 4 周后回看）

| 指标 | 目标值 | 测量方式 |
|---|---|---|
| Onboarding 完成率 | ≥ 90% | 启动 Wizard 用户中通过验证进入主界面的比例 |
| 周活跃任务数 | 人均每周 ≥ 5 次 | manual + cron 触发的任务总数 / 周活跃用户 |
| Skill Forge 触发率 | 周活跃用户中 ≥ 40% | 至少触发过一次"✨ 蒸馏建议"卡片的用户占比 |
| Skill Forge 接受率 | ≥ 30% | 蒸馏建议卡片中点"留下这个"的比例 |
| 异步任务成功率 | ≥ 95% | `completed` / (`completed` + `failed`) |
| Sign-off 中位响应时间 | ≤ 30s | medium 级签批从弹出到用户决策的中位耗时 |
| Sensor 健康可见性 | 100% | 所有已接入 Sensor 在状态区有明确状态灯 + 失败原因可读 |
| Skill 演进发生率 | ≥ 20% | 累计 Layer 1 触发 ≥ 5 次的 Skill / 用户全部已安装 Skill |

### 15.2 关键场景验收用例

#### 15.2.1 Skill 体系（必通过）

- ✅ 用户在 Space 内对话 3 次执行语义相似的工作（如"分析昨日数据 → 写简报"）→ 触发 Skill Forge 蒸馏建议卡片
- ✅ 用户点击"✓ 留下这个"→ Space 本地 `skills/` 目录写入正确的 SKILL.md（含 `name` + `description` 必填，frontmatter 由 LLM 蒸馏）
- ✅ 已安装 Skill 通过 `/skill-name` Slash 命令成功调用
- ✅ Skill 执行后用户编辑输出 → `learning/style-notes.md` 写入 diff 模式
- ✅ Layer 1 累计 ≥ 5 条 + Skill 运行 ≥ 10 次 → 弹出"是否 Fork"卡片
- ✅ Fork 操作 → 新版本号 + `kevin.upstream` 字段正确填充 + `learning/` 清空
- ✅ "提升为全局" → 文件物理移动到 `~/.kyberkit/skills/`，Space 本地副本删除
- ✅ Anthropic 官方 Skill（如开源 `code-review` Skill）零修改导入 Kevin → 按默认值自动补全 `kevin.*` 字段并可正常调用

#### 15.2.2 Sign-off 与异步任务（必通过）

- ✅ low 风险任务（生成本地 MD）→ 直接执行，无审批弹窗
- ✅ medium 风险任务（写飞书文档）→ 三处提示（对话面板 + 灵动岛 + 左侧会话标记）同步出现
- ✅ medium 签批 60s 未确认 → 自动入"待签批"队列，通知中心首位置顶
- ✅ Cron 触发的异步任务（如周五 17:00 周报）→ 灵动岛进度环 → 完成后 3 秒摘要 + 通知中心新条目
- ✅ 跨窗口测试：Space A 触发任务，Space B 窗口的灵动岛与通知中心**完全不感知**
- ✅ 所有 medium 级 Actuator 调用均落 `~/.kyberkit/audit/<date>.jsonl` 审计日志

#### 15.2.3 示例 Skill 契约（IT 手动放置后必通过）

> 验证示例契约的工程可行性。以下用例在 IT 团队手动把示例 SKILL.md 放入 `~/.kyberkit/skills/` 后执行。

**`standup-brief`**：
- ✅ 飞书 + 数仓全在线 → 输出完整 Markdown，符合 schema
- ✅ 数仓离线 → 对应数据块标 ⚠️，整体仍输出
- ✅ 飞书离线 → 拒绝执行并提示用户补救

**`prd-draft`**：
- ✅ 文档库无模板 → 拒绝执行，强制要求用户补充
- ✅ 文档库有模板 + 接 standup-brief 上下文 → 自动注入背景

**`weekly-report`**：
- ✅ 周五 17:00 cron 自动跑通完整链路
- ✅ OKR 文档格式异常 → 提示用户修正

### 15.3 工程契约清单

研发开工前需完成：
- `SKILL.md` 完整 schema 定义（含所有 frontmatter 字段的 JSON Schema，含 `kevin.scope` 三级值）
- 3 个示例契约（`standup-brief` / `prd-draft` / `weekly-report`）的完整 SKILL.md + schema.json + examples/，作为研发参考样板与 IT 手动安装包
- 三层资产架构的物理路径常量与目录初始化器（含 `~/.kyberkit/users/default/` 各子目录的 schema 与默认值）
- Sensor 凭证池的加密格式契约（`<sensor-id>.<scheme>.enc`）
- Skill 三级 scope 的加载器（扫描三个目录、合并、按 Space>User>Global 解决冲突）
- "提升为用户级 / 私有化复制" 的物理迁移逻辑
- Sidecar 新增 API：`/skills`、`/skills/forge/suggest`、`/skills/promote`、`/tasks`、`/signoff/<id>`、`/audit`、`/config/validate`、`/credentials`
- SSE 通道按 `space_id` 隔离的实现规范
- 灵动岛 4 状态的视觉规范（设计稿）
- 历史会话区 Codex 式布局的视觉规范（含置顶/存档/签批标记三态）
- v1.0 配置数据从旧 AppData 路径迁移到 `~/.kyberkit/users/default/config.enc` 的兼容脚本

---

## 16. 待研讨技术议题（TODO）

| ID         | 议题                                                | 责任方      | 备注                                                      |
| ---------- | ------------------------------------------------- | -------- | ------------------------------------------------------- |
| **TODO-A** | KyberKit 多实例架构决策                                  | 拉技术评审会   | Tauri WebView × N + Sidecar 单进程已定；底层 KyberKit 是否需要多实例待定 |
| **TODO-B** | Skill Forge 复用模式探测的具体算法                           | Kevin 团队 | 简单方案：会话语义聚类（基于 LLM 直接判断）；进阶方案：N 天滚动窗口的相似度阈值             |
| **TODO-C** | 文档库自动归档"建议路径"的算法                                  | Kevin 团队 | v1.5 起步用 LLM 推荐 + 用户确认；后续累积行为数据后考虑自动化升级                 |
| **TODO-D** | 飞书 MCP 外部团队 ETA 锁定                                | 跨团队对齐    | 影响示例 Skill 真实接入度，亦决定 v1.6+ 原子 Skills 的优先级排序             |
| **TODO-E** | Skill `learning/` 目录的隐私边界（涉密 Space 是否应禁止 Layer 1） | 法务/安全评审  | D3 已支持用户关闭，但企业默认策略待定                                    |
| **TODO-F** | 私有上下文脱敏机制的具体形态（§5 第 2 项）                          | 安全 + 产品  | v2.0 范围；本期仅占位                                           |
| **TODO-G** | Sensor 状态展开详情的完整交互形态                              | 产品 + 设计  | v1.5 仅承诺基础三件套（失败原因 / 上次成功时间 / 一键重连）；展开浮层、历史曲线、告警订阅等待评估   |
| ~~**TODO-H**~~ | ~~是否引入"用户层"于 Space 之上~~ | ✅ 已决议 | **2026-05-06 下午确认 H1–H5 全部纳入 v1.5**；详见 §8.1–8.2 三层资产架构 |
| **TODO-I** | v1.6+ 原子 Skill 清单与优先级排序                          | Kevin 团队 | 候选：pdf-to-md / ppt-to-md / word-to-md / dwh-query / csv-import-and-clean；需用户调研支撑 |
| **TODO-J** | 跨 Space 审计聚合视图（v2.0+）                            | 安全 + 产品  | 单租户基础已就位（User 层 `audit/` 目录）；GUI 与查询能力 v2.0 落地；企业治理视图 v2.0+ |

---

## 17. 演进路线（v1.5 之后的视野）

> 仅做方向预告，不构成本期承诺。

- **v1.6**
  - 预装"原子 Skills"（pdf/ppt/word→md、dwh-query、csv-import-and-clean 等通用乐高积木，详见 TODO-I）
  - 轻量态以企微 / 飞书 IM 嵌入形态落地（@Kevin 触发 + 卡片式回流）
  - Skill Layer 3 网络回贡 + Skill Store 评分订阅
  - Sensor-event 触发
- **v2.0**：High-risk Actuator 双重确认 + 业务系统级 Actuator（CRM/BOSS/营销下发）+ 私有上下文脱敏 + 团队级配置 / SSO / 配额
- **v2.5**：端侧基础模型集成 + 离线 OCR/语音 + 跨设备 Space 同步

---

## 附录 A. 与 Anthropic Skills 规范的兼容性声明

Kevin v1.5 的 SKILL.md 完全兼容 Anthropic Skills 规范：

- 顶层 frontmatter 的 `name` / `description` / `license` / `allowed-tools` 字段语义一致
- Anthropic 生态（Claude Code、Claude Skills runtime）可直接加载 Kevin 的 SKILL.md，自动忽略 `kevin:` 命名空间下的扩展字段
- Anthropic 官方 Skills 可零修改导入 Kevin，按以下默认值补全 Kevin 扩展：
  - `kevin.risk = low`
  - `kevin.triggers = [manual]`
  - `kevin.sensors = {}`
  - `kevin.learning.enabled = true`

---

## 附录 B. 关键决策追溯（研讨过程归档）

本 PRD 基于 2026-05-06 产品研讨会做出以下 22 项关键决策：

**Q 系列（产品范围）**：
- Q1 Actuator 范围收敛：仅 4 个白名单
- Q2 Skill 体系必须 v1.5 落地
- Q3 异步任务 P0
- Q4 三大场景全部交付
- Q5 多窗口完整方案
- Q6 飞书 MCP 外部团队负责

**D 系列（Skill 体系细节）**：
- D2 Skill = 文件夹
- D3 Layer 1 默认开启可关闭
- D4 Layer 3 不进 v1.5
- D5 Skill Store B 形态
- D6 Sign-off 超时入队
- ~~D7 内置 Skills 自动安装~~ → **已被 Rev2 精修覆盖**：v1.5 不预装任何 Skill；v1.6+ 改预装"原子 Skills"。详见 §9.0
- D8 Frontmatter 由 Forge 蒸馏
- D9 必填 = name + description
- D10 复用模式探测 P0
- D11 不引入 embedding，CC-style 目录
- ~~D12 默认 Space 本地，可提升为全局~~ → **Rev2 修订**：Skill 升级为三级 scope（space / user / global）；用户操作改为"提升为用户级"，全局层仅 IT 可写
- D13 兼容 Anthropic Skills 规范
- ~~D14 Kevin 扩展用嵌套命名空间~~ → **Rev2 增补**：新增 `kevin.scope`、`kevin.templates`、`kevin.upstream`、`kevin.learning.share` 字段
- D15 不引入向量检索
- ~~D16 提升为全局后删除 Space 副本~~ → **Rev2 修订**：改为"提升为用户级后删除 Space 副本"；User → Global 用户不可写

**Rev2 精修阶段新增的产品决策（2026-05-06 下午）**：

- **第一轮精修**（§6 / §8.2 / §9 / §7.1 / §10.2）：
  - §6 轻量态延后到 v1.6+ 改 IM 嵌入形态（取代独立 GUI）
  - §8.4 模型协议保持 Anthropic SDK 一统（不切 OpenAI 兼容）
  - §9.0 v1.5 不预装 Skill；3 个示例契约仅作为蓝本保留；v1.6+ 改预装原子 Skills
  - §7.1D 历史会话采用 Codex 式行布局 + 置顶/存档 + 6 条折叠 + 签批提醒标记
  - §10.2 Sign-off 提示新增"左侧会话历史标记"，形成三处同步提示

- **第二轮精修（H 系列：用户层架构升级）**：
  - **H1** v1.5 引入显式的用户层物理目录（`~/.kyberkit/users/default/`）
  - **H2** Skill 升级为三级 scope（space / user / global）
  - **H3** Sensor 凭证池最小版落地（User 层存凭证 + Space 默认全订阅）
  - **H4** "提升为全局"按钮改为"提升为用户级"，修复权属概念坑
  - **H5** 用户级模板库最小版落地（`templates/` 目录 + `@user:` 引用语法）

---

*版本备注：Kevin v1.5 PRD Rev2 — 2026-05-06 产品研讨正式产出，同日下午两轮精修（GUI/Skill 范围 + 用户层架构）。*

MEMO：
剩下的 TODO 列表（A/B/C/D/E/F/G/I/J）都是 v1.5 不会被卡住的"延展性议题"，可以并行处理：

1. 如果要立刻进研发：建议我抽取一份 [`skill-architecture.md`](vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/docs/specs/kevin1.5/skill-architecture.md) 作为研发独立领取的工程契约，承载 SKILL.md 完整 schema、三层 scope 加载逻辑、Forge 蒸馏 API、签批流程的状态机
2. 如果要先做 Sprint 切片：我可以基于 §14.2 依赖矩阵给出 4–6 个 2 周 Sprint 的拆分建议（按 P0 → P1 → 集成测试 → 内测）
3. 如果要补一份索引：给 [`docs/specs/kevin1.5/`](vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/docs/specs/kevin1.5/) 加一份 README，类似 [kevin1.0/README.md](vscode-file://vscode-app/Applications/Cursor.app/Contents/Resources/app/out/vs/code/electron-sandbox/workbench/docs/specs/kevin1.0/README.md) 的形式
4. TODO-A（KyberKit 多实例）的技术评审准备：我可以列一份"多实例 vs 多 Session 的 5 个决策依据"作为评审会输入