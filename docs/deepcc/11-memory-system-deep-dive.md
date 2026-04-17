# DeepCC-11: 记忆系统深度逆向工程

> 逆向目标:
> - `src/memdir/memdir.ts` (508行) — Memory Directory 核心 (Prompt 构建 + 入口文件管理)
> - `src/memdir/memoryTypes.ts` (272行) — 四类记忆分类体系 + 行为指令
> - `src/memdir/findRelevantMemories.ts` (142行) — LLM 驱动的记忆相关性检索
> - `src/memdir/memoryScan.ts` (95行) — 记忆文件扫描与 Frontmatter 解析
> - `src/memdir/paths.ts` (279行) — 记忆路径解析与安全校验
> - `src/services/SessionMemory/sessionMemory.ts` (496行) — Session Memory 后台提取引擎
> - `src/services/SessionMemory/prompts.ts` (325行) — Session Memory 模板与更新 Prompt
> - `src/services/extractMemories/extractMemories.ts` (616行) — 长期记忆提取器

---

## 1. 三层记忆架构全景

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude-Code 记忆系统                      │
│                                                             │
│  Layer 1: 持久记忆 (Persistent Memory — memdir/)            │
│    ├─ 存储位置: ~/.claude/projects/<slug>/memory/            │
│    ├─ 载体: MEMORY.md (索引) + topic files (详情)           │
│    ├─ 来源: 用户显式保存 + extractMemories 后台提取          │
│    ├─ 作用域: 跨 Session 持久化                             │
│    └─ 注入方式: System Prompt Section + findRelevantMemories │
│                                                             │
│  Layer 2: 会话记忆 (Session Memory — SessionMemory/)        │
│    ├─ 存储位置: ~/.claude/projects/<slug>/session-memory/    │
│    ├─ 载体: 结构化 Markdown (9 个固定 Section)              │
│    ├─ 来源: sessionMemory 后台 Forked Agent 提取            │
│    ├─ 作用域: 单次 Session                                  │
│    └─ 注入方式: compact 时替代 LLM 摘要 (Ch.10 L5)          │
│                                                             │
│  Layer 3: 上下文记忆 (Context Memory — compact/)            │
│    ├─ 载体: compact_boundary + summary messages              │
│    ├─ 来源: LLM 摘要压缩                                    │
│    ├─ 作用域: 单次 Session 内 (Turn 级)                     │
│    └─ 注入方式: 消息流内联 (详见第 10 章)                    │
└─────────────────────────────────────────────────────────────┘
```

**交互关系**:
- L2 (Session Memory) 可以**替代** L3 (Context Memory) 进行压缩 (SM-Compact, 零 API 成本)
- L1 (Persistent Memory) 在 compact 后通过 SessionStart Hook 重新注入
- extractMemories 和 SessionMemory 是**互补的**: extractMemories 提取跨 session 的持久记忆, SessionMemory 维护当前 session 的工作状态

---

## 2. 持久记忆核心: memdir/ 模块

### 2.1 记忆路径解析链 (paths.ts)

```
getAutoMemPath():  [memoized by projectRoot]
  │
  ├─ 优先级 1: CLAUDE_COWORK_MEMORY_PATH_OVERRIDE env var
  │   → 用于 Cowork 空间级挂载 (VM 进程名导致 per-session cwd 不同)
  │
  ├─ 优先级 2: autoMemoryDirectory in settings.json
  │   → 仅信任 policySettings / flagSettings / localSettings / userSettings
  │   → 排除 projectSettings (安全: 恶意 repo 可设 "~/.ssh" 获得写权限)
  │   → 支持 ~/ 展开 (但拒绝 "~", "~/", "~/." 等)
  │
  └─ 优先级 3: 默认路径
     ~/.claude/projects/<sanitized-git-root>/memory/
     │
     ├─ getMemoryBaseDir() → CLAUDE_CODE_REMOTE_MEMORY_DIR || ~/.claude
     ├─ findCanonicalGitRoot() → git worktree 共享同一记忆目录
     └─ sanitizePath() → 路径安全化

路径安全校验 (validateMemoryPath):
  拒绝: 相对路径, root路径(<3字符), Windows驱动器根, UNC路径, null字节
  返回: normalize() + 尾部 sep + NFC 规范化
