# DeepCC-08: System Prompt 构建器深度逆向工程

> 逆向目标:
> - `src/constants/prompts.ts` (915行) — 主提示词构建器
> - `src/constants/systemPromptSections.ts` (69行) — Section Registry DSL
> - `src/utils/api.ts` → `splitSysPromptPrefix()` — 缓存分段逻辑
> - `src/constants/system.ts` (96行) — Attribution Header 和 CLI Prefix

---

## 1. 总体架构：三层提示词结构

Claude-Code 的 System Prompt 是一个 **string[] 数组**，每个元素是一个独立的 prompt 段落。该数组被精心划分为三层：

```
┌─────────────────────────────────────────────────────┐
│  Layer 1: Attribution Header (L0)                   │
│  x-anthropic-billing-header: cc_version=...         │
│  cacheScope: null (不缓存 — 含 fingerprint)         │
├─────────────────────────────────────────────────────┤
│  Layer 2: CLI Sysprompt Prefix (L1)                 │
│  "You are Claude Code, Anthropic's official CLI..." │
│  cacheScope: 'org' 或 null (取决于 global mode)      │
├─────────────────────────────────────────────────────┤
│  Layer 3: Prompt Body (L2+)                         │
│                                                     │
│  ┌─ Static Sections ──────────────────────────┐    │
│  │  Intro / System / DoingTasks / Actions /    │    │
│  │  UsingTools / ToneAndStyle / Efficiency     │    │
│  │  cacheScope: 'global' (全用户共享)           │    │
│  ├─ ═══ SYSTEM_PROMPT_DYNAMIC_BOUNDARY ═══ ───┤    │
│  │  Dynamic Sections (Registry-managed)        │    │
│  │  session_guidance / memory / env_info /     │    │
│  │  language / output_style / mcp / scratchpad │    │
│  │  cacheScope: null (不缓存 — 会话特定)       │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

**设计意义**: 
- `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记将数组一分为二
- 标记之前的内容在 **所有用户/会话** 之间共享缓存 (scope='global')
- 标记之后的内容每次重新计算或从 section cache 读取
- 这种设计核心目标：**最大化 Anthropic API 的 Prompt Cache 命中率**

---

## 2. Section Registry DSL

### 2.1 两种 Section 类型

```typescript
// systemPromptSections.ts

// 类型 1: 缓存 Section — 计算一次，缓存到 /clear 或 /compact
systemPromptSection('name', () => computeValue())
// → { name, compute, cacheBreak: false }

// 类型 2: 不缓存 Section — 每个 Turn 重新计算
DANGEROUS_uncachedSystemPromptSection('name', () => computeValue(), '原因')
// → { name, compute, cacheBreak: true }
// "DANGEROUS" 命名是因为它会 bust prompt cache
```

### 2.2 解析机制

```typescript
resolveSystemPromptSections(sections):
  for each section:
    if (!cacheBreak && cache.has(name))
      → 返回缓存值
    else
      → await compute()
      → 存入 cache (setSystemPromptSectionCacheEntry)
      → 返回值

清除时机:
  /clear 命令 → clearSystemPromptSections()
  /compact 命令 → clearSystemPromptSections()
  同时重置 → clearBetaHeaderLatches() (缓存安全)
```

**关键洞察**: `DANGEROUS_uncachedSystemPromptSection` 仅用于 MCP Instructions（因为 MCP 服务器可能中途连接/断开）。所有其他 section 都被缓存直到 /clear。

---

## 3. getSystemPrompt() 完整组装流程

