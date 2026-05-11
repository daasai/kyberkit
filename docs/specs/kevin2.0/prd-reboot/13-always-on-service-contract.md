# Kevin 2.0 Always-on Service Contract

> 状态：Draft  
> 父文档：`./01-product-strategy.md`（差异化标签：不止 Chat，始终 Always-on）  
> 关联：`./10-ai-proactive-behaviors.md` / `./11-first-encounter-spec.md` / `./08-connector-capability-governed-action.md` / `./12-cognitive-capital.md`

---

## 1. 文档目的

Kevin 2.0 的差异化标签已经确定为：

```text
不止 Chat，始终 Always-on。
```

这句话不能只停留在传播层。本文定义 Kevin 的 Always-on 服务契约：当一个 Workspace 创建后，Kevin 在用户授权边界内持续提供哪些服务、哪些行为必须静默、哪些行为必须显性、哪些能力必须由用户控制。

本文不是新增功能清单，而是所有后台行为、主动行为、连接器刷新、监控、记忆沉淀的统一约束。

---

## 2. Always-on 的产品定义

Always-on 不是“Kevin 一直打扰用户”，也不是“AI 可以自动做任何事”。

Kevin 的 Always-on 定义是：

```text
Workspace 创建后，Kevin 在用户授权的私域边界内持续维护工作上下文，
在合适时机准备认知环境、提醒关键变化、推动已授权工作闭环，
并把用户反馈沉淀为下一次工作的能力改进。
```

它包含四层承诺：

| 层级 | 承诺 | 用户感知 |
|---|---|---|
| 上下文常在 | Kevin 持续知道 Workspace 里发生了什么 | “我回来时，它知道项目变了” |
| 认知准备 | Kevin 在用户判断前准备相关材料与风险 | “它先把该看的东西摆出来” |
| 闭环跟进 | Kevin 追踪已批准动作与结果状态 | “不是写出去就结束” |
| 能力进化 | Kevin 从反馈中学习偏好和判断框架 | “越用越像我的工作方式” |

---

## 3. 服务状态模型

每个 Workspace 有一个 Always-on 状态：

| 状态 | 含义 | Kevin 可做的事 |
|---|---|---|
| `active` | 用户正在使用 Workspace | 全部前台交互、主动提示、后台索引 |
| `background` | Workspace 未打开，但允许后台服务 | 文件监听、连接器健康检查、定时刷新、监控条件评估 |
| `paused` | 用户暂停该 Workspace 服务 | 不做后台索引/刷新/主动提示；保留已有数据 |
| `limited` | 权限、网络或连接器异常导致降级 | 只做本地可用能力，并显性展示降级原因 |
| `archived` | 用户归档 Workspace | 不再主动服务；仅保留可查看历史 |

状态必须在 Workspace Home 或 Settings 中可见。任何从 `active/background` 降级到 `limited/paused` 的变化，都必须可被用户发现。

---

## 4. Always-on 行为边界

### 4.1 Kevin 可以静默执行的行为

这些行为属于“维护工作上下文”，不需要每次打扰用户：

- 监听 Workspace 目录中的文件新增、修改、删除
- 对新增或修改文件做 Material 化与索引
- 标记 stale Material 和受影响的 EvidenceRef
- 对已授权 Connector 做健康检查
- 按用户配置刷新只读数据 Material
- 记录用户接受、拒绝、修改、纠正等判断信号
- 更新非破坏性的内部索引与状态字段

静默不等于不可见。上述行为必须能在状态面板、日志或 `.kevin/` 文件中被追溯。

### 4.2 Kevin 必须显性提示的行为

以下行为影响用户判断、执行或信任，必须显性展示：

- Connector 授权失效、离线或数据刷新失败
- 关键 Evidence 来源文件被删除或移动
- Artifact 引用的数据 Material 已过期
- 新材料与当前 Artifact 存在高置信关联
- 执行结果成功或失败
- Kevin 形成新的偏好记录或 Skill 草案
- Kevin 准备写入 `.kevin/` 下的用户可见记忆文件

### 4.3 Kevin 必须等待用户确认的行为

以下行为不得静默发生：

- 外部系统写入、发布、覆盖、状态更新
- 高风险数据查询或跨权限边界访问
- 保存 C4 判断框架 Skill
- 将私有认知资产提升到用户级或团队级作用域
- 删除、导出、共享用户认知资本

---

## 5. 后台服务目录（MVP）

MVP 中 Always-on 只承诺以下最小服务：