```

### 2.2 记忆启用条件 (isAutoMemoryEnabled)

```
isAutoMemoryEnabled():
  优先级链 (first defined wins):
  1. CLAUDE_CODE_DISABLE_AUTO_MEMORY env → true: OFF, 0/false: ON
  2. CLAUDE_CODE_SIMPLE (--bare mode) → OFF
  3. CLAUDE_CODE_REMOTE 且无 REMOTE_MEMORY_DIR → OFF
  4. settings.json autoMemoryEnabled → 按值
  5. 默认: enabled
```

### 2.3 MEMORY.md 索引管理 (memdir.ts)

```
MEMORY.md 约束:
  MAX_ENTRYPOINT_LINES = 200
  MAX_ENTRYPOINT_BYTES = 25,000

truncateEntrypointContent(raw):
  1. Line 截断: 超过 200 行 → 保留前 200 行
  2. Byte 截断: 超过 25KB → 在 MAX_ENTRYPOINT_BYTES 前最后一个 \n 处截断
  3. 追加 WARNING 消息 (告知用户哪个限制被触发)
  
设计意义: MEMORY.md 是索引, 不是存储
  → 每条索引项应该是一行 <150 字符: "- [Title](file.md) — one-line hook"
  → 详细内容在 topic files 中
```

### 2.4 loadMemoryPrompt 分派逻辑

```
loadMemoryPrompt():
  │
  ├─ KAIROS + autoEnabled + getKairosActive():
  │   → buildAssistantDailyLogPrompt()
  │   → 追加模式: 写入 logs/YYYY/MM/YYYY-MM-DD.md
  │   → MEMORY.md 仅作为蒸馏索引 (nightly /dream 维护)
  │
  ├─ TEAMMEM + teamMemoryEnabled:
  │   → buildCombinedMemoryPrompt()
  │   → 自动目录 + 团队目录 (team/ 子目录)
  │   → private/team scope 分类
  │
  ├─ autoEnabled:
  │   → buildMemoryLines() 
  │   → 标准单目录记忆
  │
  └─ disabled:
     → return null
     → 记录 tengu_memdir_disabled 遥测
```

### 2.5 记忆行为指令 (buildMemoryLines)

系统 Prompt 中的记忆指令由以下 Section 组成：

```
buildMemoryLines(displayName, memoryDir, extraGuidelines, skipIndex):
  │
  ├─ 标题 + 目录介绍 + DIR_EXISTS_GUIDANCE
  │   "This directory already exists — write to it directly..."
  │   (消除 LLM 执行 mkdir 的倾向)
  │
  ├─ TYPES_SECTION (四类记忆分类, 见 §3)
  │
  ├─ WHAT_NOT_TO_SAVE_SECTION (排除项)
  │   - Code patterns / architecture (可从代码推导)
  │   - Git history (git log/blame 是权威源)
  │   - Debugging solutions (修复在代码中, 上下文在 commit message)
  │   - CLAUDE.md 中已有的内容
  │   - 临时任务细节
  │   ⚠️ 即使用户显式要求也要应用排除规则
  │
  ├─ How to save memories
  │   Step 1: 写 topic file (含 frontmatter)
  │   Step 2: 在 MEMORY.md 中添加索引行
  │
  ├─ WHEN_TO_ACCESS_SECTION
  │   - 相关时主动访问
  │   - 用户显式要求时必须访问
  │   - 用户说 "ignore" → 视为 MEMORY.md 为空
  │   
  ├─ TRUSTING_RECALL_SECTION (记忆验证)
  │   "A memory that names a specific function, file, or flag is a CLAIM"
  │   → 使用前验证: 检查文件存在、grep 函数名
  │   → 区分 "记忆说 X 存在" vs "X 现在存在"
  │
  └─ buildSearchingPastContextSection (过去上下文搜索)
     → Grep memory dir + transcript logs
```

---

## 3. 四类记忆分类体系 (memoryTypes.ts)

```
MEMORY_TYPES = ['user', 'feedback', 'project', 'reference']

┌──────────┬──────────────────────────────────────────────┬────────────┐
│ 类型      │ 描述                                         │ Scope      │
├──────────┼──────────────────────────────────────────────┼────────────┤
│ user     │ 用户角色/目标/知识/偏好                        │ always private │
│ feedback │ 用户给出的行为指导 (纠正 + 确认)                │ default private │
│ project  │ 项目进行中的工作/目标/事件 (非代码可推导)       │ bias toward team │
│ reference│ 外部系统的指针 (Linear/Grafana/Slack)          │ usually team │
└──────────┴──────────────────────────────────────────────┴────────────┘

