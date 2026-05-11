# Kevin 2.0 Private Domain & Memory Governance

> 状态：Draft  
> 父文档：`./01-product-strategy.md`（私域全链路上下文 / Always-on）  
> 关联：`./12-cognitive-capital.md` / `./13-always-on-service-contract.md` / `./08-connector-capability-governed-action.md` / `./11-first-encounter-spec.md`

---

## 1. 文档目的

Kevin 2.0 的核心叙事包含两个高信任承诺：

```text
Kevin 在你的私域中持续服务。
Kevin 会记住你的上下文、判断、偏好和方法。
```

这两个承诺如果没有治理边界，会从差异点变成风险点。本文定义 Kevin 的私域与记忆治理规则：什么是私域、Kevin 可以读取什么、可以记住什么、如何展示、如何删除、如何导出、如何避免越权。

---

## 2. 核心原则

1. **私域优先**：Kevin 默认在用户授权的 Workspace / Library / Connector 范围内工作，不把数据边界扩大为隐含默认。
2. **最小必要读取**：为了当前任务读取必要材料，不把“已连接”解释为“全部可随意读”。
3. **记忆可见**：Kevin 记住的项目认知、偏好、判断框架和决策日志必须能被用户查看。
4. **用户可纠正**：用户可以修改 Kevin 的理解，并看到修改被记录。
5. **用户可删除**：用户可以删除或停用 Kevin 的记忆。
6. **作用域明确**：Workspace 记忆、用户级记忆、团队级记忆必须分开，不得静默升级。
7. **高价值记忆需透明**：越能影响未来输出的记忆，越需要清楚说明来源和影响。

---

## 3. 私域定义

Kevin 的“私域”不是单一存储位置，而是用户授权给某个 Workspace 使用的工作边界。

MVP 中私域由三类边界组成：

| 边界 | 示例 | 治理要求 |
|---|---|---|
| 本地目录边界 | Workspace `mount_path` | Kevin 只默认读该目录及允许子路径 |
| Connector 授权边界 | Data Warehouse / Feishu / Notion | 按 Capability 授权，不按系统整体授权 |
| Kevin 内部对象边界 | Materials / Artifacts / Audit / Cognitive Capital | 按 Workspace / Space 隔离 |

私域不是“永不调用云端模型”。如果使用云端 LLM，必须明确说明哪些内容会被发送、何时发送、是否可关闭。

---

## 4. 数据分类

Kevin 处理的数据分为五类：

| 类型 | 示例 | 默认存储 | 默认可见性 |
|---|---|---|---|
| 原始材料 | 本地文件、查询结果、外部文档 | Material / 文件镜像 | 用户可见 |
| 生成制品 | PRD、周报、行动计划 | SemanticArtifact | 用户可见 |
| 执行记录 | ActionRequest、Sign-off、Audit | Audit | 用户可见 |
| 认知资本 | C1-C6 用户画像、项目情境、偏好、框架、决策日志、外部指针 | 见 `12` | 必须可管理 |
| 系统遥测 | 性能、错误、使用事件 | 内部遥测 | 不应包含原文内容 |

系统遥测不得默认包含用户原始材料、生成内容全文、私有方法全文。若需要内容级样本用于调试，必须另行授权。

---

## 5. 记忆类型与治理要求

引用 `12-cognitive-capital.md` 的六类认知资产：

| 类型 | 默认作用域 | 是否需确认 | 用户能力 |
|---|---|---|---|
| C1 用户画像 | user | 可选确认 | 查看 / 编辑 / 删除 |
| C2 项目情境 | workspace | 无需确认 | 查看 / 编辑 / 删除 / 打开文件 |
| C3 行为偏好 | workspace 优先 | 无需确认，但需透明标注 | 查看 / 禁用 / 删除 / 提升作用域 |
| C4 判断框架 | workspace/user | **必须确认** | 预览 / 编辑 / 保存 / 删除 |
| C5 决策日志 | workspace | 无需确认 | 查看 / 标注 / 删除敏感条目 |
| C6 外部指针 | workspace/user | 可选确认 | 查看 / 删除 / 断开 |

### 5.1 不得静默升级作用域

Workspace 内观察到的偏好，不得自动升级为用户全局偏好。

必须显式询问：

```text
Kevin 注意到这个偏好已经在 3 个 Workspace 中出现。
要把它提升为你的通用偏好吗？[提升] [只保留在当前项目] [不再提示]
```

团队级共享必须更严格：

```text
这个判断框架可能包含你的私有方法。确认共享后，同一 Space 的成员可以看到并使用它。
```

---

## 6. 文件优先记忆的隐私规则

MVP 中至少两类记忆是 file-backed：

- `.kevin/cognition.md`
- `.kevin/cognition.history.jsonl`

未来可能包括：

- `.kevin/skill-drafts/*.md`
- `.kevin/preferences.md`
- `.kevin/decision-log.md`

### 6.1 文件优先的优势

- 用户可见、可编辑
- 可移植
- 可 git diff
- 不被 Kevin 私有数据库锁定

### 6.2 文件优先的风险

- 可能被误提交到公开仓库
- cognition history 可能包含用户纠正原话
- Skill 草案可能包含私有方法
- 团队目录中可能被他人看到

### 6.3 MVP 规则

- 首次创建 `.kevin/` 时，若目录是 git repo，默认建议加入 `.gitignore`。
- `cognition.md` 顶部必须包含隐私提示：

