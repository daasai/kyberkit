# Kevin Rev3 — 系统重构规格说明书（System Refactor Spec）

> **文档性质**：工程实施方案规格（normative for refactor sequencing）；产品语义仍以 [kevin-v1.5-prd-rev3.md](./kevin-v1.5-prd-rev3.md) 为裁决来源，路径契约以 [tier-architecture.md](./tier-architecture.md) 为准。  
> **状态**：Draft — 用于对齐重构边界与阶段闸门；实施时每阶段结束前更新本文「§11 修订记录」。  
> **日期**：2026-05-08

---

## 1. 目的与范围

### 1.1 目的

将 Kevin 桌面产品从「KyberKit 默认 workspace + `KYBER_HOME/spaces/*/docs` 混合语义」迁移到 **Rev3 模型**：

- **Space（UUID）** 仅承载会话 / 自动化 / 任务上下文，且 **与 Library（UUID）一对一**。  
- **Library** = 用户挂载的本地文件夹（文档与制品）；**技术资产**落在 **`${KEVIN_NODE_ROOT}/lib-<libraryId>/`**。  
- **Kevin 节点用户层** = **`${KEVIN_NODE_ROOT}`**（默认 `~/.kyberkit/kevin/`）。  
- **`KYBER_SPACES_ROOT`** 与 Kevin **默认路径链解耦**（保留给 CLI / 非 Kevin KyberKit 场景）。  
- **策略 A**：请求级 `AgentExecutionContext`，使 **UI 文档树、builtin 文件工具、shell cwd、MCP 本地文件根（若可安全请求级切换）** 与 **当前 Library 挂载路径**一致。

### 1.2 范围内（In Scope）

| ID | 内容 |
|----|------|
| **RS-01** | Space id、`space_id` query：**UUID**；废除「default 省略 query」等产品特例 |
| **RS-02** | Library registry：**libraryId（UUID）、mount_path、display_name、绑定 space_id** |
| **RS-03** | Sidecar：会话/artifact/message **按 library / space 隔离**；DB 路径与 **tier-architecture §2.5** 一致 |
| **RS-04** | 文档树（及等价 API）：根 = **resolveLibraryMountPath(libraryId)** |
| **RS-05** | `PathResolver`（及 Sidecar 同源常量）：**`kevinNodeRoot`、`libraryTechRoot`、`resolveLibraryMountPath`** |
| **RS-06** | 前端：`SessionContext`、localStorage、Space 切换、**所有带隔离的 fetch** 带 **`space_id=<UUID>`** |
| **RS-07** | Tauri：**新开窗口 query 与前端一致**（`space_id`，禁止与现行冲突键并存且无映射） |
| **RS-08** | Onboarding：**首个 Space + 首个 Library + 必选挂载路径** |
| **RS-09** | Agent：Sidecar 解析 `space_id → library_id → mount_path` 后构造 **不可变 `AgentExecutionContext`**；传入 Runtime / Session / Tool deps；builtin 文件工具与 shell cwd **不得**继续依赖全局 `process.cwd()` |
| **RS-10** | MCP filesystem：必须明确支持 **请求级 root / 多 root 调度 / 暂缓出 Phase 5** 三者之一；禁止以全局启动 root 冒充当前 Library root |

### 1.3 范围外（Out of Scope，本期不重构）

| ID | 内容 |
|----|------|
| **NX-01** | 旧版目录批量迁移（Rev3：**不从零以外的存量承接**） |
| **NX-02** | 跨设备同步、云端权威 registry |
| **NX-03** | KyberRuntime **多实例 / Space 级 Runtime 生命周期**（**稍后专题**；本期允许策略 A + 单 Runtime，但单 Runtime 内不得通过修改 process-wide 状态实现 Space 切换） |
| **NX-04** | Library **更换挂载路径**后的全自动重索引（可做占位错误提示） |

---

## 2. 规范性引用

| 文档 | 用途 |
|------|------|
| [kevin-v1.5-prd-rev3.md](./kevin-v1.5-prd-rev3.md) | 产品裁决 |
| [tier-architecture.md](./tier-architecture.md) | 路径、`KEVIN_NODE_ROOT`、`lib-<libraryId>/` |
| [skill-architecture.md](./skill-architecture.md) | Skill 扫描路径变更时需对齐 Tier 2 |
| [task-lifecycle.md](./task-lifecycle.md) | `space_id` 隔离语义升级为 UUID |

