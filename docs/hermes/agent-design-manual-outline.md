# 《Agent 核心技术设计手册》大纲 v2

> **定位**: 面向 KyberKit 团队及任何需要从零构建工业级 AI Agent 的工程团队。基于对 Hermes Agent (~55,000 行) 的完整逆向工程 + 官方架构解读，提炼可迁移的设计理念、最佳实践和避坑指南。
>
> **数据来源**:
> - 源码逆向: [codebase-highmap.md](./codebase-highmap.md) | [agent-runtime-architecture.md](./agent-runtime-architecture.md) | [prompt-architecture.md](./prompt-architecture.md) | [output-control-engineering.md](./output-control-engineering.md)
> - 官方解读: [腾讯云 — Hermes Agent 架构全解](https://cloud.tencent.com/developer/article/2652528)

---

## 第一部分：设计哲学与架构决策

### 1.1 单体自进化智能体 vs. 多智能体编排
- Hermes 的核心定位：**一个越用越强的单体 Agent**，而非多 Agent 协同调度框架
- 为什么选择"单体 + 自进化"而非"多 Agent + 中心路由" — 对比 OpenClaw 等多智能体方案
- **关键判断**: "记住发生了什么" vs. "记住什么管用" — 这一认知差距决定了整套架构

### 1.2 ReAct While Loop vs. Graph/DAG 状态机
- Hermes 为什么选择经典 ReAct 循环而非 LangGraph 式图编排
- 10,900 行 God Class 的工程权衡：集中控制 vs. 可维护性
- 何时应该（不应该）升级到图式编排

### 1.3 "让模型自由输出，用工程兜底" 的输出控制哲学
- 为什么放弃 `response_format` / JSON Schema 等 LLM 原生约束
- **Schema-free + 多层验证** 的工程权衡
- 确定性边界划定：哪些行为必须确定性保证，哪些允许概率性容忍

### 1.4 零遥测与隐私先行
- 零遥测是**架构属性**而非可选开关 — "天生不外发"的设计哲学
- 全部状态存储在本地 SQLite — 不依赖任何外部服务
- 对 Agent 产品设计的启示：隐私应该是默认约束，而非事后补丁

---

## 第二部分：学习循环 — Agent 自进化的核心引擎 🆕

> 这是 Hermes 最核心的架构差异化。大多数 Agent 只记住"发生了什么"，Hermes 记住"什么管用"并将其固化为可复用技能。

### 2.1 学习循环全景
- 闭环反馈系统的四个核心模块：记忆精选 → 技能生成 → 技能进化 → 会话检索
- 每个模块在工作流的不同节点触发 — 不是事后分析，而是嵌入运行时
- **设计理念**: 学习循环是"藏在每轮会话底下"的持续流程

### 2.2 Nudge — 自省式记忆精选机制
- **定时提醒 (Nudge) 设计**: `_memory_nudge_interval = 10` — 每 10 个 user turn 触发一次
- 内部系统提示让 Agent 回头复盘："刚才发生的事儿里，有没有值得存下来的？"
- **`_MEMORY_REVIEW_PROMPT`**: "Has the user revealed persona, desires, preferences...?"
- 整个过程不需要用户插手，Agent 自主判断 → 写入 MEMORY.md / USER.md
- **最佳实践**: 记忆库应是精选内容，而非聊天垃圾堆
- **源码验证**: `run_agent.py` L7897–L7903 (turn 计数 + 条件触发) → L2134–L2167 (Review Prompt 定义) → L2169–L2260 (`_spawn_background_review` 后台 fork Agent 执行)

### 2.3 后台 Review 的 Fork Agent 架构
- `_spawn_background_review()` 的设计：fork 一个独立 `AIAgent` 实例，共享同一 `MemoryStore`
- 关键约束：`max_iterations=8`、`quiet_mode=True`、**禁用 nudge 递归** (`_memory_nudge_interval=0`)
- Review 在**响应交付之后**才执行 — 不与用户任务竞争模型注意力
- **最佳实践**: 后台自省必须是 best-effort — `try/except` 隔离，失败不阻塞主循环
- **避坑**: Review Agent 如果不禁用 nudge，会产生无限递归的 Review → Review → ...

### 2.4 自主技能生成与进化
- **Skill Nudge**: `_skill_nudge_interval = 10` — 每 10 次工具调用迭代触发 skill review
- **`_SKILL_REVIEW_PROMPT`**: "Was a non-trivial approach used that required trial and error...?"
- 触发条件（文章归纳）：5+ 工具调用 / 从错误恢复 / 用户修正 / 非直观有效路径
- **Patch 优先更新策略**: 只传旧文本和替换内容，不全量重写 — 省 Token + 避免改崩好用的部分
- `skill_manage` 工具支持 6 种操作：创建、补丁、编辑、删除、写文件、删文件
- **最佳实践**: 优先补丁而非全量改写 — 这是长期运行准确且省钱的关键
- **避坑**: 全量重写技能文件容易丢失原本好用的部分

### 2.5 学习循环与网关的集成
- 在 OpenClaw 等系统中，网关只管投递 — 技能、记忆、自动化走独立通道
- 在 Hermes 中，**网关是学习循环的一部分**: 进来一条消息就能触发技能生成，自动化结果也走同一网关回传
- **设计理念**: 将学习循环嵌入运行时心跳，而非作为离线后处理

---

## 第三部分：四层内存系统 🆕

> "把所有记忆混在一块儿，正是大多数 Agent 越用越拉胯的原因。" — Hermes 直接拆成四层独立内存。

### 3.1 内存分层架构总览
- **情景记忆 vs. 过程记忆** 的分离原则：Session Retrieval 记住"发生了什么"，Skill 记住"该怎么做"
- 四层各司其职、分开存储、不搅成一锅粥
- 每层的职责边界、存储位置、读取时机

| 层级 | 名称 | 存储 | 加载时机 | 职责 |
|:---:|:---|:---|:---|:---|
| L1 | **Prompt Memory** | MEMORY.md + USER.md | 会话开始自动注入 | 常驻用户画像 + Agent 笔记 |
| L2 | **Session Retrieval** | SQLite + FTS5 | Agent 主动调取 | 情景记忆：跨会话历史检索 |
| L3 | **Skills** | ~/.hermes/skills/*.md | 渐进式披露 | 过程记忆：可复用工作流 |
| L4 | **Honcho** (Optional) | 外部服务 | 跨会话自动建模 | 用户建模 (12 维度辩证建模) |

### 3.2 Layer 1: Prompt Memory (MEMORY.md + USER.md)
- 常驻层：每次会话处理第一条消息前自动注入 System Prompt
- **硬上限 3,575 字符** — 故意设得紧凑，逼你精选而非堆内容
- `memory` 工具支持三种操作：添加、替换、删除
- **关键设计**: 会话中的修改**下次会话才生效** — 避免当前会话中途语义漂移
- **避坑**: 不限大小的记忆文件会吞噬 System Prompt 的 Prefix Cache 空间

### 3.3 Layer 2: Session Retrieval (SQLite + FTS5 + LLM Summarization)
- 全文检索：所有会话存入 SQLite 并用 FTS5 建索引
- **检索 → 摘要 → 注入** 三步流程：不把整段旧对话塞进上下文，而是 LLM 先做摘要再注入
- "持久度"判断原则：重要到每次都该带着的 → L1；特定话题才用的 → L2
- Agent 通过 Nudge 环节自主判断应存入 L1 还是留在 L2
- **最佳实践**: 使用 FTS5 而非向量数据库 — 轻量、确定性、无外部依赖
- **源码验证**: `hermes_state.py` (SessionDB), `tools/session_search_tool.py`

### 3.4 Layer 3: Skills — 渐进式披露与过程记忆
- Skills 以独立 Markdown 文件存储在 `~/.hermes/skills/`
- **渐进式披露设计**: 默认只加载技能名 + 简介 → Agent 判断需要时才载入完整内容
- **Token 恒定性**: 200 个技能 ≈ 40 个技能的上下文开销 — 详细内容只在真要用时进场
- 格式遵循 **agentskills.io 开放标准** — 技能可跨兼容智能体迁移、分享
- Frontmatter 条件激活：`requires_tools`, `requires_toolsets`, `fallback_for_tools`, `platforms`
- **最佳实践**: 技能是"过程记忆"，记住该怎么做；会话检索是"情景记忆"，记住发生了什么
- **避坑**: 将全部技能内容直接注入 System Prompt — token 爆炸 + 注意力稀释

### 3.5 Layer 4: Honcho — 可选的用户建模层
- 不等待显式写入，跨会话默默画像：偏好、说话风格、专业领域
- **辩证建模**: 在 12 个身份层同时建模"你"和"Agent"的互动关系
- 适用场景：日常私人助理、回复风格高度贴合 → 值得启用；专用任务/自动化 → 前三层够用
- **设计理念**: 被动观察建模 vs. 主动询问建模的权衡

---

## 第四部分：Prompt 工程方法论

### 4.1 System Prompt 的 9 层分层组装
- **Layered Assembly 模式**: 每层独立可控，条件门控精确节约 token
- 层排列顺序对 Prefix Cache 命中率的影响
- **避坑**: 在 System Prompt 中段插入易变内容导致 75% 缓存失效

### 4.2 Prefix Cache 友好的静态 / 动态分离
- **Stable Prefix 原则**: System Prompt 会话级缓存 + Ephemeral 尾部追加
- 记忆召回和插件上下文注入到 **User Message** 而非 System Prompt
- **三种缓存击穿条件**: 会话中途切模型、改记忆文件、改上下文文件
- **最佳实践**: 确定性 `tool_call_id` (SHA256) 而非随机 UUID，保持 prefix 稳定

### 4.3 模型特化行为约束
- GPT / Claude / Gemini 的独立 Behavioral Steering Prompt
- **TOOL_USE_ENFORCEMENT_GUIDANCE**: 在 Prompt 层强制模型调用工具而非口头承诺
- **Codex ACK 拦截器**: 模型说 "I'll look into it" 时在代码层强制执行

### 4.4 上下文压缩的 Prompt 设计
- **结构化摘要模板 (11 Section)**: Goal / Progress / Key Decisions / Relevant Files / Remaining Work ...
- 首次压缩 vs. 迭代更新的双模式架构
- **压缩即整合**: 哨兵机制在硬上限前触发辅助模型做摘要，原始对话血统链保留在 SQLite
- **避坑**: 自由格式摘要导致关键信息（未回答请求、文件路径）不可追踪地丢失

### 4.5 子代理 Prompt 的隔离设计
- Task → Context → Workspace → Output Format 的聚焦结构
- **继承工作目录但隔离** Memory、Context Files、敏感工具
- **避坑**: 子代理共享父 Context → 上下文污染 + 工具安全泄露

---

## 第五部分：工具系统设计

### 5.1 Tool Schema 设计规范
- **OpenAI Function Calling 协议** 作为通用契约层
- 手写 dict schema vs. 自动生成的权衡
- description 应同时包含功能说明和替代建议

### 5.2 Self-Registration 工具注册模式
- 模块导入时自注册 vs. 中心配置文件
- **防影子覆盖** + **Toolset 可用性门控** + **线程安全 (RLock)**
- **避坑**: MCP/Plugin 意外覆盖内置工具；注册表并发写入 Race Condition

### 5.3 工具分发与并行执行策略
- 安全并行判定：纯读白名单 + 路径作用域冲突检测
- `_NEVER_PARALLEL_TOOLS` / `_cap_delegate_task_calls` / `_deduplicate_tool_calls`
- **避坑**: 并行写入同一文件的 Race Condition

### 5.4 内置工具体系 (5 类 40+)
- **执行类**: 终端命令、代码运行
- **网页类**: 搜索、浏览器自动化
- **媒体类**: 视觉理解、文生图、TTS
- **协同类**: 子智能体调度（delegate_task）、多模型推理
- **记忆与规划类**: memory / todo / session_search / skill_manage

### 5.5 MCP 集成与插件钩子
- 动态工具发现：`_register_server_tools()` 的 nuke-and-repave 策略
- 4 个插件钩子：`pre_llm_call` / `post_llm_call` / `on_session_start` / `on_session_end`
- **最佳实践**: 不分叉代码、不改内部逻辑，在关键节点插入自定义逻辑

---

## 第六部分：LLM 输出控制与防护栏体系

### 6.1 四级 Retry 状态机
- 每种畸形输出独立计数器 + 独立降级策略
  - Scratchpad 完整性 (max 2) → Tool Name 验证 (max 3) → JSON 参数 (max 3) → 空响应 (max 3)
- **截断 vs. 格式错误区分**: 检查 JSON 尾部闭合括号
- **避坑**: 单一 `retry_count` 混合处理所有错误类型

### 6.2 工具名称模糊修复
- 三级递进：Lowercase → Normalize (连字符→下划线) → Fuzzy Match (difflib, cutoff=0.7)
- **最佳实践**: 修复后直接继续执行，而非拒绝 + 重试

### 6.3 Self-Correction 循环设计
- 注入恢复 vs. 静默重试 的选择策略
- 用 `tool` role 注入纠错信息（保持 role alternation），而非 `user` role

### 6.4 Empty Response Recovery Chain
- 五级恢复：Stream Recovery → Prior Turn Fallback → Thinking Prefill → Retry × 3 → Provider Fallback
- **Thinking Prefill**: 保留 reasoning-only 响应让模型续写 visible content
- **避坑**: 不区分 `_has_structured` 和 `_truly_empty` 导致推理模型自旋

### 6.5 Provider Fallback Chain
- 6 种触发场景 + 原地替换策略 + **Turn-scope 恢复**
- 自动 Failover 不打断执行流程：会话继续、上下文保留、用户感知不到故障
- **避坑**: Fallback 模型 context window 更小 — 必须同步更新 Compressor 阈值

---

## 第七部分：安全与防御性工程

### 7.1 Prompt Injection 防御
- 10 种威胁模式检测 + 不可见 Unicode 字符过滤
- 可疑内容**整体替换为 BLOCKED 标记**
- **避坑**: 仅扫描部分文件留下注入通道

### 7.2 敏感信息脱敏
- 30+ API Key 前缀模式 + ENV 赋值 + JSON 字段 + Auth Header + DB 连接串 + PII
- **Import-time 安全快照**: Redaction 开关在模块导入时固化，防 LLM 运行时绕过
- **避坑**: `export HERMES_REDACT_SECRETS=false` 可被 LLM 生成的命令绕过

### 7.3 工具执行安全边界
- Sensitive Path 拦截 / 设备路径阻断 / Re-read Loop 硬阻断 (4 次) / File Staleness Detection

### 7.4 反循环与资源保护
- **IterationBudget**: 线程安全计数器 (max 90) + grace call
- 子代理隔离：独立预算 (max 45) + 敏感工具剥离
- `_cap_delegate_task_calls()` 限制单 turn 最大子代理数

---

## 第八部分：上下文窗口管理

### 8.1 五阶段上下文压缩算法
- Phase 1: 剪枝旧工具结果 (纯规则) → Phase 2: 保护 Head/Tail → Phase 3: LLM 结构化摘要 → Phase 4: 孤立 Tool Result 清理 → Phase 5: 迭代更新
- **压缩即整合**: 辅助模型做摘要而非直接删除，原始对话血统链保留在 SQLite

### 8.2 工具结果的三层 Token 预算
- Layer 1: 工具内置截断 → Layer 2: Per-result 溢出 (100K) → Layer 3: Per-turn 聚合 (200K)
- `read_file` 豁免截断：patch 工具依赖完整原文
- `<persisted-output>` 替换格式 + Sandbox 跨环境统一写入

### 8.3 128K 大上下文窗口的工程考量
- 长会话不容易提前触发压缩，预检有更大缓冲空间
- 但 context 越大 ≠ 越好 — 关键信息在超长 context 中的注意力衰减问题
- **最佳实践**: 即使有 128K，仍应保持压缩机制作为安全网

---

## 第九部分：执行环境与沙箱安全 🆕

### 9.1 六种终端后端
| 后端 | 适用场景 |
|:---|:---|
| **Local** | 个人本机使用 |
| **Docker** | 容器隔离，不污染宿主机 |
| **SSH** | 远程服务器操作 |
| **Daytona** | 无服务器，闲置休眠用时拉起 |
| **Modal** | 无服务器，按需计算 |
| **Singularity** | HPC/科研环境，不让用 Docker 时的替代 |

### 9.2 容器加固默认策略
- Docker 模式下**默认启用**：只读根文件系统、移除 Linux 特权权限、命名空间隔离
- 这些是**架构级默认设置**，不是可选开关 — Agent 没法乱写目录、也提不了权
- **设计理念**: 安全防护应该是默认约束而非可选增强

### 9.3 跨环境一致性抽象
- `BaseEnvironment` ABC 统一 execute / get_temp_dir / file 等接口
- 工具结果持久化 (`tool_result_storage.py`) 跨 Local/Docker/SSH/Modal 统一行为
- **避坑**: 不同环境的 tmp 路径不一致导致持久化文件找不到

---

## 第十部分：Cron 定时自动化 🆕

### 10.1 定时任务作为一等公民
- 不是"调 AI 的 Shell 脚本"，而是**完整 Agent 循环执行**的定时任务
- 任务以完整权限调用内存和技能执行，流程和交互式会话完全一样
- 触发源从消息变成时钟，结果通过网关投递到指定平台

### 10.2 调度架构
- 三种调度模式：`once` (一次性) / `interval` (间隔) / `cron` (cron 表达式)
- 存储在 `~/.hermes/cron/jobs.json`，输出保存到 `~/.hermes/cron/output/{job_id}/{timestamp}.md`
- Gateway 的 `tick()` 每 60 秒检查一次，file-based lock 防止并发 tick
- **避坑**: cron 任务与交互式会话共享 Agent 状态 — 需要会话级隔离

### 10.3 会话持久化架构
- `hermes_state.py` 管理的 SQLite 数据库 — 便携文件型存储，不依赖外部服务
- 原始对话存为 **JSONL** 格式
- **WAL 模式** 支持单写多读 — 多会话并行时的并发安全保障
- 定时任务单独存盘，FTS5 索引支持跨会话检索
- **最佳实践**: 压缩过的会话也保留原始对话血统链 — 可追溯更早上下文

---

## 第十一部分：多模型与多 Provider 适配

### 11.1 API Mode 三态路由
- `chat_completions` / `codex_responses` / `anthropic_messages` — Provider + Base URL + Model 三维判定
- **自动 Failover**: 在 config.yaml 配置推理服务商优先级链

### 11.2 Credential Pool 与 Key 轮换
- 多 API Key 自动轮换 + Rate Limit 感知
- **避坑**: 单 Key Rate Limit 导致整个 Agent 停摆

### 11.3 模型行为差异的工程对策
- 6 种 Reasoning 标签变体的统一处理
- Tool Call ID sanitization（Provider 返回格式不一致）
- **Prompt Caching 一致性**: 大多数服务商都会缓存稳定前缀 — 切模型/改记忆文件/改上下文文件才会击穿

---

## 第十二部分：可扩展性设计模式

### 12.1 插件系统 — 最少代码扩展
- **MemoryProvider ABC**: 10+ 生命周期 Hook 的模板方法模式
- **ContextEngine ABC**: 可替换的上下文管理算法
- **最佳实践**: 默认空实现 + 可选覆盖 = 最小化插件实现成本
- **避坑**: 插件异常不应阻断主循环

### 12.2 技能的开放标准与可迁移性
- **agentskills.io 开放标准**: 技能可跨兼容 Agent 直接迁移、分享，无需格式转换
- Frontmatter 元数据规范：name / description / version / platforms / metadata.hermes.*
- Skill 仓库来源：预置 (40+) + 自创 + 技能中心下载

### 12.3 多平台网关的接入抽象
- `BasePlatformAdapter` 的 Message → Event 标准化
- 会话绑定 ID 而非平台 — Telegram 开头、终端接着聊
- Telegram **项目对话**: 话题功能跑独立工作流 (专属技能绑定 + 独立上下文)
- **避坑**: 不同平台消息长度上限 (Telegram 4096, Discord 2000)

---

## 第十三部分：反模式与避坑指南总汇

### 13.1 架构级反模式
- ❌ **God Class**: 10,900 行 `AIAgent` → 重构方向：`TurnExecutor` + `ErrorRecoveryChain`
- ❌ **内置工具硬编码 if/elif** → 统一 Registry dispatch
- ❌ **12 个 Callback 参数** → `EventBus` / `AgentEventListener`

### 13.2 学习循环反模式
- ❌ 只记住发生了什么，不记住什么管用（无技能生成）
- ❌ 全量重写技能而非 patch（丢失好用部分 + 浪费 token）
- ❌ Review Agent 不禁用 nudge（无限递归）
- ❌ 记忆不设大小上限（3,575 字符上限是刻意设计）

### 13.3 Prompt 级反模式
- ❌ 在 System Prompt 中段插入 turn-level 变量（破坏 Prefix Cache）
- ❌ 将全量知识库/技能直接注入 System Prompt（token 爆炸 + 注意力稀释）
- ❌ 压缩摘要使用自由格式（关键信息不可追踪地丢失）

### 13.4 LLM 控制级反模式
- ❌ 单一 `retry_count` 混合处理所有错误类型
- ❌ 截断和格式错误不加区分地重试
- ❌ Fallback 模型永久替代主模型（应 turn-scope 回弹）
- ❌ Redaction 开关通过运行时环境变量控制

### 13.5 工具 / 执行级反模式
- ❌ 工具输出不限大小直接注入 messages
- ❌ 不检测重复读取（Agent 陷入 read 循环）
- ❌ 文件写入前不检查 staleness
- ❌ 容器安全作为可选开关而非默认约束

---

## 附录

### A. 术语表
| 术语 | 定义 |
|:---|:---|
| ReAct | Reasoning + Acting 循环模式 |
| Nudge | 定时触发的自省式记忆/技能审查机制 |
| Prefix Cache | LLM API 对稳定输入前缀的缓存优化 |
| Ephemeral Prompt | 临时注入到 System Prompt 尾部的易变内容 |
| Thinking Prefill | 保留 reasoning-only 响应让模型在下一 turn 续写 |
| Progressive Disclosure | 渐进式披露：默认只加载索引，按需加载完整内容 |
| Patch-first Evolution | 优先补丁更新而非全量重写 |
| Episodic Memory | 情景记忆：记住"发生了什么" (Session Retrieval) |
| Procedural Memory | 过程记忆：记住"该怎么做" (Skills) |
| agentskills.io | 技能文件的开放标准格式 |
| Turn-scope Fallback | Fallback 仅在当前 turn 生效，下次恢复主模型 |
| SOUL.md | 用户可编辑的 Agent 身份文件 |

### B. 各章节与源码分析报告的对照表

| 手册章节 | 源码分析报告 | 核心源文件 |
|:---|:---|:---|
| 第一部分 | codebase-highmap + runtime-architecture | run_agent.py |
| 第二部分 | runtime-architecture §5 + 源码验证 | run_agent.py L2130–L2260, L7887–L7920, L10610–L10640 |
| 第三部分 | codebase-highmap §2D + runtime-architecture §3 | agent/memory_manager.py, hermes_state.py, tools/memory_tool.py |
| 第四部分 | prompt-architecture | agent/prompt_builder.py, agent/context_compressor.py |
| 第五部分 | output-control §2 | tools/registry.py, model_tools.py |
| 第六部分 | output-control §1, §3 | run_agent.py L9750–L10370 |
| 第七部分 | prompt-architecture §4 + output-control §3 | agent/redact.py, tools/file_tools.py |
| 第八部分 | prompt-architecture §2 + runtime-architecture §4 | agent/context_compressor.py, tools/tool_result_storage.py |
| 第九部分 | codebase-highmap §2A | tools/environments/*.py |
| 第十部分 | 源码验证 | cron/jobs.py, cron/scheduler.py, hermes_state.py |
| 第十一部分 | runtime-architecture §1 | run_agent.py, agent/anthropic_adapter.py |
| 第十二部分 | codebase-highmap §2D | agent/memory_provider.py, gateway/, skills/ |
| 第十三部分 | 全部报告的重构建议汇总 | — |

### C. 快速检查清单（新 Agent 项目 Day 1 Checklist）

**学习循环**
- [ ] 是否有自省式记忆精选机制？（Nudge 模式）
- [ ] 是否支持将成功工作流自动固化为可复用技能？
- [ ] 技能更新是否优先 patch 而非全量重写？

**内存系统**
- [ ] 是否将情景记忆和过程记忆分开存储？
- [ ] Prompt Memory 是否设置了字符上限？
- [ ] 技能加载是否采用渐进式披露？

**Prompt 工程**
- [ ] System Prompt 是否分层组装？是否有 Prefix Cache 友好的缓存策略？
- [ ] 动态内容是否与静态 Prompt 分离？Ephemeral 是否追加在尾部？
- [ ] 上下文压缩是否使用结构化模板？

**输出控制**
- [ ] 输出校验是否对不同错误类型有独立 retry 计数器？
- [ ] 是否有工具名模糊修复机制？
- [ ] 是否有 Provider Fallback + Turn-scope 恢复？

**安全**
- [ ] 用户可控文件是否经过注入扫描？
- [ ] 敏感信息脱敏是否覆盖工具输出通道？
- [ ] 容器安全是否设为默认约束而非可选开关？

**工具与执行**
- [ ] 工具结果是否有 per-result 和 per-turn 的大小限制？
- [ ] 是否有 re-read loop 硬阻断？
- [ ] 子代理是否隔离了父 Context 和敏感工具？

### D. Hermes 与其他 Agent 框架的架构对比

| 维度 | Hermes | 多 Agent 框架 (OpenClaw 等) |
|:---|:---|:---|
| **核心模式** | 单体自进化 | 多智能体协同调度 |
| **记忆哲学** | 记住"什么管用" + 固化为技能 | 记住"发生了什么" + 中心路由 |
| **学习方式** | 运行时闭环自进化 (Nudge → Skill) | 跨会话上下文保留 |
| **网关角色** | 学习循环的组成部分 | 纯消息投递 |
| **扩展方式** | 技能文件 (0 代码) + 插件钩子 | Agent 定义 + 编排配置 |
| **状态管理** | 本地 SQLite | 通常依赖外部数据库 |
| **适用场景** | 长期运行、持续进化的个人/专用助理 | 复杂多步任务的并行分治 |