```
getSystemPrompt(tools, model, additionalDirs, mcpClients)
  │
  ├─ 快速退出: CLAUDE_CODE_SIMPLE → [极简提示]
  │
  ├─ 并行预取:
  │   Promise.all([
  │     getSkillToolCommands(cwd),      // Skill 命令列表
  │     getOutputStyleConfig(),          // 输出风格配置
  │     computeSimpleEnvInfo(model, dirs) // 环境信息
  │   ])
  │
  ├─ Proactive 模式检测:
  │   isProactiveActive() → 返回精简自主模式提示
  │
  └─ 标准组装:

  ┌─── Static Sections (BOUNDARY 之前) ────────┐
  │                                              │
  │  1. getSimpleIntroSection()                  │
  │     → "You are an interactive agent..."      │
  │     → CYBER_RISK_INSTRUCTION (安全指令)       │
  │     → URL 生成禁令                            │
  │                                              │
  │  2. getSimpleSystemSection()                 │
  │     → Markdown 输出规则                       │
  │     → 工具权限模式说明                         │
  │     → system-reminder 标签说明                │
  │     → 提示注入防护指令                         │
  │     → Hooks 说明                              │
  │     → 自动上下文压缩说明                       │
  │                                              │
  │  3. getSimpleDoingTasksSection()  [条件]      │
  │     → 12-15 条行为准则 (最核心的部分)          │
  │     → 包含反过度工程指令                       │
  │     → ant 用户额外: 注释规范 + 结果报告准则    │
  │                                              │
  │  4. getActionsSection()                      │
  │     → 可逆性/风险评估框架                     │
  │     → 危险操作清单 (git push, rm, etc.)       │
  │                                              │
  │  5. getUsingYourToolsSection()               │
  │     → 专用工具 vs Bash 优先级                 │
  │     → 并行工具调用指令                        │
  │     → Task 管理工具说明                       │
  │                                              │
  │  6. getSimpleToneAndStyleSection()           │
  │     → 无 emoji / 简洁 / file_path:line 引用  │
  │                                              │
  │  7. getOutputEfficiencySection()             │
  │     → ant: 专业的长格式沟通指南              │
  │     → 外部: "Go straight to the point"       │
  │                                              │
  ├─── SYSTEM_PROMPT_DYNAMIC_BOUNDARY ──────────┤
  │    (仅 shouldUseGlobalCacheScope() 时注入)    │
  │                                              │
  │  Dynamic Sections (Registry-managed):        │
  │                                              │
  │  8. session_guidance [cached]                │
  │     → AskUserQuestion 说明                   │
  │     → AgentTool/探索代理 说明                 │
  │     → SkillTool 说明                         │
  │     → Verification Agent 准则                │
  │                                              │
  │  9. memory [cached]                          │
  │     → loadMemoryPrompt() → CLAUDE.md 内容    │
  │                                              │
  │ 10. ant_model_override [cached]              │
  │     → 内部模型覆盖 (ant-only)                │
  │                                              │
  │ 11. env_info_simple [cached]                 │
  │     → CWD, git, platform, shell, OS          │
  │     → 模型 ID, 知识截止日期                   │
  │     → 最新 Claude 模型家族信息               │
  │                                              │
  │ 12. language [cached]                        │
  │     → "Always respond in {language}"          │
  │                                              │
  │ 13. output_style [cached]                    │
  │     → 自定义输出风格 (Output Style)           │
  │                                              │
  │ 14. mcp_instructions [DANGEROUS_uncached]    │
  │     → MCP 服务器自定义指令                    │
  │     → 唯一一个每 Turn 重新计算的 section      │
  │                                              │
  │ 15. scratchpad [cached]                      │
  │     → 临时文件目录指令                        │
  │                                              │
  │ 16. frc [cached]                             │
  │     → Function Result Clearing 说明           │
  │                                              │
  │ 17. summarize_tool_results [cached]          │
  │     → "Write down important info from results"│
  │                                              │
  │ 18. numeric_length_anchors [cached, ant-only]│
  │     → "Keep text between tool calls to ≤25w" │
  │                                              │
  │ 19. token_budget [cached, feature-gated]     │
  │     → Token 预算目标持续工作指令              │
  │                                              │
  │ 20. brief [cached, feature-gated]            │
  │     → Brief 模式指令                         │
  └──────────────────────────────────────────────┘
```

---

## 4. 缓存分段策略 (splitSysPromptPrefix)

`splitSysPromptPrefix()` 将 string[] 转换为 `SystemPromptBlock[]`，每个 block 携带 `cacheScope`：

### 4.1 三种模式

| 模式 | 条件 | Block 结构 |
|---|---|---|
| **Global Cache** | 1P + boundary 存在 + 无 MCP 渲染 | Attribution(null) → Prefix(null) → Static(global) → Dynamic(null) |
| **Org Cache (MCP)** | Global 启用但 MCP tool 存在 | Attribution(null) → Prefix(org) → Rest(org) |
| **Org Cache (Default)** | 3P / boundary 缺失 | Attribution(null) → Prefix(org) → Rest(org) |