---

## 3. 现状摘要（重构起点）

下列为撰写本文时代码/契约中的 **已知落差**（非穷举，实施前 grep 复核）：

- Sidecar `db.ts`：`sessions.db` 依赖 **`KYBER_SPACES_ROOT`**，且 **无 `space_id` / `library_id` 维度**。  
- `GET /sessions` 等 **未按 query 过滤**隔离会话。  
- 文档树曾绑定 **`KYBER_HOME/spaces/<id>/docs`** 语义，与 **Library 挂载**不一致。  
- 前端 **`qsSpace`：** `default` **不传 `space_id`**，与 Rev3 **每张请求带 UUID** 冲突。  
- **KyberRuntime** bootstrap **单次 workspace**；`SessionManager` **未按 Space/Library** 传 `workspaceId`。  
- Builtin **`resolveSandboxedPath(..., process.cwd())`**：Kevin 内 cwd **未必等于 Library mount**。  
- Runtime bootstrap 固定 **singleton sandbox / builtin tool registry / MCP registry**；若 Phase 5 通过修改全局 cwd、env 或 sandbox roots 切换 Library，会在多窗口/并发 streaming 下串根。  
- `CreateSessionOptions.workspaceId` 仅是声明级入口，当前 Sidecar 创建/恢复会话未传 **Space/Library 执行上下文**。  
- **Tauri** `open_and_focus_space_window` 使用 **`?space=`**，与 **`space_id`** 不一致。  

---

## 4. 目标架构（逻辑视图）

```text
                    ┌─────────────────────────────────────────┐
                    │  Kevin Desktop (app + Tauri)             │
                    │  space_id=UUID (URL/localStorage/API)    │
                    └─────────────────┬───────────────────────┘
                                      │
                                      ▼
┌─────────────────────────┐    ┌──────────────────────────────────────┐
│ Space ↔ Library Registry │◄───┤ Sidecar HTTP                           │
│ ${KEVIN_NODE_ROOT}/      │    │  解析 space_id → library_id → mount   │
│ registry (impl-defined) │    │  会话 DB → libraryTechRoot(libId)     │
└─────────────────────────┘    │  文档树 list ← mount_path               │
                                 └───────────────┬────────────────────────┘
                                                 │
                                                 ▼
                                 ┌───────────────────────────────────────┐
                                 │ KyberRuntime / AgentSession            │
                                 │  策略 A：AgentExecutionContext         │
                                 │  cwd / allowedRoots / mcpRoots         │
                                 │  request-scoped, immutable             │
                                 └───────────────────────────────────────┘
```

**并发约束**：本期虽不引入 Space 级 Runtime 多实例，但 **不得**通过 `process.chdir()`、临时改写 env、临时改写 singleton sandbox / tool registry 等 process-wide 状态来实现 Space/Library 切换。多窗口或两个 Space 同时请求 Agent 时，每个请求必须持有自己的不可变 `AgentExecutionContext`。

---

## 5. 数据模型（最小）

### 5.1 实体

- **Space**：`space_id: UUID`（PK）；可选 `display_name`；**`library_id: UUID`（FK，unique）**。  
- **Library**：`library_id: UUID`（PK）；`mount_path: absolute path`；`display_name: string`；**`space_id: UUID`（FK，unique）**。  

二者 **一对一**：任选一端 FK + UNIQUE 即可。

### 5.2 会话与制品（Sidecar）

- **会话行**必须可关联 **`space_id` 与/或 `library_id`**（推荐二者冗余其一可由映射推导，查询键明确）。  
- **会话归属不可变**：`POST /sessions` 创建后，该 session 的 `space_id` / `library_id` 不随前端当前 Space 切换而改变；后续 `GET / DELETE / messages` 必须校验请求 `space_id` 与 session 归属一致。  
- **SQLite 放置**：`${KEVIN_NODE_ROOT}/lib-<libraryId>/sessions.db`（**推荐单 Library 单文件**，简化备份）或等价命名；禁止全局单一 DB 无过滤键（当前形态）。

---

## 6. API 契约增量（Sidecar）

下列为 **规范性增量**；路径与 verb 可与现有路由对齐命名。

