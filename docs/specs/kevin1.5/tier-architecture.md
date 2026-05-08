# Kevin v1.5 — 资产分层与路径契约（Rev3 对齐）

> **来源**：[kevin-v1.5-prd-rev3.md](./kevin-v1.5-prd-rev3.md)（架构裁决）、PRD Rev2 其余章节  
> **读者**：Runtime、Sidecar、Tauri、运维  
> **冲突处理**：路径与 Space/Library 语义 **以 Rev3 为准**；本文替代旧版「Tier 3 = `KYBER_HOME/spaces/<id>/docs`」为中心的叙述。

---

## 1. 设计目标

- **Tier 1 — Global**：KyberKit / IT 拥有；官方 Skills、合规配置、平台 `.env`（与 KyberKit 发行物绑定）。
- **Tier 2 — Kevin 节点用户层**：本机 **单用户**（当前节点）跨 Space/Library **持续**的资产：加密配置、全局 Skill、Sensor 凭证池、模板、审计等；物理根 **`${KEVIN_NODE_ROOT}`**（默认 `~/.kyberkit/kevin`，见 §2）。
- **Tier 3 — Library 双分区**（Rev3）：
  - **3a 用户文档区**：用户**挂载的本地文件夹**（**Library 挂载路径**），存放工作文档与制品；**不是** `${KYBER_HOME}/spaces/<id>/docs`。
  - **3b 库级技术区**：`${KEVIN_NODE_ROOT}/lib-<libraryId>/`，存放该 Library 的**技术资产**（会话 DB、索引、缓存等）；对用户通常不可见。

**节点模型**：每台运行 Kevin 的 PC 是一个**边缘节点**，只持久化**本用户**数据；**不**假设存在单一中心化主机保管上述目录树。

**KyberKit Agent 默认工作区**：由 **`KYBER_SPACES_ROOT`**（及 `KYBER_USER_NAME`、`KYBER_WORKSPACE_ID`）解析，**仅**用于 **非 Kevin 桌面** 场景（CLI、脚本、无 Library 概念的调用）。**Kevin 桌面产品**的文档库根、默认会话落盘、builtin/MCP 文件根 **不得**默认推导自 `KYBER_SPACES_ROOT`。

**可见性（逻辑）**：在当前 Space 绑定的 Library 内活动时，技能与配置可见性 ≈ `Global ∪ KevinUser ∪ <library 挂载目录下的 Space 资源> ∪ lib-<libraryId> 技术数据（运行时内部）`。同名冲突时 **`Library 挂载目录内资源 > Kevin 用户层 > Global`**（与 Rev2「更具体覆盖更通用」一致，惟 Tier 3 文档根已改为挂载路径）。

---

## 2. 物理目录布局（常量）

### 2.1 环境变量约定

| 变量 | 语义 |
|------|------|
| `KYBER_HOME` | KyberKit 全局之家，默认 `~/.kyberkit`；**Tier 1 `global/skills` 等仍可挂靠于此**（可与安装器约定）。 |
| **`KEVIN_NODE_ROOT`** | Kevin **节点用户层**根目录；**默认** `~/.kyberkit/kevin`。实现阶段若尚未引入该变量名，则代码中与 PRD「Kevin 产品根」同义。可通过用户配置或 env 覆盖（便于测试）。 |
| `KYBER_SPACES_ROOT` | **仅 KyberKit Agent** 默认 workspace；**Kevin 桌面路径解析链不依赖**。 |

### 2.2 Tier 1（Global）

```
${KYBER_HOME}/
└── global/
    └── skills/                    # 官方 / IT 推送 Skills（用户只读）
```

### 2.3 Tier 2（Kevin 节点用户层）