每类记忆的 Prompt 指令包含:
  <name>      — 类型名
  <scope>     — private/team 推荐 (仅 COMBINED 模式)
  <description> — 详细描述
  <when_to_save> — 触发保存的条件
  <how_to_use>   — 如何使用该记忆
  <body_structure> — 建议的内容结构 (feedback/project 专有)
  <examples>     — 具体示例 (user→assistant 对话格式)
```

### 3.1 Frontmatter 格式

```markdown
---
name: {{memory name}}
description: {{one-line description — 用于未来相关性匹配}}
type: {{user, feedback, project, reference}}
---

{{memory content}}
```

### 3.2 feedback 记忆的特殊设计

```
feedback 类型的独特要求:
  1. 记录失败和成功 ("Record from failure AND success")
     → 仅记录纠正 → 模型变得过度保守, 偏离已验证的方法
     
  2. body_structure: Rule → Why → How to apply
     → 包含原因让模型能判断边界场景
     → 而不是盲目遵循规则
     
  3. 监听"静默确认"
     → "yes exactly", "perfect", 接受异常选择而无反对
     → 这些信号比显式纠正更难捕捉
```

> [!TIP]
> **feedback 记忆的 "Why" 字段**: 这是整个记忆系统中最精妙的设计之一。包含原因不仅帮助理解规则，更关键的是让模型在边界场景中能做出判断——"这个情况是否适用该规则？" 而非机械执行。

---

## 4. 记忆检索: findRelevantMemories

### 4.1 检索流程

```
findRelevantMemories(query, memoryDir, signal, recentTools, alreadySurfaced):
  │
  ├─ Phase 1: 扫描 (scanMemoryFiles)
  │   readdir(memoryDir, { recursive: true })
  │   → 过滤 .md 文件 (排除 MEMORY.md 本身)
  │   → 读取 frontmatter (前 30 行)
  │   → 按 mtime 降序排列
  │   → 上限: MAX_MEMORY_FILES = 200
  │   → 过滤已展示的 (alreadySurfaced)
  │
  ├─ Phase 2: LLM 选择 (selectRelevantMemories)
  │   model: Sonnet (getDefaultSonnetModel)
  │   system: SELECT_MEMORIES_SYSTEM_PROMPT
  │   input: query + formatMemoryManifest(memories) + recentTools
  │   output_format: JSON Schema (selected_memories: string[])
  │   max_tokens: 256
  │   querySource: 'memdir_relevance'
  │   → 最多返回 5 个文件名
  │   
  │   关键规则:
  │     - 默认选择性强 ("if unsure, don't include")
  │     - recentTools 用于排除正在使用的工具的文档
  │     - 但保留工具的 warnings/gotchas/known issues
  │
  └─ Phase 3: 结果映射
     selected filenames → { path, mtimeMs }
     + MEMORY_SHAPE_TELEMETRY 遥测

格式化 Manifest (formatMemoryManifest):
  "- [type] filename (ISO timestamp): description"
  → LLM 基于 type + description 判断相关性
```

### 4.2 设计决策

| 决策 | 理由 |
|---|---|
| 使用 Sonnet 而非主模型 | 成本低、速度快、选择任务不需要强推理 |
| JSON Schema 强制输出格式 | 消除解析歧义，确保返回有效文件名 |
| 排除 recentTools 的使用文档 | 正在使用的工具已有上下文，再注入是噪声 |
| 保留 recentTools 的 gotchas | 正在使用时恰恰最需要知道已知问题 |
| alreadySurfaced 去重 | 5 slot 预算有限，避免重复选择 |

---

## 5. Session Memory 后台提取引擎 (SessionMemory/)

### 5.1 初始化与注册

```
initSessionMemory():
  │
  ├─ Guard: !getIsRemoteMode()
  ├─ Guard: isAutoCompactEnabled()
  │   (SM 用于压缩,尊重 auto-compact 设置)
  │
  └─ registerPostSamplingHook(extractSessionMemory)
     → 注册到 post-sampling hook 链
     → 每次 LLM 返回后触发