```markdown
> 此文件包含 Kevin 对你项目的理解，可能包含私人工作上下文。共享或提交前请检查。
```

- `cognition.history.jsonl` 比 `cognition.md` 更敏感，默认建议加入 `.gitignore`。
- Skill 草案默认只保存在当前 Workspace，不自动同步到团队。

---

## 7. LLM 调用边界

每次需要把私域内容发送给 LLM 时，Kevin 应遵循：

| 场景 | 默认行为 | 用户控制 |
|---|---|---|
| 第一次见面 Tier 1 | 发送目录结构 + README + 抽样文件内容 | 首次授权时说明 |
| Artifact 生成 | 发送相关 Material 片段和结构化上下文 | 由 Workspace LLM 设置控制 |
| Evidence 检索 | 优先本地检索，必要时发送候选片段 | 可关闭云端增强 |
| Skill 提取 | 发送判断信号摘要，不发送无关全文 | 可关闭自动 Skill 提议 |
| 遥测/评测 | 不发送内容全文 | 需单独授权 |

MVP 至少需要一个 Workspace 级设置：

```text
LLM 数据模式：
- 云端模型：允许把相关材料片段发送给配置的 LLM 服务
- 本地优先：只使用本地模型或本地索引；质量和速度可能下降
- 手动确认：每次发送前确认
```

---

## 8. 记忆可见性：My Kevin

`My Kevin` 是认知资本管理中心。MVP 可以先降级为 Settings + 文件入口，但必须让用户能管理至少 C2/C3/C4 三类会影响后续输出的记忆。

My Kevin 应展示：

- Kevin 对我的用户画像
- 当前 Workspace 的项目情境
- Kevin 记住的行为偏好
- 待确认的判断框架 Skill 草案
- 决策日志
- 外部系统指针
- 哪些记忆正在影响当前输出

每条记忆至少包含：

```text
内容
作用域
来源
最后使用时间
影响哪些行为
操作：禁用 / 编辑 / 删除 / 导出
```

MVP 最小可交付形态：

| 资产 | MVP 展示 | MVP 操作 |
|---|---|---|
| C2 项目情境 | 当前 Workspace 的 cognition 摘要和更新时间 | 打开 `.kevin/cognition.md` / 重新认识项目 |
| C3 行为偏好 | 偏好名称、来源信号数、作用域 | 查看 / 禁用 / 删除 |
| C4 判断框架 | 已确认 Skill 和待确认草案 | 预览 / 编辑 / 删除 |

Phase 2 再补 C1 用户画像、C5 决策日志搜索、C6 外部指针聚合和完整导出。

---

## 9. 删除、禁用与导出

### 9.1 删除

用户删除记忆后：

- Kevin 不再在未来输出中使用该记忆
- 相关索引应失效
- 删除动作写入 Audit 或本地管理日志
- 若记忆来自 file-backed 文件，用户可选择删除文件或仅断开 Kevin 镜像

### 9.2 禁用

禁用不同于删除。禁用保留来源和历史，但不参与生成：

```text
这个偏好已禁用。Kevin 会保留记录，但不会再按它调整输出。
```

### 9.3 导出

用户应能导出：

- Workspace Materials 清单
- Artifacts
- Audit
- `.kevin/` 认知文件
- C3/C4 偏好和 Skill

导出格式优先使用 Markdown / JSON / JSONL，避免锁定。

---

## 10. 安全默认值

MVP 默认规则：

- 敏感文件名自动跳过抽样：`.env`、`credentials.*`、`*.pem`、`*.key`、含 `secret` / `password` 的文件
- 不自动读取隐藏目录，除了 Kevin 自己的 `.kevin/`
- 不自动把 Workspace 记忆提升到用户级
- 不自动共享 Skill
- 不把 high risk Action 真实执行
- 不在用户未授权时读取 Workspace 根目录外的文件

---

## 11. 用户文案原则

隐私文案必须具体，不得泛泛说“我们重视隐私”。

好的表达：

```text
Kevin 将读取你选择的这个目录，用于建立 Workspace 上下文。
默认会跳过常见敏感文件名。生成的项目认知会写入 .kevin/cognition.md，你可以随时编辑或删除。
```

不好的表达：

```text
Kevin 会安全地处理你的数据。
```

---

## 12. MVP 验收标准

MVP 必须证明：

- 用户能看到 Workspace 的私域边界（本地目录 + 已连接 Connector）。
- 首次读取目录前，用户知道 Kevin 会读什么、写什么。
- `.kevin/cognition.md` 包含隐私提示。
- 常见敏感文件名不会进入第一次见面抽样。
- 用户能暂停 Always-on 服务。
- 用户能查看或打开 Project Context 记忆文件。
- C4 判断框架 Skill 不会在未确认前静默保存为正式 Skill。
- Connector 写入/执行能力必须经过 Capability + ActionRequest + Sign-off。

---

## 13. 与其他文档的接口

| 文档 | 接口 |
|---|---|
| `01-product-strategy.md` | 私域全链路上下文的战略承诺 |
| `02-object-model-and-artifact.md` | file_backed_material、directory_cognition |
| `07-skill-forge-productization.md` | C3/C4 记忆的确认、保存、作用域 |
| `08-connector-capability-governed-action.md` | Connector 授权和执行治理 |
| `11-first-encounter-spec.md` | 首次目录读取、`.kevin/` 文件写入 |
| `12-cognitive-capital.md` | 六类认知资产定义 |
| `13-always-on-service-contract.md` | 后台持续服务的控制权与可见性 |