### 4.2 识别机制

```
Attribution Header: 以 'x-anthropic-billing-header' 开头
CLI Prefix:         CLI_SYSPROMPT_PREFIXES Set 包含该字符串
Boundary:           === SYSTEM_PROMPT_DYNAMIC_BOUNDARY
其他:               按位置分为 static (boundary 之前) 或 dynamic (之后)
```

### 4.3 为什么 MCP 工具会降级到 org scope

MCP 工具的 Schema 是用户特定的（每个用户安装不同的 MCP Server），因此无法使用 `scope: 'global'`。当检测到 MCP 工具将被渲染（非 defer_loading）时，system prompt 降级为 org-level 缓存。

---

## 5. 提示词内容深度分析

### 5.1 核心行为指令 (getSimpleDoingTasksSection)

该 section 是 Claude-Code 最核心的行为塑造区域，包含以下关键指令：

```
反过度工程 (Anti-Overengineering):
  "Don't add features, refactor code, or make improvements beyond what was asked"
  "Don't add error handling for scenarios that can't happen"
  "Don't create helpers for one-time operations"
  "Three similar lines of code is better than a premature abstraction"

反过度注释 (Anti-Commenting, ant-only):
  "Default to writing no comments. Only add one when the WHY is non-obvious"
  "Don't explain WHAT the code does"
  "Don't remove existing comments unless you're removing the code"

结果诚实性 (Outcome Honesty, ant-only):
  "Never claim 'all tests pass' when output shows failures"
  "Never suppress or simplify failing checks to manufacture a green result"
  "Do not hedge confirmed results with unnecessary disclaimers"

完成验证 (Completion Verification, ant-only):
  "Before reporting a task complete, verify it actually works"
  "run the test, execute the script, check the output"

风险感知执行 (getActionsSection):
  "Consider the reversibility and blast radius of actions"
  提供 4 类高风险操作清单
  "measure twice, cut once"
```

### 5.2 输出效率差异化策略

```
ant 用户 (内部):
  600+ 字散文体沟通指南
  "Write for a person, not logging to a console"
  "Assume users can't see most tool calls or thinking"
  "Write so they can pick back up cold"
  "Avoid semantic backtracking"
  "Use inverted pyramid (leading with the action)"

外部用户:
  150 字极简指令
  "Go straight to the point"
  "Be extra concise"
  "If you can say it in one sentence, don't use three"
```

### 5.3 数字锚点 (Numeric Length Anchors, ant-only)

```
"Keep text between tool calls to ≤25 words.
 Keep final responses to ≤100 words unless the task requires more detail."

效果: 约 1.2% 输出 token 缩减 (vs 定性 "be concise")
```

---

## 6. 环境感知 (computeSimpleEnvInfo)

```
注入信息:
  ├─ Primary working directory: {cwd}
  ├─ Git worktree 检测 (如果是 → 特殊指令)
  ├─ Is a git repository: {isGit}
  ├─ Additional working directories
  ├─ Platform: {platform}
  ├─ Shell: {zsh|bash|...}
  ├─ OS Version: {uname -sr}
  ├─ 模型 marketing name + model ID
  ├─ 知识截止日期 (按模型)
  ├─ 最新 Claude 模型家族 ID 列表
  ├─ Claude Code 可用平台 (CLI/Desktop/Web/IDE)
  └─ Fast Mode 说明 (同一模型, 更快输出)

Undercover 模式:
  process.env.USER_TYPE === 'ant' && isUndercover()
  → 剥除所有模型名称和 ID (防泄露未发布模型)
```

---

## 7. Subagent 提示词增强

```
enhanceSystemPromptWithEnvDetails(existingPrompt, model, dirs, toolNames)
  │
  ├─ 注入 Notes:
  │   "Agent threads always have their cwd reset between bash calls"
  │   "use absolute file paths"
  │   "In your final response, share file paths that are relevant"
  │   "avoid using emojis"
  │
  ├─ Skill Discovery 指引 (条件注入)
  │
  └─ computeEnvInfo(model, dirs)
      → 完整版环境信息 (含 XML <env> 标签)
```

---

## 8. Attribution Header 架构