```

### 5.2 提取触发条件

```
shouldExtractMemory(messages):
  │
  ├─ 初始化阈值 (首次触发):
  │   tokenCountWithEstimation(messages) >= minimumMessageTokensToInit
  │   默认: (远程配置, 非硬编码)
  │
  ├─ 更新阈值 (后续触发):
  │   条件 A: hasMetTokenThreshold AND hasMetToolCallThreshold
  │   条件 B: hasMetTokenThreshold AND !hasToolCallsInLastTurn
  │   
  │   → Token 阈值始终必须满足 (防止过度提取)
  │   → 条件 B: 自然对话中断点 (无 tool call → 可能是对话暂停)
  │
  └─ 更新后: lastMemoryMessageUuid = 最后一条消息 UUID
```

### 5.3 提取执行链

```
extractSessionMemory(context):  [sequential wrapper]
  │
  ├─ Guard: querySource === 'repl_main_thread'
  ├─ Guard: isSessionMemoryGateEnabled()
  ├─ initSessionMemoryConfigIfNeeded() [memoized, 一次性]
  ├─ shouldExtractMemory(messages)
  │
  ├─ markExtractionStarted() → 设置 flag (compact 等待用)
  │
  ├─ setupSessionMemoryFile(toolUseContext):
  │   mkdir(sessionMemoryDir, 0o700)
  │   如果文件不存在 → 写入模板 (loadSessionMemoryTemplate)
  │   FileReadTool.call({ file_path: memoryPath }) → 读取当前内容
  │
  ├─ buildSessionMemoryUpdatePrompt(currentMemory, memoryPath):
  │   promptTemplate + {{currentNotes}} + {{notesPath}} 变量替换
  │   + generateSectionReminders(sectionSizes, totalTokens)
  │     → 超过 MAX_SECTION_LENGTH=2000 tokens/section 的提醒
  │     → 超过 MAX_TOTAL_SESSION_MEMORY_TOKENS=12000 的强警告
  │
  ├─ runForkedAgent({
  │     promptMessages: [summaryPrompt],
  │     cacheSafeParams,              ← 共享主对话缓存
  │     canUseTool: createMemoryFileCanUseTool(memoryPath),
  │     querySource: 'session_memory',
  │     overrides: { readFileState: setupContext.readFileState },
  │   })
  │   
  │   工具权限: 仅允许 FileEdit 操作 memoryPath
  │   → 所有其他工具和文件路径均 deny
  │
  ├─ recordExtractionTokenCount(tokenCount)
  ├─ updateLastSummarizedMessageIdIfSafe(messages)
  │   → 仅在最后一个 assistant turn 无 tool_call 时设置
  │   → 避免 orphaned tool_result
  │
  └─ markExtractionCompleted()
```

### 5.4 Session Memory 模板

```markdown
# Session Title
_A short and distinctive 5-10 word descriptive title for the session_

# Current State
_What is actively being worked on right now?_

# Task specification
_What did the user ask to build?_

# Files and Functions
_What are the important files?_

# Workflow
_What bash commands are usually run?_

# Errors & Corrections
_Errors encountered and how they were fixed_

# Codebase and System Documentation
_What are the important system components?_

# Learnings
_What has worked well? What has not?_

# Key results
_If the user asked a specific output, repeat the exact result here_

# Worklog
_Step by step, what was attempted, done?_
```

### 5.5 更新 Prompt 的关键指令

```
Session Memory Update Prompt 核心规则:
  1. "This message is NOT part of the actual user conversation"
     → 防止 LLM 将指令内容泄漏到笔记中
     
  2. NEVER modify/delete section headers or italic descriptions
     → 保持结构稳定性 (9 个固定 Section)
     
  3. "ONLY update the actual content that appears BELOW the italic descriptions"
     → 精确的编辑边界
     
  4. "It's OK to skip updating a section if there are no substantial new insights"
     → 防止 filler content ("No info yet")
     
  5. "Use the Edit tool in parallel and stop"
     → 单 message 多 Edit → 效率最大化
     
  6. Section size limits:
     MAX_SECTION_LENGTH = 2,000 tokens/section
     MAX_TOTAL_SESSION_MEMORY_TOKENS = 12,000 tokens
     → 动态生成 reminders 附加到 prompt