| 能力 | 约定 |
|------|------|
| **Registry CRUD** | 创建/列出 Space+Library（首次 onboarding）；返回 UUID |
| **解析中间件** | 所有需隔离的路由：从 `space_id` → `library_id` → `mount_path`；非法 UUID → 400 |
| **`GET /sessions`** | **必须** `space_id`；仅返回该 Space/Library 下的会话 |
| **`POST /sessions`** | **必须** `space_id`；写入对应 `lib-<libraryId>/` DB |
| **`GET /sessions/:id`** | **必须** `space_id`；session 不属于该 Space/Library → 404 或 403（实现统一即可，禁止返回跨库内容） |
| **`DELETE /sessions/:id`** | **必须** `space_id`；仅允许删除该 Space/Library 下的 session |
| **`POST /sessions/:id/messages`** | **必须** `space_id`；校验 session 归属后构造 `AgentExecutionContext` 并传入 Agent 请求链 |
| **`GET /library/tree`** | **必须** `space_id`（或显式 `library_id`）；枚举 **mount_path** |
| **任务 / 签批 / SSE** | PRD 既有隔离语义：**UUID space_id** |

---

## 7. 客户端契约（app）

- **`qsSpace(spaceId: string)`**：凡 `spaceId` 非空 **一律** `?space_id=<encodeURIComponent(spaceId)>`（**含「首个默认 Space」**）。  
- **localStorage**：`kevin:active-space-id` 存 **UUID**；首次启动无 UUID → **阻断主界面**直至 onboarding 创建 Space。  
- **文档库 / 历史会话**：数据来源均以 **当前 space_id** 为准。

---

## 8. 环境变量与路径矩阵

| 变量 | Kevin 桌面 | KyberKit CLI |
|------|------------|--------------|
| `KEVIN_NODE_ROOT` | **默认** `~/.kyberkit/kevin`，路径解析主入口 | 可忽略 |
| `KYBER_HOME` | Tier 1 global skills 等 | 同左 |
| `KYBER_SPACES_ROOT` | **不参与**文档库 / Kevin 会话默认路径 | **参与**默认 Agent workspace |

### 8.1 AgentExecutionContext（策略 A）

`AgentExecutionContext` 是 Sidecar 在处理隔离请求时构造的 **请求级 / 会话级不可变对象**。它是 Kevin 桌面把 Rev3 Library 语义注入 KyberKit Agent 框架的最小接口；Runtime、Session、AgentLoopDeps、builtin tools 与 MCP filesystem 不得自行从 URL、localStorage、`process.cwd()` 或 env 反推当前 Library。

最小字段：

| 字段 | 语义 |
|------|------|
| `spaceId` | 当前请求的 UUID Space id |
| `libraryId` | 由 registry 解析出的 UUID Library id |
| `libraryMountPath` | 用户文档区绝对路径；UI 文档树与 Agent 文件读写的 primary root |
| `libraryTechRoot` | `${KEVIN_NODE_ROOT}/lib-<libraryId>/`；会话 DB、索引、cache、trajectory 等技术资产根 |
| `cwd` | Agent builtin / shell 相对路径默认解析根；Kevin 桌面内默认等于 `libraryMountPath` |
| `allowedRoots` | 本请求 sandbox 允许的文件根；至少包含 `libraryMountPath`，必要时包含 `libraryTechRoot` 的受控子路径 |
| `mcpRoots` | MCP filesystem 可见根；若当前 MCP 实现不支持请求级 root，见下方 MCP 阶段边界 |
| `sessionId` | 当前 AgentSession / Sidecar session id，用于轨迹、日志与归属校验 |

传递要求：

- Sidecar 解析并校验 `space_id` 后，先确认 session 归属，再构造 `AgentExecutionContext`。  
- 推荐入口：`runtime.createSession({ executionContext, ... })` 或 `session.send(message, { executionContext })`；具体 API 可按实现选择，但必须是显式参数。  
- Builtin `read_file` / `write_file` / `edit_file` / `glob` / `grep` / `bash` 的相对路径解析与 shell cwd 必须消费该上下文；不得继续以 process cwd 作为 Kevin 桌面默认根。  
- 单 Runtime 下允许共享模型、事件总线、静态 registry，但 **不允许共享可变 cwd / allowedRoots / mcp root**。  
- MCP filesystem 若不能安全请求级切换 root，Phase 5 最小闭环先保证 builtin 文件工具；MCP root 单独进入后续 Spike 或改为多 root 调度。

---

## 9. 阶段划分（实施顺序）

阶段之间有 **硬依赖**；禁止跨阶段合并提交破坏闸门。

### Phase 0 — 契约与脚手架