```
getAttributionHeader(fingerprint):
  format: "x-anthropic-billing-header: cc_version={VERSION}.{fingerprint};
           cc_entrypoint={entrypoint}; [cch=00000;] [cc_workload={workload};]"

  fingerprint:
    → computeFingerprintFromMessages() 基于第一条用户消息的字符计算
    → 用于 API 侧的来源追踪

  cch=00000:
    → NATIVE_CLIENT_ATTESTATION feature gate
    → Bun 的 HTTP 栈在序列化时用 attestation token 覆写
    → 服务器验证请求来自真实 Claude Code 客户端

  cc_workload:
    → cron / interactive / background 等上下文
    → API 侧用于 QoS 路由 (如 cron → 低优先级队列)
```

---

## 9. Proactive (自主) 模式提示词

当 `isProactiveActive()` 为 true 时，切换到完全不同的提示词结构：

```
核心差异:
  标准模式: "You are an interactive agent that helps users..."
  自主模式: "You are an autonomous agent. Use the available tools to do useful work."

关键指令:
  1. Tick 机制: <tick> 标签保持活跃,"just treat them as 'you're awake, what now?'"
  2. Sleep 管理: "If you have nothing useful to do, you MUST call SleepTool"
  3. 首次唤醒: "greet the user briefly and ask what they'd like to work on"
  4. 后续唤醒: "Look for useful work. A good colleague faced with ambiguity doesn't just stop"
  5. 终端焦点感知:
     - Unfocused: "Lean heavily into autonomous action"
     - Focused: "Be more collaborative — surface choices"
```

---

## 10. 核心设计模式归纳

### 10.1 Cache-Aware Prompt Segmentation

每个 prompt section 都被设计为**缓存友好的独立单元**。整体结构被 `DYNAMIC_BOUNDARY` 一刀切开：
- 上半部分：全用户共享，scope='global'
- 下半部分：会话特定，每次根据 section cache 解析

### 10.2 Conditional Inclusion (Feature Gates × User Type × Runtime)

```
三层条件过滤:
  Layer 1: feature('XXX')     → 构建时 DCE (Dead Code Elimination)
  Layer 2: USER_TYPE === 'ant' → 内部/外部差异化指令
  Layer 3: 运行时检测          → isGit, isWorktree, enabledTools.has(X)
```

### 10.3 DANGEROUS_ 命名约定

任何会导致 Prompt Cache 失效的操作都以 `DANGEROUS_` 前缀命名，强制代码审查时关注缓存影响。

### 10.4 Section Memoization vs Turn Recompute

```
Memoized (大多数):
  计算 1 次 → 缓存到 /clear 或 /compact
  代价: 如果运行时条件变化, section 内容可能过时
  收益: prompt cache 稳定性 (避免变更导致 bust)

Turn Recompute (仅 MCP instructions):
  每个 Turn 重新计算
  代价: 每次变更都 bust prompt cache
  收益: MCP 服务器连接/断开能被即时反映
```

---

## 11. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| DYNAMIC_BOUNDARY 分段 | 将 System Prompt 设计为 Static Prefix + Dynamic Suffix |
| Section Registry DSL | 用声明式 API 管理 prompt sections，支持 memoize 和条件注入 |
| DANGEROUS_ 命名约定 | 对缓存不安全操作使用 explicit 标记 |
| computeSimpleEnvInfo | 标准化环境感知信息注入 (CWD, Git, Shell, OS, Model) |
| 内部/外部差异化 | 通过用户类型维度控制指令精度和详细度 |
| Anti-Overengineering 指令 | 在 System Prompt 中用 "行为禁令" 约束模型过度设计倾向 |
| 数字锚点 | 用量化约束 (≤25 words) 替代定性描述 (be concise) |
| Proactive 模式 | 设计独立的 Autonomous Agent 提示词路径 |
| Attribution Header | 请求级别的来源追踪 + 客户端认证 |

> [!IMPORTANT]
> **关键发现**: Claude-Code 的 System Prompt 不是一段静态文本，而是一个 **动态构建的段落数组**，每个段落的缓存行为、条件注入、和用户类型维度都被精心设计。整个提示词系统的核心目标是 **在保持行为控制精度的前提下最大化 API Prompt Cache 命中率**。KyberKit 应将 Prompt 管理抽象为一个 **Section Registry + Cache Policy** 的独立子系统。