```

---

## 6. 长期记忆提取器 (extractMemories/)

### 6.1 架构定位

```
extractMemories vs SessionMemory:

  extractMemories:
  ├─ 触发: query loop 结束时 (无 tool call 的 assistant 消息)
  ├─ 目标: 跨 session 持久记忆 (user/feedback/project/reference)
  ├─ 输出: topic files in ~/.claude/projects/<slug>/memory/
  ├─ 工具权限: Read/Grep/Glob + 只读Bash + Edit/Write in memoryDir
  └─ 互斥: 如果主 Agent 已写记忆 → 跳过 (hasMemoryWritesSince)

  SessionMemory:
  ├─ 触发: post-sampling hook (Token + Tool Call 双阈值)
  ├─ 目标: 当前 session 工作状态
  ├─ 输出: 单一结构化 Markdown 文件
  ├─ 工具权限: 仅 FileEdit 对 memoryPath
  └─ 用途: SM-Compact (零 API 成本压缩)
```

### 6.2 Closure-Scoped State

```
initExtractMemories():
  创建闭包封装可变状态:
  ├─ inFlightExtractions: Set<Promise>  — 未完成的提取任务
  ├─ lastMemoryMessageUuid: string     — 游标 (已处理到的消息)
  ├─ hasLoggedGateFailure: boolean     — 一次性日志标记
  ├─ inProgress: boolean              — 重叠防护
  ├─ turnsSinceLastExtraction: number  — 节流计数器
  └─ pendingContext: object            — 暂存的待处理上下文
  
  暴露公开 API:
  ├─ executeExtractMemories(context, appendSystemMessage)
  └─ drainPendingExtraction(timeoutMs)
```

### 6.3 核心执行逻辑

```
runExtraction({context, appendSystemMessage, isTrailingRun}):
  │
  ├─ 互斥检测: hasMemoryWritesSince(messages, cursor)
  │   → 如果主 Agent 已写记忆 → 推进 cursor, 跳过
  │   → "主 Agent 和后台 Agent 每 Turn 互斥"
  │
  ├─ 频率控制: turnsSinceLastExtraction
  │   → tengu_bramble_lintel (默认 1, 即每个 Turn)
  │   → trailing runs 跳过此检查
  │
  ├─ 预注入记忆清单:
  │   formatMemoryManifest(scanMemoryFiles(memoryDir))
  │   → 避免 Agent 花费 Turn 执行 ls
  │
  ├─ 构建 Prompt:
  │   TEAMMEM? → buildExtractCombinedPrompt()
  │   else     → buildExtractAutoOnlyPrompt()
  │   参数: newMessageCount + existingMemories + skipIndex
  │
  ├─ runForkedAgent({
  │     querySource: 'extract_memories',
  │     forkLabel: 'extract_memories',
  │     skipTranscript: true,     ← 防止与主线程的竞态条件
  │     maxTurns: 5,              ← 防止验证兔子洞
  │     canUseTool: createAutoMemCanUseTool(memoryDir),
  │   })
  │
  ├─ 成功后: 推进 cursor, 提取 writtenPaths
  │   → 过滤 MEMORY.md (机械索引更新, 非用户可见的记忆)
  │   → appendSystemMessage(createMemorySavedMessage(memoryPaths))
  │
  └─ finally: 处理 trailing run
     if pendingContext → runExtraction(trailing)
     → 递归执行暂存的上下文
```

### 6.4 工具权限沙箱

```
createAutoMemCanUseTool(memoryDir):
  │
  ├─ REPL         → allow (ant 模式下替代原始工具)
  ├─ FileRead     → allow (只读, 无限制)
  ├─ Grep/Glob    → allow (只读, 无限制)
  ├─ Bash         → 仅 isReadOnly 命令:
  │     ls, find, grep, cat, stat, wc, head, tail
  │     → 其他命令 deny
  ├─ Edit/Write   → 仅 isAutoMemPath(file_path)
  │     → 限制在记忆目录内
  └─ 其他工具     → deny

安全边界:
  projectSettings 中的 autoMemoryDirectory 被排除
  → 恶意 repo 不能通过 settings.json 将写权限重定向到 ~/.ssh
```

### 6.5 Coalescing 与 Trailing Run

```
executeExtractMemoriesImpl:
  │
  ├─ inProgress = false?
  │   → runExtraction(context)
  │
  └─ inProgress = true?
     → pendingContext = { context, appendSystemMessage }
     → return (不等待)
     
