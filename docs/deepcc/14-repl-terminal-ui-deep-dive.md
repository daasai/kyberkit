# DeepCC-14: REPL 与终端 UI 架构深度逆向工程

> 逆向目标:
> - `src/screens/REPL.tsx` (5005行) — REPL 核心组件 (Query Loop, State, 屏幕管理)
> - `src/ink/ink.tsx` (1722行) — 魔改 Ink 渲染引擎 (双帧缓冲, Yoga layout, 终端 I/O)
> - `src/ink/screen.ts` (1486行) — 屏幕抽象层 (Cell 池, Damage Tracking)
> - `src/ink/reconciler.ts` (512行) — React Reconciler 适配层
> - `src/ink/output.ts` (797行) — 输出管道层

---

## 1. 总体架构：终端 UI 渲染管线

```
┌──────────────────────────────────────────────────────────────────┐
│                   Claude-Code 终端 UI 管线                       │
│                                                                  │
│  用户输入 (stdin)                                                │
│    ↓                                                            │
│  parse-keypress.ts → KeyboardEvent → useInput / ScrollHandler    │
│    ↓                                                            │
│  React State Updates (useState, useAppState)                     │
│    ↓                                                            │
│  React Reconciler (reconciler.ts) → DOM Tree (dom.ts)           │
│    ↓                                                            │
│  Yoga Layout (onComputeLayout) → CSS Flexbox 计算               │
│    ↓                                                            │
│  renderNodeToOutput (render-node-to-output.ts) → Screen Buffer  │
│    ↓                                                            │
│  Overlays: Selection → Search Highlight                         │
│    ↓                                                            │
│  log-update.ts → Diff (前帧 vs 后帧)                            │
│    ↓                                                            │
│  optimizer.ts → Patch 合并                                      │
│    ↓                                                            │
│  writeDiffToTerminal → stdout (ANSI 转义序列)                    │
│                                                                  │
│  帧率: FRAME_INTERVAL_MS (节流控制)                              │
│  缓冲: 双帧 (frontFrame / backFrame) 交换                       │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Ink 渲染引擎 (ink.tsx)

### 2.1 双帧缓冲 (Double Buffering)

```
Ink 类核心属性:
  frontFrame: Frame     ← 上一帧 (已渲染到屏幕)
  backFrame: Frame      ← 回收缓冲 (供下一帧复用)
  
onRender():
  frame = renderer({frontFrame, backFrame, ...})  ← 渲染新帧到 backFrame
  diff = log.render(frontFrame, frame)            ← 前帧/后帧差分
  optimized = optimize(diff)                      ← 合并相邻 patch
  writeDiffToTerminal(terminal, optimized)        ← 写入 stdout
  
  // 交换缓冲
  this.backFrame = this.frontFrame
  this.frontFrame = frame
  
意义:
  仅写入变化的 cell → 最小化 stdout I/O
  双缓冲 → 避免重新分配内存
  prevFrameContaminated → Selection 覆盖层污染前帧后需要全屏重绘
```

### 2.2 帧调度

```
scheduleRender = throttle(deferredRender, FRAME_INTERVAL_MS)
  leading: true, trailing: true

deferredRender():
  queueMicrotask(this.onRender)
  → 延迟到 React layout effects (useLayoutEffect) 完成后
  → 确保 cursorDeclaration 等 layout 状态已更新
  → 同一事件循环 tick, 不影响吞吐

scrollDrainPending:
  → 额外的 drain frame: setTimeout(onRender, FRAME_INTERVAL_MS >> 2)
  → 四分之一间隔 (~250fps 理论极限) 用于平滑滚动
```

### 2.3 Alt Screen (全屏模式)

```
altScreenActive: boolean
altScreenMouseTracking: boolean

Alt Screen 特性:
  ├─ 使用独立缓冲区 (ENTER_ALT_SCREEN / EXIT_ALT_SCREEN)
  ├─ 光标锚定 ALT_SCREEN_ANCHOR_CURSOR = {x:0, y:0, visible:false}
  │   → 每帧前 CSI H 重置物理光标
  │   → 防止 tmux 等 out-of-band 光标扰动
  ├─ Selection Overlay: applySelectionOverlay()
  ├─ Search Highlight: applySearchHighlight()
  ├─ Mouse Tracking: ENABLE/DISABLE_MOUSE_TRACKING
  └─ Resize 处理:
      needsEraseBeforePaint = true
      → ERASE_SCREEN 在 BSU/ESU 原子块内
      → 先保留旧内容 → 擦除+绘制原子切换