```
${KEVIN_NODE_ROOT}/                  # 默认 ~/.kyberkit/kevin/
├── profile.json                     # 本节点用户身份与偏好（可选；schema 与实现一致即可）
├── config.enc                       # API Key、模型、网关等（GUI / Sidecar 写入）
├── skills/                          # 用户级（全局可见）Skills
├── credentials/                     # Sensor 凭证：<sensor-id>.<scheme>.enc
├── templates/                       # user:xxx 模板
├── audit/
│   └── YYYY-MM-DD.jsonl             # 用户级审计（Sign-off 等）
└── registry/                        # 建议：Space ↔ Library 映射、libraryId → 挂载路径（实现可选用 SQLite/JSON）
    └── （实现定义）
```

> **与旧 Rev2 路径**：原 `${KYBER_HOME}/users/default/` 下各类文件，**Rev3 新产品从零创建时优先只写 `${KEVIN_NODE_ROOT}/`**；若代码仍读写旧路径，视为过渡期兼容，以路线图移除为准。

### 2.4 Tier 3a — Library 挂载路径（用户文档与制品）

- **不是**固定相对路径：由用户在创建 Library 时**选择或确认**的 **绝对路径**（例如 `~/Documents/MyVault`）。
- 侧栏文档树、Artifact 默认归档、**Kevin 内** builtin/MCP 文件访问的 **primary root** = 该挂载路径（经 **请求级上下文** 注入，见 [PRD Rev3 §1](./kevin-v1.5-prd-rev3.md)）。
- 可选约定（实现阶段定义）：`sensors.json`、Library 私有 Skill 等若需落盘，可放在挂载目录下受控子目录 **或** 仅在 `lib-<libraryId>/` 存引用——**禁止**在 `sensors.json` 存明文 token。

### 2.5 Tier 3b — Library 技术资产（按 libraryId）

```
${KEVIN_NODE_ROOT}/lib-<libraryId>/
├── sessions.db                      # 示例：该 Library 的会话 SQLite（或等价）
├── index/                           # 可选：检索索引
├── cache/                           # 可选：缓存
└── …                                # 实现允许的其它库级技术文件
```

- **`libraryId`、`spaceId` 均为 UUID**（PRD Rev3）。
- **Space : Library = 1 : 1**；会话列表 **仅** 当前 Space 对应 Library。

---

## 3. Space / Library 绑定（数据契约）

| 字段 | 说明 |
|------|------|
| `space_id` | UUID；API / URL 使用 `space_id=<UUID>`。 |
| `library_id` | UUID；目录名为 `lib-<library_id>`。 |
| `mount_path` | Library 挂载目录绝对路径；注册用户文档树与 Agent 文件根。 |

**持久化**：建议在 `${KEVIN_NODE_ROOT}/registry/`（或 Sidecar 管理的数据库）中存储 `(space_id, library_id, mount_path, display_name)`；display_name 可变，**不得**作为主键或路径片段。

---

## 4. PathResolver（或等价模块）契约

建议模块：`src/runtime/paths/PathResolver.ts`（Kevin 侧）；Sidecar 内 duplicated 常量时应 **同源或生成同一契约**。

| 方法 / 常量 | 返回值语义 |
|-------------|------------|
| `kyberHome()` | `${KYBER_HOME}` |
| **`kevinNodeRoot()`** | `${KEVIN_NODE_ROOT}`（默认 `~/.kyberkit/kevin`） |
| `globalSkillsDir()` | `${KYBER_HOME}/global/skills` |
| **`kevinUserConfigPath()`** | `${KEVIN_NODE_ROOT}/config.enc` |
| **`kevinUserSkillsDir()`** | `${KEVIN_NODE_ROOT}/skills` |
| **`kevinCredentialsDir()`** | `${KEVIN_NODE_ROOT}/credentials` |
| **`kevinTemplatesDir()`** | `${KEVIN_NODE_ROOT}/templates` |
| **`kevinAuditDir()`** | `${KEVIN_NODE_ROOT}/audit` |
| **`libraryTechRoot(libraryId)`** | `${KEVIN_NODE_ROOT}/lib-<libraryId>/` |
| **`resolveLibraryMountPath(libraryId)`** | 自 registry 解析挂载路径；无则报错或引导创建 Library |
| ~~`spaceRoot(spaceId)` 含固定 `docs/`~~ | **废弃**作为用户文档唯一真源；若保留辅助函数，应解析为 **绑定 Library 的挂载路径** + **可选** `libraryTechRoot` |