runExtraction finally:
  if pendingContext:
    → runExtraction({...trailing, isTrailingRun: true})
    → cursor 已推进, 只处理新增消息
    
语义: "合并重叠调用, 但保证最终一致性"
  → 多个快速调用被合并为: 当前运行 + 一个 trailing 运行
  → pendingContext 总是保留最新的 (last-write-wins)
```

---

## 7. 子系统交互图

```
                 queryLoop Turn
                     │
  ┌──────────────────┼──────────────────────┐
  │                  │                      │
  ▼                  ▼                      ▼
post-sampling     query end            autoCompact
hook fires        (no tool_call)       触发
  │                  │                      │
  ▼                  ▼                      ▼
SessionMemory     extractMemories     trySessionMemoryCompaction
extractSessionMemory()                     │
  │                  │                     ▼
  │                  │              读取 SM 文件
  │                  │              替代 LLM 摘要
  │                  │                     │
  ▼                  ▼                     │
写入 session-      写入 memory/            │
memory/ 文件       topic files            │
                   + MEMORY.md            │
                                          │
  ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←
          SM-Compact closes the loop
```

---

## 8. 设计模式归纳

### 8.1 闭包隔离 + Fire-and-Forget

extractMemories 采用 `initExtractMemories()` 的闭包模式封装所有可变状态，而非模块级变量。这让测试可以通过 `initExtractMemories()` 获得干净状态，同时生产代码只初始化一次。

### 8.2 互斥提取 (Main Agent vs Background Agent)

```
主 Agent 写记忆? → Background Agent 跳过该 Turn
Background Agent 写记忆? → 主 Agent 的 Prompt 已有完整保存指令

"当主 Agent 主动写了记忆, 后台 Agent 不会重复提取同一段对话。"
```

### 8.3 Forked Agent Cache Sharing

SessionMemory 和 extractMemories 都通过 `runForkedAgent` 运行，共享主对话的 Prompt Cache 前缀。这是记忆后台提取成本低廉的关键——80%+ 的 input tokens 来自 cache read。

### 8.4 记忆验证指令 (TRUSTING_RECALL_SECTION)

Claude-Code 显式告知 LLM: **记忆中的内容是"声明"而非"事实"**。每次基于记忆推荐之前，必须验证文件/函数是否仍存在。这直接对抗了 LLM 的"过度信任自身生成内容"的倾向。

### 8.5 四类分类 + 排除规则

记忆类型被约束在不可从当前代码推导的信息上。代码模式、架构、git 历史等可推导内容被显式排除——即使用户要求保存也拒绝。这保证了记忆系统的**增量价值**: 每条记忆都提供了代码本身无法提供的信息。

---

## 9. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| 三层记忆架构 | 区分持久/会话/上下文三级记忆，各有独立生命周期和注入点 |
| MEMORY.md 索引 + topic files | 索引/详情分离: 索引始终在上下文中，详情按需加载 |
| findRelevantMemories (Sonnet) | 用低成本模型做记忆检索决策，主模型专注任务 |
| 四类分类 + 排除规则 | 严格定义记忆边界: 只存储不可从代码推导的信息 |
| feedback 的 Why + How to apply | 行为指导记忆必须包含原因和应用场景 |
| 互斥提取 (主 Agent / 后台 Agent) | 避免重复工作: 用 hasMemoryWritesSince 检测主动写入 |
| Forked Agent Cache Sharing | 后台任务复用主对话缓存，最小化额外 API 成本 |
| 记忆验证 (TRUSTING_RECALL) | 基于记忆推荐之前必须验证当前状态 |
| Session Memory 结构化模板 | 固定 Section 结构确保提取一致性，便于后续消费 |
| Coalescing + Trailing Run | 合并重叠调用但保证最终一致性的并发控制模式 |

> [!IMPORTANT]
> **核心发现**: 记忆系统的代码总量约 2700 行，但其中**超过 50% 的逻辑用于 Prompt Engineering**——告诉 LLM 什么该记、什么不该记、如何分类、如何验证。这说明在 LLM Agent 记忆系统中，"如何指导 LLM 管理记忆"比"如何存储和检索记忆"更为关键。KyberKit 应将记忆 Prompt 设计作为核心架构决策，而非实现细节。