外部 TUI 交接 (git commit editor 等):
  enterAlternateScreen():
    → 暂停 Ink
    → 禁用 Kitty Keyboard + modifyOtherKeys + Mouse Tracking
    → 显示光标, 清屏
    
  exitAlternateScreen():
    → 重新进入 alt screen (vim 的 rmcup 导致退回 main screen)
    → 清屏 + 重绘
    → 恢复键盘扩展报告
```

### 2.4 光标声明系统

```
cursorDeclaration: CursorDeclaration | null
  ← useDeclaredCursor() 在 React useLayoutEffect 中设置
  ← 声明 "光标应该在这个 DOM 节点的 (relX, relY) 偏移处"

onRender() 中:
  rect = nodeCache.get(decl.node)  ← 从 Yoga layout 缓存获取绝对位置
  target = { x: rect.x + decl.relativeX, y: rect.y + decl.relativeY }
  
  // 仅当光标位置变化时才写入
  if (targetMoved):
    Alt Screen: CUP 绝对定位
    Main Screen: 相对移动 from frame.cursor

意义:
  IME (CJK 输入法) 预编辑文本渲染在物理光标位置
  Screen Reader / Magnifier 追踪物理光标
  → 光标声明 = 可访问性基础设施
```

### 2.5 对象池管理

```
stylePool: StylePool     ← ANSI 样式去重
charPool: CharPool       ← Unicode 字符去重  
hyperlinkPool: HyperlinkPool ← OSC 超链接去重

5 分钟周期性重置:
  if (renderStart - lastPoolResetTime > 5 * 60 * 1000):
    resetPools()
    → 防止长 Session 中池无限增长
    → migrateScreenPools(): 在 frontFrame 上重建引用
```

---

## 3. REPL.tsx 核心架构 (5005 行)

### 3.1 组件职责

```
REPL 是整个应用的 "God Component":
  
  输入管理:
    ├─ PromptInput (文本编辑器)
    ├─ useInput (键盘事件)
    ├─ useSearchInput (搜索模式)
    ├─ useVoiceIntegration (语音输入)
    └─ useIdeSelection (IDE 选择器)
  
  Query 生命周期:
    ├─ onSubmit → processInput → onQuery
    ├─ onQueryImpl → query() 调用 API
    ├─ handleMessageFromStream → setMessages
    └─ completeQuery → postSamplingHooks
  
  屏幕管理:
    ├─ screen: 'prompt' | 'transcript'
    ├─ FullscreenLayout (全屏 Alt Screen)
    ├─ Messages / VirtualMessageList
    └─ TaskListV2 (后台任务面板)
  
  权限 & 对话框:
    ├─ PermissionRequest (工具权限)
    ├─ ElicitationDialog (MCP 交互)
    ├─ CostThresholdDialog (成本阈值)
    ├─ IdleReturnDialog (空闲返回)
    └─ SandboxPermissionRequest (沙箱权限)
  
  状态同步:
    ├─ useAppState (React AppState)
    ├─ bootstrap/state.ts (全局单例)
    ├─ messagesRef (消息流引用)
    └─ abortController (取消控制)
```

### 3.2 Query Loop

```
onSubmit(input):
  → processInput(input)
  → 构建 UserMessage
  → setMessages([...old, userMsg])
  → onQuery(newMsgs, abortController, shouldQuery, ...)

onQuery(newMessages, ...):
  → 追加到 messagesRef
  → 等待 pendingHookMessages (如有)
  → onQueryImpl(allMessages, newMessages, ...)

onQueryImpl(messages, newMessages, abortController, ...):
  → diagnosticTracker.handleQueryStart()
  → generateSessionTitle() (首次消息)
  → 构建 toolUseContext
  → buildEffectiveSystemPrompt()
  → getUserContext() + getSystemContext()
  → snapshotOutputTokensForTurn(budget)
  
  for await (const event of query({messages, ...})):
    handleMessageFromStream(event, ...)
    → setMessages 更新
    → 处理 compact boundary
    → 处理 ephemeral progress (替换而非追加)
    → 处理 API error (设置 contextBlocked)
  
  → completeQuery()
  → executePostSamplingHooks()
  → saveCurrentSessionCosts()