- 冻结本文 + tier-architecture；列出破坏性平变更清单（grep）。  
- 引入 **`KEVIN_NODE_ROOT`** 常量（代码默认）；`ensureKevinLayout()`。

### Phase 1 — Registry + PathResolver

- 实现 **registry 存储**（SQLite 单文件于 `${KEVIN_NODE_ROOT}/registry/` 或合并 Sidecar 配置 DB）。  
- 实现 **`resolveSpaceToLibrary`、`resolveLibraryMountPath`、`libraryTechRoot`**。  
- **废弃**：以 **`KYBER_HOME/spaces/<slug>/docs`** 作为 Kevin 文档唯一源的调用链。

### Phase 2 — Sidecar 持久化隔离

- **会话 DB** 按 **libraryId** 分文件（或迁移脚本：**无旧数据**，直接新 schema）。  
- **`sessions` / `artifacts` / `messages`** 表含 **`space_id` + `library_id`**（或仅存其一 + 映射缓存）。  
- **所有** session 相关路由（list/create/detail/delete/messages）**`space_id` 必填 + 归属校验**。

### Phase 3 — 前端 UUID 与 query

- Onboarding：创建 **首个 Space+Library+mount**。  
- **`qsSpace`、localStorage、深链** 全 UUID。  
- 移除 **`default` 不传参** 分支。

### Phase 4 — 文档树与产物路径

- `/library/tree` → **mount_path**。  
- Artifact 默认归档子路径（若 Rev2 有「建议路径」，挂载目录下相对路径为准）。

### Phase 5 — Agent 策略 A（最小闭环）

- Sidecar 处理 **`POST /sessions/:id/messages`** 时：解析并校验 **`space_id → library_id → mount_path`**，确认 session 归属后构造 **`AgentExecutionContext`**。  
- 在调用 **`KyberRuntime` / `AgentSession`** 前显式传入 `AgentExecutionContext`；禁止通过修改 `process.cwd()`、env 或 singleton sandbox 实现请求切换。  
- Builtin 文件工具与 shell：相对路径、默认 cwd、sandbox `allowedRoots` 均来自 `AgentExecutionContext`。  
- MCP filesystem：若已支持请求级 root 或多 root 调度，则接入 `AgentExecutionContext.mcpRoots`；若不支持，本阶段不得宣称 MCP root 已与 Library mount 对齐，需记录为后续 Spike。

### Phase 6 — Tauri 与多窗口

- **`open_and_focus_space_window`**：`space_id=<UUID>` 与 Web 一致。  
- 回归：新窗口 **会话列表 / 文档树** 与 Space 一致。

---

## 10. 验收闸门（每阶段）

| 阶段 | 闸门（必须自动化或脚本化优先） |
|------|--------------------------------|
| P0 | 常量与目录单元测试；文档引用一致 |
| P1 | registry CRUD + 路径解析单测；无效 UUID 失败 |
| P2 | 两 Library 各写一会话；`/sessions?space_id=` **互不泄漏**；detail/delete/messages 对错误 `space_id` 拒绝访问 |
| P3 | E2E：仅 onboarding 后可得 UUID；全请求带 query |
| P4 | 文档树展示挂载盘文件；与文件系统一致 |
| P5 | Agent `read_file` 相对路径解析落在 **mount_path**；两个 Space 并发读取同名相对路径文件时互不串根；若 MCP 未接入请求级 root，测试报告明确标注 MCP 不在本阶段闭环 |
| P6 | Tauri 新窗口 URL + 行为一致 |

---

## 11. 修订记录

| 日期 | 修订说明 |
|------|----------|
| 2026-05-08 | 初稿：整合 Rev3 + tier-architecture + 已知代码落差与阶段划分 |
| 2026-05-08 | RevA：根据 Agent 框架评审补充 `AgentExecutionContext`、单 Runtime 并发约束、session 归属校验、MCP root 阶段边界与 P5 验收 |

---

## 12. 后续文档动作（非阻塞）

- 更新 [skill-architecture.md](./skill-architecture.md) 中凡引用 **`users/default`** 的路径示例 → **`KEVIN_NODE_ROOT`**。  
- 更新 [task-lifecycle.md](./task-lifecycle.md) 中 **`space_id` 类型说明 → UUID**。  
- 可选：新增 `kevin-v1.5-sidecar-openapi.md` 或由代码生成 OpenAPI。

---

**文档结束**
