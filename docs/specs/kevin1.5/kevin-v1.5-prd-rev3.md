# Kevin v1.5 产品需求文档 (PRD) — Rev3

> **版本关系**  
> - 本文档（**Rev3**）在 **Space / Library / 本地存储模型 / KyberKit 边界** 上 **取代** [`kevin-v1.5-prd-rev2.md`](./kevin-v1.5-prd-rev2.md) 的对应叙述。  
> - **未在本文件中重述的章节**（愿景、Sensor/Actuator、GUI 细节、Skill 体系、Sign-off、异步任务、验收指标正文等）**仍以 Rev2 全文为准**，并与下文 **术语与架构修订** 一并阅读；若有冲突，**以 Rev3 为准**。  
> - 原文档定位：Rev2 = v1.5 工程化交付的「主本」；Rev3 = **2026-05-08 架构变更补丁本** + 继承关系说明。

---

## Rev3 版本说明（2026-05-08）

### 变更动因

1. **分离 KyberKit Agent 默认工作区与 Kevin 产品数据**：`KYBER_SPACES_ROOT` 仅服务 KyberKit 通用 Agent/CLI 场景，**不**再作为 Kevin 桌面内「文档库 / 用户工作目录」的依据。  
2. **区分 Workspace（技术资产）与 Library（用户文档与制品）**：前者对用户多为不可见的基础设施；后者为用户选定或挂载的**本地工作文件夹**。  
3. **分布式、本机节点模型**：摒弃「单一中心节点保管全部技术资产」的叙述；每台运行 Kevin 的 PC 即一个节点，**仅存放本用户数据**。  
4. **Space 与 Library 关系**：**一对一**绑定；**Space id 全面 UUID 化**；会话列表**仅展示当前 Library（当前 Space）下的会话**。  
5. **Agent 与 UI 路径一致**：采用 **请求级上下文（策略 A）**，使 builtin / MCP 文件访问根与「当前 Library 挂载路径」一致；**Space 维度的深度改造**在后续专题中单独立项，本文档只锁定边界与原则。  
6. **迁移**：产品尚未正式发布，**不考虑旧版目录迁移**，新版本从零创建即可。

### Rev3 相对 Rev2 被取代或修订的条款对照

| Rev2 位置 | Rev3 处理方式 |
|-----------|----------------|
| §0 术语表中 Space / 文档库相关定义 | **本文 §0 全文取代** |
| §7.1.B 文档库区「KyberKit Workspace」叙述 | **本文 §3、§7 修订取代**（改为 Library 挂载 + Kevin 节点路径） |
| §8.1–§8.2 三层资产与 `~/.kyberkit/spaces/<id>/docs` 物理布局 | **本文 §4、§5 取代 Tier3「docs 在 KYBER_HOME/spaces」为中心节点的表述**；Tier1/Tier2 中「用户配置」落点迁移见 §5 |
| §13 `space_id` 语义（字符串 slug） | **本文 §6**：`space_id` 为 **UUID** |
| §14 资产架构一行 | **本文 §8** 补充 |

---

## 0. 术语表 (Glossary) — Rev3 修订版