| 服务 | 来源规格 | MVP 要求 |
|---|---|---|
| 本地目录监听与 Material 化 | `10` B-C-001 | 新增/修改文件后自动索引，失败可见 |
| Connector 健康检查 | `10` B-C-010 | `reauth_required/offline` 必须展示 |
| 数据 Material 定时刷新 | `10` B-C-011 | 默认 24 小时，可关闭 |
| directory_cognition 演进 | `11` / `12` C2 | `.kevin/cognition.md` 可持续更新 |
| Suggested Next Step 刷新 | `05` §4.1.1 | 每次进入 Home 重新评估 |
| 执行结果确认闭环 | `10` B-E-001 | 成功/失败都必须反馈并写 Audit |
| 偏好信号采集 | `10` §3.1 / `12` C3 | 记录 diff、Evidence、Action 等信号 |

MVP 不承诺完整 7x24 云端后台任务系统；可先实现“本地应用运行期间 + Workspace 打开时评估”的轻量 Always-on。产品文案不得暗示超出实际能力。

---

## 6. 用户控制权

Always-on 必须可控，否则会变成信任风险。

MVP 至少提供：

| 控制项 | 选项 |
|---|---|
| Workspace 服务状态 | 开启 / 暂停 / 归档 |
| 主动提示频率 | 少一点 / 正好 / 多一点 |
| 连接器刷新 | 自动 / 手动 / 关闭 |
| 目录监听 | 开启 / 暂停 |
| 记忆沉淀 | 允许偏好记录 / 仅手动保存 / 关闭 |
| Skill 提议 | 开启 / 关闭 |

用户关闭某项服务后，Kevin 必须解释影响：

```text
关闭目录监听后，Kevin 不会自动发现新文件。你仍可以手动刷新 Workspace。
```

---

## 7. 通知与打扰规则

Always-on 的目标是“可靠在场”，不是“频繁出现”。

MVP 通知规则：

- 每次会话主动介入不超过 3 次
- 同一类型主动行为每次会话最多 1 次
- 用户拒绝的建议本次会话不再重复
- 后台完成但无显著变化时不通知
- 低置信度发现不主动提示，只记录到 cognition 或等待用户询问
- 执行失败、权限失效、数据陈旧属于强提示，不受普通频率上限限制

---

## 8. 可见性设计

用户必须能回答三个问题：

1. Kevin 最近在后台做了什么？
2. Kevin 现在因为什么原因主动提示我？
3. Kevin 记住了什么，并且它如何影响了当前输出？

MVP 可见入口：

- Workspace Home：Connectors Status、Suggested Next Step、Materials 状态
- Inspector：当前 Artifact 使用的 Materials、Actions、Evidence
- Audit：执行与签批历史
- `.kevin/cognition.md`：项目认知事实源
- `.kevin/cognition.history.jsonl`：认知演进日志
- My Kevin / Settings：偏好、判断框架和记忆治理

---

## 9. 失败与降级原则

Always-on 服务失败时，最危险的不是失败本身，而是用户不知道失败了。

原则：

- 后台索引失败：状态可见，可重试，不阻断当前工作
- Connector 授权失效：必须显性展示，并阻断依赖该 Connector 的 Action
- 数据刷新失败：保留旧数据，标记 stale，不用新结论覆盖旧结论
- 文件监听失效：显示“本地文件同步已暂停”
- LLM 不确定：降低主动提示级别，不用确定语气输出
- 隐私边界不清：默认不读取、不发送、不沉淀

---

## 10. 验收标准

MVP 验收时必须证明：

- 用户创建 Workspace 后，Kevin 能在再次进入时展示项目状态，而不是空 Chat。
- 新增本地材料后，Kevin 能在不重启 Workspace 的情况下发现并更新 Materials 状态。
- Connector 授权失效时，用户能在 Workspace Home 看到明确状态。
- 执行类 Action 完成后，成功/失败都有可见闭环和 Audit 记录。
- 用户能暂停 Workspace 的 Always-on 服务。
- 用户能说清楚 Kevin 的 Always-on 是“持续维护上下文和闭环”，而不是“自动替我决策”。

---

## 11. 与其他文档的接口

| 文档 | 接口 |
|---|---|
| `01-product-strategy.md` | Always-on 标签与战略叙事 |
| `05-ux-ia-alignment.md` | Workspace Home 可见性和 Suggested Next Step |
| `08-connector-capability-governed-action.md` | Connector 状态、Capability 授权、ActionRequest |
| `10-ai-proactive-behaviors.md` | 具体主动行为和后台行为目录 |
| `11-first-encounter-spec.md` | Workspace 创建后的第一轮上下文建立 |
| `12-cognitive-capital.md` | 后台服务沉淀的认知资产类型 |

