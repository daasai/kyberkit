# Kevin v1.5 — Skill 体系工程契约

> **来源**：PRD §12、§9、§15.3  
> **读者**：Runtime、`SkillRegistry`、Sidecar、`Forge`

## 1. SKILL.md 格式

- Markdown + YAML frontmatter；兼容 Anthropic Skills。
- **必填**：`name`（kebab-case，≤64）、`description`（~500 字，检索唯一信号）。
- **Kevin 扩展**：统一放在 `kevin` 键下（嵌套对象），Anthropic 生态忽略未知字段。

## 2. Frontmatter 字段（JSON Schema 锚点）

实现时使用 JSON Schema 校验；未知顶级键可保留，**`kevin` 内键**按 schema 校验。

| 路径 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `name` | string | — | 必填 |
| `description` | string | — | 必填 |
| `license` | string | — | 可选 SPDX |
| `allowed-tools` | string[] | [] | Actuator / 工具 id |
| `kevin.scope` | enum | `space` | `space` \| `user` \| `global` |
| `kevin.risk` | enum | `low` | `low` \| `medium` \| `high` |
| `kevin.triggers` | string[] | `["manual"]` | 含 `manual`、`cron:...` |
| `kevin.sensors.required` | string[] | [] | |
| `kevin.sensors.optional` | string[] | [] | |
| `kevin.sensors.fallback` | string | — | 如 `csv-import` |
| `kevin.templates` | string[] | [] | 如 `user:prd`、`space:foo` |
| `kevin.learning.enabled` | boolean | true | |
| `kevin.learning.share` | enum | `local` | `local` \| `network`（v1.6+） |
| `kevin.upstream` | string | — | Fork 时 `<id>@<semver>` |
| `kevin.schema` | string | — | 相对 Skill 目录的 schema 路径 |

## 3. 物理落点与三级 scope

| `kevin.scope` | 目录 | 可见范围 | 写入 |
|---------------|------|----------|------|
| `global` | `${KYBER_HOME}/global/skills/<name>/` | 所有用户所有 Space | 仅 IT / 安装器 |
| `user` | `${KYBER_HOME}/users/default/skills/<name>/` | 当前用户全部 Space | 用户 + Forge Fork |
| `space` | `<spaceRoot>/skills/<name>/` | 当前 Space | 用户 + Forge 新建 |

**加载顺序**：扫描 Global → User → Space，合并 Map；冲突时 **Space 覆盖 User 覆盖 Global**。

## 4. 渐进式披露（L1 / L2）

- **L1**：仅 `(name, description)` 列表注入 system prompt（Claude Code 风格目录）。
- **L2**：模型选中某 Skill 后，加载完整 `SKILL.md` + `examples/` + `kevin.schema` 指向文件。

**Skill 数量 > 50**：退化 Top-30 按频次 + 关键词预筛（PRD §12.5.2）。

## 5. Forge 契约

- **落盘前必须用户确认**（禁止静默写入）。
- **默认新建**：`scope: space`，目录 `<spaceRoot>/skills/<slug>/`。
- **Layer 2 Fork 默认**：`scope: user`，`users/default/skills/`。

### Sidecar API（规划）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/skills?space_id=` | 合并后的 Skill 列表（元数据） |
| POST | `/skills/forge/suggest` | 触发/查询蒸馏建议（可选） |
| POST | `/skills/promote` | Body: `{ from: "space", skillName, spaceId }` → 移动到 User，删除 Space 副本 |
| POST | `/skills/copy` | User → Space 私有化拷贝 |

## 6. Skill Store B 形态（UI）

- Tab：**公共 Skills**（只读 + 安装）、**我的 Skills**（已安装 + 演进 + 新建私有 Skill）。
- 卡片字段：`description`、Sensor 依赖、`kevin.risk`、运行次数、版本。

## 7. Anthropic 官方 Skill 默认补全

若缺少 `kevin.*`，加载时补全：

- `kevin.risk`: `low`
- `kevin.triggers`: `["manual"]`
- `kevin.learning.enabled`: `true`
- `kevin.scope`: `space`（若从官方包解压到某目录，由安装路径决定）

## 8. 验收检查清单

- [ ] 同名三目录冲突解析正确。
- [ ] 无效 frontmatter 拒载并记录日志。
- [ ] promote / copy 后文件系统与内存索引一致。
