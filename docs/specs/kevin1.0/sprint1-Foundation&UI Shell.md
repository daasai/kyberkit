# Kevin MVP — Sprint 1 技术设计规范 (Foundation & UI Shell)

> **Sprint**: Sprint 1 — Foundation & UI Shell
> **目标**: 在纯 Web 模式下（无 Tauri），跑通三面板静态 UI + Bun Sidecar 基础 SSE 通信闭环
> **交付验收**: 用户可在浏览器中看到与原型高度一致的三面板界面；Milkdown 编辑器可渲染并编辑 Markdown；在右侧输入框发送消息可看到 Bun Server 的流式文本回复

---

## 1. 设计系统令牌（Design Tokens）

> 所有样式**必须严格对照原型（poto/DESIGN.md + poto/code.html）**实现，禁止使用非规范颜色。

### 1.1 调色板 (Color Palette)

| Token | 值 | 用途 |
|---|---|---|
| `surface` | `#fcf8ff` | 页面全局背景 |
| `surface-container-lowest` | `#ffffff` | 侧边栏、面板背景、卡片 |
| `surface-container-low` | `#f6f2fa` | 次级背景 |
| `surface-container` | `#f0ecf4` | Hover 背景、User 消息气泡 |
| `on-surface` | `#1b1b21` | 主要文字 |
| `on-surface-variant` | `#474651` | 次要文字、图标 |
| `outline-variant` | `#c8c5d3` | 所有边框线 |
| `primary` | `#1a146b` | 主要品牌色（按钮、激活状态、图标） |
| `primary-container` | `#312e81` | 主要按钮 Hover、激活背景 |
| `on-primary` | `#ffffff` | 主要按钮文字 |
| `error` | `#ba1a1a` | 错误状态、通知红点 |
| `inverse-surface` | `#303036` | 代码块背景 |

### 1.2 字体系统 (Typography)

| Token | 字族 | 大小 | 字重 | 行高 |
|---|---|---|---|---|
| `h1` | Manrope | 32px | 700 | 40px |
| `h2` | Manrope | 24px | 600 | 32px |
| `h3` | Manrope | 20px | 600 | 28px |
| `label-md` | Inter | 14px | 500 | 20px |
| `body-md` | Inter | 14px | 400 | 20px |
| `label-sm` | Inter | 12px | 600 | 16px |
| `code` | monospace | 13px | 400 | 20px |

**字体加载**: 使用 Google Fonts 预加载 `Inter:wght@400;500;600` 和 `Manrope:wght@600;700`，以及 `Material Symbols Outlined` 图标字体。

### 1.3 圆角 & 间距

- 小组件（按钮/输入框）: `8px`
- 中型卡片: `12px`
- 大型容器（面板区域）: `16-24px`
- 间距基准单元：`4px` 的倍数

---

## 2. 整体布局架构

```
+--[ Top Header: h-14, border-b, bg-surface-container-lowest ]----------------+
|  [Logo] | Drafts / Published* / Reviews / Archive   [Settings][Bell] [Export][Share][Avatar] |
+----+------------------------------------------------------------+-----------+
|    |                                                            |           |
| Left Sidebar          Center Panel (flex-1)           Right Sidebar         |
| w-[260px]             bg-background                   w-[350px]             |
| bg-surface-container-lowest                           bg-surface-cont...    |
| border-r                                              border-l              |
+----+------------------------------------------------------------+-----------+
```

整体为 `flex flex-col h-screen overflow-hidden`，三面板区域为 `flex flex-1 overflow-hidden`，各面板内部独立滚动。

### 2.1 可调宽度面板（Resizable Panels）

三栏之间通过拖拽分隔条（Drag Handle）实现宽度动态调整：

