# Kevin v1.5 — 三层资产架构（工程契约）

> **来源**：PRD §8.1–8.2、§15.3  
> **读者**：Runtime、Sidecar、Tauri、运维

## 1. 设计目标

- **Tier 1 Global**：KyberKit / IT 拥有；官方 Skills、合规配置、平台 `.env`。
- **Tier 2 User**：单用户资产跨 Space 持续；配置、用户级 Skills、凭证池、模板、审计。
- **Tier 3 Space**：业务隔离；文档库、Space Skills、`sensors.json`、会话、学习偏好。

**可见性**：在某 Space 内，`visible = Global ∪ User ∪ currentSpace`。  
**冲突**：同名资源 **`Space > User > Global`**。

## 2. 物理目录布局（常量）

根目录：`KYBER_HOME` = `~/.kyberkit`（可通过环境变量 `KYBER_HOME` 覆盖，便于测试）。

```
${KYBER_HOME}/
├── global/
│   └── skills/                    # Tier 1 官方 / IT 推送 Skills（用户只读）
├── users/
│   └── default/                   # v1.5 仅 default；预留多用户
│       ├── profile.json           # 身份与偏好（JSON）
│       ├── config.enc             # 用户配置密文（API Key、模型、网关）
│       ├── skills/
│       ├── credentials/           # Sensor 凭证：<sensor-id>.<scheme>.enc
│       ├── templates/             # user:xxx 模板文件
│       └── audit/
│           └── YYYY-MM-DD.jsonl
└── spaces/
    └── <space-id>/
        ├── docs/
        ├── skills/
        ├── sensors.json
        ├── sessions/              # 可选：文件级会话导出；SQLite 仍为 Sidecar 真源
        └── learning/
```

**Space 业务数据**：既有 KyberKit Workspace（`KYBER_SPACES_ROOT` 等）可与 `~/.kyberkit/spaces/<id>` **合并或映射** —— 实现需在 `PathResolver` 中统一：  
- `spaceRoot(spaceId)` → 可指向 `spaces/default/data/spaces/<id>` 或 `~/.kyberkit/spaces/<id>`，以代码为准。

## 3. PathResolver 契约

单例模块建议路径：`src/runtime/paths/PathResolver.ts`。

| 方法 / 常量 | 返回值语义 |
|-------------|------------|
| `kyberHome()` | `${KYBER_HOME}` |
| `globalSkillsDir()` | `${KYBER_HOME}/global/skills` |
| `userRoot(userId)` | `${KYBER_HOME}/users/${userId}` |
| `userConfigPath(userId)` | `.../config.enc` |
| `userSkillsDir(userId)` | `.../skills` |
| `userCredentialsDir(userId)` | `.../credentials` |
| `userTemplatesDir(userId)` | `.../templates` |
| `userAuditDir(userId)` | `.../audit` |
| `spaceRoot(spaceId)` | Tier 3 根（含 docs/skills/sensors.json/…） |
| `ensureTierLayout()` | `mkdir -p` 全部 Tier 2 默认子目录 + `global/skills` |

## 4. 目录初始化器

首次启动 Sidecar 或 Runtime bootstrap 时：

1. 读取 `KYBER_HOME`，默认 `~/.kyberkit`。
2. 调用 `ensureTierLayout()`。
3. 若 `users/default/profile.json` 不存在，写入最小 schema：`{ "userId": "default", "createdAt": ISO8601 }`。

## 5. v1.0 → v1.5 迁移协议

| 来源（v1.0） | 目标（v1.5） |
|--------------|----------------|
| macOS `~/Library/Application Support/.../Kevin/` 下用户可写配置（若存在） | `users/default/config.enc`（加密合并） |
| 仓库内 `.env` 中的用户密钥（仅开发） | Onboarding 引导写入 `config.enc`，**不**覆写 `.env` |
| `~/.kyberkit/audit/`（若旧路径存在） | `users/default/audit/` |

**策略**：

- 迁移脚本幂等：已存在 `config.enc` 则跳过或仅合并缺失字段。
- 失败时：空配置 + 强制 Onboarding，不阻断启动。

## 6. Sensor 凭证池（文件命名）

- 路径：`users/default/credentials/<sensor-id>.<scheme>.enc`  
- 例：`feishu.oauth.enc`
- **禁止**在 Space 的 `sensors.json` 内存放明文 token；仅 `uses_credential` 引用。

## 7. 审计日志路径（PRD §10.3）

- 目录：`users/default/audit/`
- 文件：`<YYYY-MM-DD>.jsonl`，每行一条 JSON 事件（Sign-off 契约见 [signoff-contract.md](./signoff-contract.md)）。

## 8. 验收检查清单

- [ ] 冷启动自动创建 `~/.kyberkit` 下全部 Tier 2 子目录。
- [ ] `config.enc` 读写失败时有明确日志与 Onboarding 回退。
- [ ] 老用户首次启动迁移成功或可跳过进入向导。