| 术语 | 定义 |
|------|------|
| **Kevin** | KyberKit 智能 Agent 网络的桌面终端与本机**边缘节点**（每台 PC 独立存储本用户数据）。 |
| **KyberKit Agent** | 通用智能体运行时；其**未指定工作区时**的默认盘符根由 **`KYBER_SPACES_ROOT`**（及 `KYBER_USER_NAME` / `KYBER_WORKSPACE_ID`）解析，**与 Kevin 产品内的 Library 挂载无默认耦合**。 |
| **Space** | **仅表示会话 / 自动化 / 任务**等**上下文隔离边界**的标识符。**Space id 必须为 UUID**。每个 Space 与 **恰好一个 Library 一对一绑定**。 |
| **Library** | 用户在创建或编辑时**指定或挂载的本地文件夹**，用于存放**工作文档与制品**；系统将该路径与 **`libraryId`（UUID）** 关联。**可变显示名**不得用作稳定主键。 |
| **Library 挂载路径** | 用户所选目录的绝对路径；Kevin 桌面内 **builtin 文件工具与 MCP filesystem（若启用）的有效根**应与此路径 **一致**（通过请求级上下文注入，见 §3）。 |
| **Kevin 用户层（节点用户层）** | 存放在 **`~/.kyberkit/kevin/`** 下的本用户数据：**API Key、全局 Skill、与本节点相关的全局配置**等（详见 §5）。 |
| **Kevin Library 层（按库技术资产）** | 存放在 **`~/.kyberkit/kevin/lib-<libraryId>/`** 下的、**仅属于该 Library** 的技术资产（例如 **对话记录 / 会话数据库**、索引与缓存等）。 |
| **Sensor** | 数据感知/接入能力（飞书、数仓、埋点、CLI…）。 |
| **Actuator** | 数字/物理执行能力。 |
| **Artifact** | Agent 产出的业务制品；默认归档语义指向 **当前 Library 挂载目录**（具体子路径策略可与 §15 工程契约对齐）。 |
| **Skill** | 可复用的能力封装单元。全局 Skill 与用户级 Skill 的物理落点以 §5 为准；与 Rev2 Skill 章节兼容处仍以 Rev2 为准。 |
| **灵动岛** | 顶部菜单栏中央的智能感知组件。 |

---

## 1. 架构原则摘要

1. **节点模型**：每台 PC = 一个 Kevin 节点；**不**假设存在单一中心化服务器保管用户技术资产。  
2. **两层 Kevin 路径**：  
   - **用户层**：`~/.kyberkit/kevin/`  
   - **Library 层**：`~/.kyberkit/kevin/lib-<libraryId>/`  
3. **Space ↔ Library**：**一对一**；切换 Space 即切换绑定在该 Space 上的 Library 上下文。  
4. **会话列表**：**仅展示**绑定到 **当前 Space 对应 Library** 的会话。  
5. **`KYBER_SPACES_ROOT`**：**不在 Kevin 桌面产品的默认路径解析链中使用**；文档库与对话技术落盘不默认依赖该变量。其用途限定为 **非 Kevin 场景**（例如纯 CLI、自动化脚本、无 Library 概念的 KyberKit 调用）。  
6. **Agent 与文档一致**：Kevin 内 **builtin `read_file` / `write_file` 等**以及 **MCP 本地文件服务**的可读写根，应与 **当前 Library 挂载路径**一致（**策略 A：请求级上下文**，在每请求或每会话上下文中注入 `libraryId` → `mountPath` → 沙箱允许路径 / MCP root）。

---

## 2. `KYBER_SPACES_ROOT` 在 Kevin 桌面内的命运

| 场景 | `KYBER_SPACES_ROOT` |
|------|---------------------|
| Kevin 桌面（Tauri / 连 Sidecar 的 UI） | **不用于**解析用户文档库根、**不用于** Kevin 默认会话存储路径。 |
| KyberKit CLI / 无 Library 的 Agent 作业 | **可使用**，表示 Agent 默认 workspace 根。 |
| 研发本地 `.env` | 仍可配置，与 Kevin 用户数据 **脱钩**。 |

**Agent 侧文件访问（Kevin 内）**：以 **当前 Library 挂载路径** 为有效工作区根（及策略 A 注入的允许路径）；**不得**默认落到仅由 `KYBER_SPACES_ROOT` 决定的目录而使 UI 文档树与工具读写分叉。

---

## 3. Workspace（技术资产）与 Library（用户文档库）

| 概念 | 含义 | 典型内容 | 用户可见性 |
|------|------|----------|------------|
| **Workspace（产品语义）** | 绑定在 Space 上的 **运行时与持久化技术上下文** | 会话与对话持久化、索引、与 Library 绑定的技能覆盖等 | **一般用户不可见**（设置 / 诊断入口可展示路径） |
| **Library** | 用户 **指定或挂载的本地文件夹** | 工作文档、用户制品、Agent 输出归档（规则内） | **主要可见**，侧栏文档树即展示该挂载目录 |

**创建 Library 的 UX（首次与后续）**：