- **实现方案**: 使用 [`react-resizable-panels`](https://github.com/bvaughn/react-resizable-panels) 库，该库轻量无额外依赖，专为 Flex 布局设计，支持键盘可访问性（符合 WCAG）。
- **分隔条样式**: 两根垂直分隔线（Left/Center 之间、Center/Right 之间），宽度 `4px`，hover 时背景从透明变为 `primary/30`，cursor 为 `col-resize`，不得有突兀的视觉元素。
- **默认宽度**: Left `20%`、Center `55%`、Right `25%`（对应原型比例）。
- **宽度约束**:
  - 左侧面板: `min=15%`, `max=30%`
  - 中间面板: `min=40%`
  - 右侧面板: `min=20%`, `max=40%`
- **宽度持久化**: 用户拖拽后，将各面板宽度（以百分比）存储在 `localStorage`，下次启动时自动恢复。键名为 `kevin:panel-sizes`。

---

## 3. 组件规范

### 3.1 顶部导航栏 (`<AppHeader>`)

- **布局**: `flex justify-between items-center`, `h-14`, `px-6`, `border-b border-outline-variant`
- **左区**: Logo 图标(`terminal`, filled, `text-primary`) + "Workspace Editor" 文字 + 分隔线 + 导航 Tab
- **导航 Tab 激活态**: 文字为 `text-primary`，底部 `border-b-2 border-primary`，其余 Tab `text-on-surface-variant`
- **右区**: Settings/Notifications 图标按钮（hover `bg-surface-container`，`rounded-lg`） + Export 次要按钮 + Share 主要按钮 + 头像

### 3.2 左侧面板 (`<LeftSidebar>`)

分为三个逻辑区域，内部整体可滚动（`overflow-y-auto`）：

**顶部导航菜单**:
- 菜单项: `flex items-center gap-3 px-3 py-2 rounded-lg`, hover `bg-surface-container`
- 激活态 (New): `text-primary bg-primary-container/10`
- 图标来自 Material Symbols Outlined

**上下文 & 数据源 (Context & Sources)**:
- 节标题: `uppercase tracking-wider text-label-sm text-on-surface-variant` + 右侧 `+` 图标
- 可展开树节点: 展开图标 `expand_more` + 文件夹图标 `folder_open text-primary`
- 子节点缩进: `ml-9 border-l border-outline-variant pl-2`
- 叶节点（DW、MCP）: 无缩进展开箭头，带对应颜色图标

**最近产物 (Recent Artifacts)**:
- 激活项（当前打开）: `bg-surface-container text-on-surface` + 左侧 `4px primary` 色竖条（`before:` pseudo element）
- 非激活项: `text-on-surface-variant` + hover `bg-surface-container`

**底部升级按钮**:
- `border-t border-outline-variant` 分隔
- 次要按钮样式，全宽，含闪电图标

### 3.3 中间内容区 (`<CenterPanel>`)

**Tab Bar**:
- 高度 `h-12`，`border-b border-outline-variant`，`bg-surface-container-lowest`
- 激活 Tab: `bg-surface` + 上方圆角 `rounded-t-lg` + `border border-b-0 border-outline-variant` + `text-primary`，通过 `relative top-[1px]` 与底部边框"融合"
- 右侧操作区: Edit / More 图标按钮

**内容画布（Scrollable Canvas）**:
- 内部最大宽度 `max-w-4xl mx-auto`，内边距 `p-8 lg:p-12`
- 文档标题: `font-h1 text-h1`，元信息行（作者/日期/状态 badge）后跟 `border-b pb-6`
- Markdown 内容区（`<article>`）: 正文 `text-body-md leading-relaxed`
- H2 标题: `font-h2 text-h2 mt-8 mb-4`
- 卡片组: `grid grid-cols-2 gap-4`，卡片为 `bg-surface-container-lowest border border-outline-variant rounded-xl p-5 shadow-sm`
- 代码块: 外层 `rounded-lg overflow-hidden border border-outline-variant`，头部 `bg-surface-container`（文件名 + copy 按钮），代码区 `bg-inverse-surface text-on-error`

### 3.4 右侧 Agent 面板 (`<RightPanel>`)

**Tab Bar**:
- 「对话」/ 「轨迹」两个 Tab
- 激活态 `border-b-2 border-primary text-primary font-medium`

**消息流区域**（内部可滚动, `space-y-6 p-4`）:
- **系统标签**: 居中 pill 样式 `px-3 py-1 bg-surface-container rounded-full text-[11px]`，含链接图标
- **用户消息**: `flex flex-col items-end`，气泡 `bg-surface-container px-4 py-3 rounded-2xl rounded-tr-sm border border-outline-variant/50`
- **AI 思考状态**: `flex items-center gap-2 text-on-surface-variant text-label-sm`，图标 `animate-spin`（`sync` 图标）
- **AI 回复气泡**: 
  - `bg-white border border-outline-variant px-4 py-4 rounded-2xl rounded-tl-sm shadow-sm`
  - 左上角有 AI 头像徽章（`absolute -left-3 -top-3 w-8 h-8 rounded-full bg-primary-container border-2 border-white shadow-sm`）
  - 内容中行内 `<code>` 样式 `bg-surface-container px-1 rounded text-[12px]`
  - 引用文档段落用 `bg-primary/10 text-primary px-1 rounded text-xs font-mono`
  - 列表项用 Material Symbols 图标代替 bullet
  - 底部 Action Chips: `px-3 py-1 bg-surface-container-low border border-outline-variant rounded-full text-[12px]`

**输入区域** (`shrink-0, p-4, border-t`):
- 外层容器: `bg-surface-container-lowest border border-outline-variant rounded-xl focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all shadow-sm`
- Textarea: `resize-none`, placeholder 文字 `text-outline`，支持 `@` 提及
- 附件 / @ 按钮 + 发送按钮 (`bg-primary rounded-lg`)
- 底部免责声明文字

---

## 4. 微任务分解（Week 1 执行清单）

### Task 1.1 — 项目初始化 (约 30 min)
- 在项目根目录创建 `app/` 目录，执行 Vite + React + TypeScript 初始化
- 安装核心依赖: `tailwindcss`, `@tailwindcss/vite`, Material Symbols 字体
- 配置 `tailwind.config.ts`，将 DESIGN.md 中的所有 token **完整映射**为 Tailwind 自定义变量（colors, fontFamily, fontSize, borderRadius, spacing）
- 配置 Google Fonts 预加载（`index.html` link 标签）
- **验收**: `bun run dev` 启动后，浏览器背景色为 `#fcf8ff`，使用 Inter 字体

### Task 1.2 — 顶部导航栏组件 (约 45 min)
- 创建 `src/components/layout/AppHeader.tsx`
- 实现所有静态元素（Logo、Tab 导航含激活态、右侧按钮组、头像）
- **验收**: 视觉与原型 `screen.png` 顶部一致，Tab hover 有过渡效果

### Task 1.3 — 三面板基础骨架 (约 60 min)
- 创建 `src/components/layout/AppShell.tsx`，实现 Header + 三列 flex 布局
- 安装 `react-resizable-panels`
- 在 `AppShell.tsx` 中用 `<PanelGroup direction="horizontal">` 包裹三个 `<Panel>`，配置 `defaultSize`、`minSize`、`maxSize`
- 在两个 `<Panel>` 之间插入 `<PanelResizeHandle>`，自定义 Handle 样式（4px 宽，hover 时显示 `primary/30` 色竖线）
- 在 `onLayout` 回调中将尺寸数组写入 `localStorage`，组件 mount 时读取恢复
- 实现 `LeftSidebar.tsx` 静态骨架（导航区 + 上下文区树形展开 + 产物列表 + 底部按钮）
- 实现 `CenterPanel.tsx` 静态骨架（Tab Bar + 内容画布，含模拟 Markdown 静态内容）
- 实现 `RightPanel.tsx` 静态骨架（Tab Bar + 模拟消息列表 + 输入框区域）
- **验收**: 默认比例与原型一致；拖拽分隔条可调整三栏宽度；刷新页面后宽度恢复为上次拖拽后的值

### Task 1.4 — Milkdown 编辑器集成 (约 90 min)

**技术选型**: [Milkdown](https://milkdown.dev/) — ProseMirror 驱动的 WYSIWYG Markdown 编辑器，Obsidian-like Live Preview 体验，官方提供 React 绑定。

**安装依赖**:
```bash
bun add @milkdown/core @milkdown/react @milkdown/kit
```
- `@milkdown/core`: 核心引擎
- `@milkdown/react`: React 组件绑定（`<Milkdown>`, `<MilkdownProvider>`）
- `@milkdown/kit`: 内置预设插件包，包含 GFM、CommonMark、代码块高亮、数学公式、历史记录（Undo/Redo）

**实现要点**:
- 在 `CenterPanel.tsx` 的内容画布区域挂载 `<MilkdownProvider>` + `<Milkdown>`
- 启用插件集: `commonmark`, `gfm`（表格/Task List/Strikethrough）, `history`（Cmd+Z/Cmd+Shift+Z）, `prism` 或 `shiki` 代码高亮
- **主题定制**: Milkdown 使用 CSS 变量控制样式，必须将 DESIGN.md 中的颜色 Token 覆写至 Milkdown 的 CSS 变量（如 `--milkdown-color-primary`, `--milkdown-color-background`），确保与三面板设计系统一致
- **只读 / 编辑双模式**: 通过 `editor.config()` 中的 `editable` 属性动态切换（AI 生成时为 `false` 只读态，生成完毕后为 `true` 可编辑态）
- 初始内容: 传入一段包含 h1/h2/列表/代码块/表格/Task List 的测试 Markdown

**验收标准**:
- Milkdown 编辑器正确渲染测试内容（包含代码高亮、表格、Task List 勾选）
- 编辑器样式（字体、颜色、边框）与 DESIGN.md 设计系统一致，无默认主题色污染
- 可在编辑器内直接输入/修改文字，支持 Cmd+Z 撤销

### Task 1.5 — 极简 Bun Sidecar 服务 (约 60 min)
- 创建 `src-sidecar/index.ts`
- 实现 `GET /health` → `{ status: "ok" }` 和 `POST /chat` → SSE 流（用 setTimeout 模拟逐字输出）
- **验收**: `curl -N -X POST http://localhost:3001/chat -d '{"message":"hi"}' -H 'Content-Type: application/json'` 能看到 SSE 流式输出

### Task 1.6 — 前后端 SSE 通信联调 (约 45 min)
- 在 `RightPanel.tsx` 输入框实现 `onSubmit` 事件，调用 `fetch + ReadableStream` 消费 Sidecar `/chat`
- 流式文字逐步追加至 AI 回复气泡（打字机效果）
- 处理加载中状态（显示 `sync` 图标 + `animate-spin`）
- **验收**: 输入框发送消息后，AI 回复以打字机效果逐字出现

---

## 5. 文件结构约定

```
app/                         ← 新建 Vite + React 前端工程
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css            ← 全局样式 & Tailwind 指令
│   └── components/
│       └── layout/
│           ├── AppHeader.tsx
│           ├── AppShell.tsx
│           ├── LeftSidebar.tsx
│           ├── CenterPanel.tsx
│           └── RightPanel.tsx
└── tailwind.config.ts

src-sidecar/                 ← 独立的 Bun HTTP 服务
└── index.ts
```

---

## 6. 验收标准（Definition of Done）

| #   | 验收项                                                             | 验收方式                      |
| --- | --------------------------------------------------------------- | ------------------------- |
| 1   | 三面板布局与原型视觉高度一致（颜色、字体、比例）                                        | 对照 `screen.png` 人工对比      |
| 2   | 各面板独立滚动，整体不出现全页滚动条                                              | 浏览器交互测试                   |
| 3   | Markdown 渲染正确（含代码高亮、表格）                                         | CenterPanel 渲染测试 Markdown |
| 4   | Bun Sidecar 可通过 curl 独立测试 `/health` 和 `/chat`                   | 命令行手动验证                   |
| 5   | 前端发送消息后右侧可看到打字机效果流式回复                                           | 浏览器交互测试                   |
| 6   | 两个命令可完整体验: `bun run dev` (前端) + `bun src-sidecar/index.ts` (后端) | 本地开发环境验证                  |

---

## 7. 明确不做（Out of Scope — Week 1）

- ❌ 接入真实 LLM（Sidecar 使用 Mock 流即可）
- ❌ Tauri 壳的任何配置
- ❌ SQLite 持久化
- ❌ 左侧面板数据真实联动
- ❌ `@` 提及的自动完成功能
- ❌ 中间面板产物与右侧聊天的实际联动