```

### 3.3 屏幕双模式

```
screen 状态: 'prompt' | 'transcript'

'prompt' 模式:
  ├─ PromptInput 可见 (用户可输入)
  ├─ Messages 渲染最近消息
  ├─ 后台任务通知
  └─ 权限对话框

'transcript' 模式 (Ctrl+O 切换):
  ├─ 完整对话历史 (VirtualMessageList)
  ├─ 搜索功能 (/ 触发搜索栏)
  ├─ 虚拟滚动 (性能优化)
  ├─ showAllInTranscript 展开/折叠
  ├─ dumpMode: 退回到 scrollback 渲染 (cmd+F 原生搜索)
  └─ 编辑器集成 (v 键在外部编辑器中打开)

TranscriptModeFooter:
  → 显示快捷键提示
  → 搜索结果计数

TranscriptSearchBar:
  → less 风格 / 搜索栏
  → 增量搜索 (每次按键重新高亮)
  → 索引预热 (buildSearchIndex → warmSearchIndex)
```

### 3.4 Dead Code Elimination

```
编译时特性门控:

feature('VOICE_MODE') ? require('...') : () => stub
feature('COORDINATOR_MODE') ? require('...') : () => {}
feature('WEB_BROWSER_TOOL') ? require('...') : null
feature('PROACTIVE') || feature('KAIROS') ? require('...') : null

"external" === 'ant' ? require('...') : null
  → 内部 (ant) 构建包含, 外部构建消除
  
效果:
  → Bundler 在编译时评估 feature() 和字符串比较
  → 条件为 false 时, require() 目标被 tree-shaking
  → 外部构建不包含内部功能的代码 (UUID 列表等)
```

### 3.5 性能优化模式

```
1. 渲染隔离:
   AnimatedTerminalTitle — 独立组件
   → 960ms 动画 tick 仅重渲染此叶组件
   → 不拖拽 REPL 主树 (PromptInput, Messages 等)

2. Ephemeral Progress 去重:
   Sleep/Bash 每秒发一次 progress tick
   → 替换 (replace) 前一条同类 progress, 而非追加 (append)
   → 防止 messages[] 爆炸 (观察到 13K+ 条)
   → 防止 transcript 爆炸 (观察到 120MB)
   
3. Stable Empty Arrays:
   const EMPTY_MCP_CLIENTS: MCPServerConnection[] = []
   → 防止每次 render 创建 []
   → 避免 useEffect 依赖变化导致无限重渲染

4. Env-var 门控提升:
   useMemo(() => isEnvTruthy(process.env.XXX), [])
   → isEnvTruthy 做 toLowerCase+trim+includes
   → 从渲染热路径提升到 mount 时一次性求值
```

---

## 4. React Reconciler (reconciler.ts)

```
自定义 React Reconciler:
  ConcurrentRoot 模式
  
  目标 DOM: ink-specific DOM (dom.ts)
    DOMElement: {
      yogaNode: YogaNode   ← CSS Flexbox 布局引擎
      style: InkStyle       ← 对应 Box/Text 的样式
      childNodes: []
      focusManager: FocusManager
    }

  onComputeLayout():
    yogaNode.setWidth(terminalColumns)
    yogaNode.calculateLayout()
    → 每次 React commit 后计算布局
    
  resetAfterCommit():
    scheduleRender()
    → React commit 完成后触发渲染
```

---

## 5. 渲染优化：Damage Tracking

```
Screen 中的 damage 区域追踪:

renderNodeToOutput():
  → 遍历 DOM 树, 写入 Screen buffer
  → 跟踪每个节点的 damage rect
  → didLayoutShift(): 检测布局是否发生变化

full damage 触发条件:
  1. didLayoutShift() — 节点位置/尺寸变化
  2. selActive — Selection overlay 活跃
  3. hlActive — Search highlight 活跃
  4. prevFrameContaminated — 前帧被覆盖层污染

  → frame.screen.damage = { x:0, y:0, width, height }
  → diffEach 比较整个 damage 区域

稳态帧 (无布局变化):
  → 窄 damage: 仅比较变化区域
  → 最小化 diff 计算量