- **必须绑定本地文件夹**后，Library 才视为创建完成。  
- 允许向导提供 **「建议使用路径」**（如 `~/Documents/Kevin Libraries/<显示名或短前缀>/`），用户一键确认即视为已选择路径；**不允许**无挂载路径的「空 Library」，除非未来单独定义一种不包含文档库的产品形态（不在 Rev3 范围）。  
- **Onboarding 推荐路径**：首次进入 → 完成模型与 Key → **创建首个 Space 的同时创建首个 Library 并选择/确认挂载路径** → 再进入主界面。

---

## 4. Space 与 Library：标识与绑定

| 规则 | 说明 |
|------|------|
| **Space id** | **UUID**，禁止使用 `default`、slug 作为主键。 |
| **Library id（libraryId）** | **UUID**；显示名可改，**不得**作为存储路径或主键。 |
| **绑定关系** | **一对一**：每个 Space **独占**一个 Library；每个 Library **在同一时刻只属于一个 Space**（是否允许 Library 被重新绑定到新 Space 可作为实现细节，默认不推荐）。 |
| **会话归属** | 每条会话必须携带 **`libraryId` 或 `spaceId`**（二者可由一对一映射推导）；列表查询 **按当前 Space → Library** 过滤。 |
| **API / URL** | 统一使用 **`space_id=<UUID>`**；不再依赖「default 省略 query」惯例。 |

---

## 5. 本机存储布局（Rev3）

### 5.1 Kevin 用户层（节点用户）

路径：**`~/.kyberkit/kevin/`**（默认；可通过 **用户可配置项「Kevin 产品根」** 覆盖，详见工程契约）。

建议包含（示例，具体文件名以实现为准）：

- 加密配置（API Key、模型、网关等与 Rev2 用户层意图一致的能力）  
- **全局 Skill** 存放位置（与 Rev2「用户级 skills」概念对齐时，以「Kevin 用户层」为优先落点）  
- 与本节点相关的 `profile`、审计（若仍保留用户级审计）

### 5.2 Kevin Library 层（按库）

路径：**`~/.kyberkit/kevin/lib-<libraryId>/`**

用于该 Library 的**技术资产**，包括但不限于：

- **对话记录 / 会话 SQLite（或等价存储）**  
- 该 Library 的索引、缓存、临时导出  

**用户工作文档与制品**本身存放在 **Library 挂载路径**（用户所选磁盘目录），**不强制**复制到 `lib-<id>`；`lib-<id>` 仅放「库级技术元数据」。

### 5.3 与 Rev2「Tier 1 / Tier 2 / Tier 3」的关系

- **全局官方 Skill（Tier 1）**：仍可沿用 Rev2 的 `KYBER_HOME/global/skills` 或由安装器下发；**与 Kevin 用户层并存的优先级**在实现层定义（建议：官方只读 + 用户层可覆盖）。  
- **用户凭证池、模板等（原 Tier 2）**：逻辑上归属「用户」；物理路径 **优先收敛到 `~/.kyberkit/kevin/`**（Rev3），与旧 `~/.kyberkit/users/default/` 并存问题由工程阶段清理（未发布前可只实现新路径）。  
- **原 Tier 3「Space 下 docs/」作为唯一文档根**：**Rev3 终止该表述作为用户文档来源**；用户文档 **仅** 来自 **Library 挂载目录**。原 Space 技术附属（如 `sensors.json`、Space 级 skill）若保留，应明确落在 **`lib-<libraryId>/` 或挂载目录下受控子目录**，并在工程文档中单点定义。

---

## 6. Sidecar、路由与 `space_id`

1. 所有需隔离资源的 Sidecar API（会话列表、任务、签批、SSE、文档树等）须携带 **`space_id=<UUID>`**（及派生的 **`library_id`** 若内部存储需要）。  
2. **会话存储**须支持 **按 Space/Library 隔离**（独立 DB 文件或单库 + `space_id`/`library_id` 列），以满足「仅显示当前 Library 会话」。  
3. **文档树 API** 的根目录 = **当前请求解析到的 Library 挂载路径**，而非 `KYBER_HOME/spaces/<slug>/docs`。

---

## 7. GUI / IA 对 Rev2 §7 的修订要点