`ensureTierLayout()`（或拆分）：创建 `${KEVIN_NODE_ROOT}` 下 Tier 2 子目录 + `${KYBER_HOME}/global/skills`（若策略要求）；**不**再默认创建 `${KYBER_HOME}/spaces/<id>/docs` 作为 Kevin 文档库。

---

## 5. 目录初始化器

首次启动 Kevin Sidecar / 桌面逻辑时：

1. 解析 `KEVIN_NODE_ROOT`（默认 `~/.kyberkit/kevin`）。
2. `mkdir -p`：`skills/`、`credentials/`、`templates/`、`audit/`、`registry/`（若采用）。
3. **Tier 1**：按需确保 `${KYBER_HOME}/global/skills`。
4. **首个 Space + Library**：Onboarding 创建 **UUID Space**、**UUID Library**、**挂载路径**，写入 registry；再按需创建 `lib-<libraryId>/` 与会话存储。
5. **禁止**：在未解析 `libraryId` / `mount_path` 的情况下，把用户文档树默认指向 `${KYBER_HOME}/spaces/default/docs`。

---

## 6. 迁移与兼容（Rev3）

**当前策略**：产品尚未正式发布时 **不做** v1.0 → Rev2 `users/default` / `spaces/<slug>` **批量迁移**；新装实例 **仅使用 §2.3–§2.5**。

若日后需兼容旧盘：

- 迁移脚本幂等；路径映射表单独文档化。
- 失败时：引导新建 Library + 挂载路径。

---

## 7. Sensor 凭证池（文件命名）

- **路径**：`${KEVIN_NODE_ROOT}/credentials/<sensor-id>.<scheme>.enc`
- 例：`feishu.oauth.enc`
- **禁止**在 Library 挂载目录内的 `sensors.json`（若存在）存放明文 token；仅 `uses_credential` 引用凭证 id。

---

## 8. 审计日志路径

- **目录**：`${KEVIN_NODE_ROOT}/audit/`
- **文件**：`<YYYY-MM-DD>.jsonl`（Sign-off 契约见 [signoff-contract.md](./signoff-contract.md)）。

---

## 9. 验收检查清单（Rev3）

- [ ] `${KEVIN_NODE_ROOT}` 冷启动自动创建 Tier 2 骨架目录。
- [ ] `config.enc` / 凭证路径指向 **`${KEVIN_NODE_ROOT}`**，而非依赖 `${KYBER_HOME}/users/default`（除非明确过渡期）。
- [ ] 文档树 API 根目录 = **registry 中的 Library 挂载路径**，而非 `${KYBER_HOME}/spaces/<slug>/docs`。
- [ ] Sidecar 会话存储位于 **`lib-<libraryId>/`**（或等价隔离），且列表查询按 **当前 `space_id` → library** 过滤。
- [ ] Kevin 桌面路径解析 **不**将 **`KYBER_SPACES_ROOT`** 作为文档库或 Kevin 会话默认根。
- [ ] KyberKit CLI / 无 UI 场景仍可按文档使用 `KYBER_SPACES_ROOT`。

---

## 10. 相关文档

| 文档 | 用途 |
|------|------|
| [kevin-v1.5-prd-rev3.md](./kevin-v1.5-prd-rev3.md) | Space/Library、`KYBER_SPACES_ROOT` 边界、产品语义 |
| [skill-architecture.md](./skill-architecture.md) | SKILL.md、scope；加载优先级需与本文 Tier 2/3a 对齐 |
| [task-lifecycle.md](./task-lifecycle.md) | 异步任务与 `space_id`（UUID）隔离 |

---

**维护约定**：变更路径常量或绑定模型时，**先更新本文与 Rev3**，再改 `PathResolver` / Sidecar / 前端 query 约定。