```

---

## 6. 终端写入管线

```
log-update.ts → LogUpdate:
  render(prevFrame, nextFrame, altScreen, syncOutput):
    → 逐 cell 比较 prevScreen vs nextScreen
    → 生成 Patch[] (stdout writes / clearTerminal)
    → 利用 damage rect 缩小比较范围
    
optimizer.ts → optimize(patches):
  → 合并相邻 stdout patches
  → 减少 write() 系统调用次数

terminal.ts → writeDiffToTerminal(terminal, patches, needsSync):
  if SYNC_OUTPUT_SUPPORTED:
    → DEC 2026 BSU/ESU 同步输出
    → 原子更新: 终端在 BSU/ESU 间不渲染中间状态
  else:
    → 普通写入 (tmux 等不支持同步输出的场景)
```

---

## 7. 设计模式归纳

### 7.1 God Component 与 Hooks 分解

REPL.tsx 有 5005 行，看似违反 "单一职责"，但实际通过 **70+ 个自定义 Hooks** 将逻辑分散到独立文件:
- `useBackgroundTaskNavigation` — 后台任务导航
- `useSessionBackgrounding` — Session 后台化
- `useFpsMetrics` — FPS 监控
- `useDeferredHookMessages` — 延迟 Hook 消息
- `useSkillsChange` — Skill 文件热更新
- ...

REPL.tsx 本身是 **"组装层"**：它不实现业务逻辑，而是组合/编排 Hooks 和子组件。

### 7.2 编译时特性消除

通过 `feature()` 编译时常量 + `require()` 条件加载，实现二进制级别的特性门控。不同构建目标 (external vs ant) 产出物理上不同的 bundle，无运行时开销。

### 7.3 双帧缓冲 + Damage Tracking

终端 UI 框架采用类游戏引擎的渲染管线:
- 双帧缓冲避免内存分配
- Damage Tracking 缩小 diff 范围
- Diff + Optimize 最小化 stdout I/O
- BSU/ESU 原子输出消除闪烁

### 7.4 "Ephemeral Progress 替换" 防内存爆炸

高频 progress 消息 (Sleep/Bash 每秒一次) 不 append 到 messages[]，而是 **replace** 同类型的前一条。这是一个在真实生产中发现的 issue (13K+ 条 / 120MB transcript) 后的 defensive 修复。

### 7.5 光标声明 (Declarative Cursor)

物理光标位置通过 React Hook (`useDeclaredCursor`) 声明式管理，而非命令式操作。渲染引擎在每帧末尾根据声明计算光标的绝对屏幕坐标。这统一了 IME、Screen Reader 和 scrollbox 内光标的处理。

---

## 8. 对 KyberKit 的架构启示

| Claude-Code 模式 | KyberKit 可参考方向 |
|---|---|
| 双帧缓冲 + Diff | 终端 UI 的标准范式: 前帧比较 + 最小写入 |
| Damage Tracking | 精确追踪脏区域, 避免全屏 diff |
| Feature Gate (编译时) | 构建目标隔离: dev/ant/external 不同产出 |
| hooks 分解 God Component | 大组件 = 组装层, 逻辑在 hooks 中 |
| Ephemeral Progress 替换 | 高频事件防内存爆炸: replace, 不 append |
| Alt Screen 管理 | 全屏模式 / 外部编辑器 / SIGCONT 的状态恢复 |
| 对象池 + 周期性重置 | 长 Session: StylePool/CharPool 防止无限增长 |
| 光标声明式管理 | 统一 IME/a11y 的光标定位 |
| Scroll Drain Suspension | UI 滚动时暂停后台工作, 保证帧率 |

> [!IMPORTANT]
> **核心发现**: Claude-Code 对 Ink 框架做了深度魔改 (ink.tsx 1722行 vs 原始 Ink ~500行)，核心增量包括: **双帧缓冲 + Damage Tracking + Alt Screen 管理 + Selection/Search Overlay + 光标声明系统 + 对象池 + BSU/ESU 同步输出**。这不是简单的 "用 Ink 写 CLI"，而是在 Ink 之上构建了一个接近终端 IDE 的渲染引擎。KyberKit 如果需要终端 UI，应当重视渲染性能和长 Session 内存管理，而非假设终端输出是 "简单打印"。