- **§7.1.B 文档库区**：由「每个 Space 独立文档库（KyberKit Workspace）」改为 **「每个 Space 绑定一个 Library；文档树展示该 Library 挂载目录」**。  
- **§7.1.D 历史会话**：会话列表 **仅** 展示 **当前 Space 对应 Library** 下的会话（Rev3 强制）。  
- **§7.1.E 底部切换器**：切换 Space = 切换 **UUID 标识的 Space** 及其绑定 Library；新开窗口的 URL 参数为 **`space_id=<UUID>`**（与 Tauri 深链约定需统一，禁止使用与 `space_id` 冲突的 query key）。

---

## 8. v1.5 范围表（Rev3 对 Rev2 §14.1 的补充行）

| 能力 | Rev3 补充 |
|------|-----------|
| **Space / Library** | Space=UUID；Library=UUID + 挂载路径；一对一绑定 |
| **文档库** | 用户本地挂载文件夹；**非** `KYBER_HOME/spaces/*/docs` 为默认用户文档源 |
| **Kevin 本地存储** | `~/.kyberkit/kevin/` + `~/.kyberkit/kevin/lib-<libraryId>/` |
| **KYBER_SPACES_ROOT** | Kevin 桌面默认不使用；CLI/非 Kevin 场景保留 |
| **迁移** | 无旧版数据迁移义务（未发布） |

---

## 9. 验收与工程契约增量（在 Rev2 §15.3 之上）

研发除 Rev2 清单外须补充：

1. **路径解析单一真源**：`libraryId` → 挂载路径、`space_id`（UUID）→ `libraryId` 映射、Kevin 用户层与 `lib-<id>` 技术目录的常量定义与初始化。  
2. **Sidecar**：会话与任务查询 **按 `space_id` / `library_id` 过滤**；存储位置与 **§5.2** 一致。  
3. **Agent**：请求链注入 Library 挂载路径至 **builtin 与 MCP 允许根**（策略 A）。  
4. **E2E**：切换 Space 后，文档树与会话列表 **均** 仅反映目标 Library；向 Agent 发起的读文件与 UI 树 **一致**。  

---

## 10. 待定专题（不在 Rev3 一次性交付）

| 专题 | 说明 |
|------|------|
| **Space 维度的深度改造** | 多窗口、Runtime 多实例、与 KyberKit `KyberRuntime` 的生命周期对齐；在 **策略 A** 已落地的前提下分阶段设计。 |
| **Library 挂载路径变更** | 用户更换文件夹时的重索引与会话归属策略。 |
| **跨设备** | 不在 Rev3 范围。 |

---

## 附录 A. Rev3 关键决策追溯（2026-05-08）

| ID | 决策 |
|----|------|
| **R3-01** | `KYBER_SPACES_ROOT` 与 Kevin 文档/会话默认路径 **解耦**；Kevin 内 Agent 文件根对齐 **Library 挂载路径**。 |
| **R3-02** | **Space : Library = 1 : 1**；会话列表 **仅** 当前 Library。 |
| **R3-03** | **Space id、libraryId 均为 UUID**。 |
| **R3-04** | **请求级上下文（策略 A）** 保证 Agent 与 UI 路径一致；Space 深度改造 **稍后专题**。 |
| **R3-05** | 存储：**分布式本机节点**；**`~/.kyberkit/kevin/`** 用户层 + **`lib-<libraryId>/`** 库级技术资产；**摒弃**「单一中心节点存全部技术资产」的 PRD 表述。 |
| **R3-06** | **无旧版迁移**（未发布）。 |
| **R3-07** | **创建 Library 必须绑定本地文件夹**；可提供向导默认路径。 |

---

## 附录 B. 阅读指引

1. **产品完整叙述**：先读 **Rev2** 全文 [`kevin-v1.5-prd-rev2.md`](./kevin-v1.5-prd-rev2.md)。  
2. **架构与路径**：再读 **本文 Rev3**，覆盖 Space/Library/存储/KyberKit 边界。  
3. **实现时**：以 Rev3 的 §0–§6、§9 为 **硬约束**；其余章节遵循 Rev2，并以 Rev3 **术语替换** 文中旧「Space = 含 docs 的 vault」说法。

---

**文档结束 — Kevin v1.5 PRD Rev3**
