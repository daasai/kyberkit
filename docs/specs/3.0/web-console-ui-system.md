# Web Console — UI 设计系统规范 (3.0 P1-C)

状态: Draft  
范围: UI 横切系统（组件、token、可访问性、性能、Future 能力）  
目标读者: 产品 / 设计 / 前端实现者

---

## 0. 规范边界

本文件定义“怎么一致地做 UI”，不定义后端协议细节。  
与其他文件关系：

- 页面内容和字段见 `web-console-ui-views.md`
- IA 与产品边界见 `web-console-ui.md`
- 技术栈细节（React/Tailwind/shadcn 等）在 `web-console-frontend.md` 落地

---

## 1. 布局网格与断点

### 1.1 断点策略

| 区间 | 布局 |
|------|------|
| `<768px` | 单列：侧栏抽屉化；预览/运行改底部 Sheet 或 Tab |
| `768–1199px` | 双列：侧栏 + 中栏；右栏按需弹出 |
| `>=1200px` | 三列：侧栏 + 中栏 + 右栏常驻 |

### 1.2 尺寸约束

- 侧栏宽度：`240–280px`
- 右栏最小宽度：`360px`
- 主容器最大宽度建议：`1440px`（超宽屏可居中）
- Modal 最大宽：`min(960px, 92vw)`

### 1.3 Splitter（Future）

- 中栏/右栏之间支持拖拽。
- 双击分隔条恢复默认宽度。
- 最小宽保护：中栏不低于 `560px`，右栏不低于 `360px`。

---

## 2. 设计 Token（抽象层）

### 2.1 间距

| Token | 值建议 |
|-------|--------|
| `space-1` | 4 |
| `space-2` | 8 |
| `space-3` | 12 |
| `space-4` | 16 |
| `space-5` | 20 |
| `space-6` | 24 |
| `space-7` | 32 |
| `space-8` | 40 |

### 2.2 字号

| Token | 场景 |
|-------|------|
| `text-xs` | 辅助说明、时间戳 |
| `text-sm` | 列表正文 |
| `text-base` | 消息正文 |
| `text-md` | 卡片标题 |
| `text-lg` | 页面标题 |
| `text-xl` | Modal 主标题 |

### 2.3 色彩语义 Token

| Token | 语义 |
|-------|------|
| `fg-primary` | 主文本 |
| `fg-secondary` | 次文本 |
| `bg-canvas` | 页面底色 |
| `bg-panel` | 面板底色 |
| `border-default` | 默认边框 |
| `accent` | 主要交互 |
| `success` | allow/running |
| `warning` | approval/paused |
| `danger` | deny/error |
| `info` | 中性提示 |

Dark mode 作为 Future，但 token 命名现在即固定，避免后续重命名。

---

## 3. 图标与视觉规范

- 图标尺寸：16 / 20 两档
- 状态点：8px
- 卡片圆角：8px（小卡）/ 12px（主卡）
- 阴影：仅 Modal/Drawer 使用轻阴影，列表行无阴影

---

## 4. 组件目录与契约

## 4.1 基础组件

- `Button`
- `IconButton`
- `Input`
- `Select`
- `Tabs`
- `Badge`
- `Tooltip`
- `Toast`

## 4.2 容器组件

- `Card`
- `Table`
- `Drawer`
- `Sheet`
- `Modal`
- `VirtualList`

## 4.3 业务组件

- `ApprovalBanner`
- `ToolRow`
- `ArtifactCard`
- `RunSummaryBar`
- `PreviewPaneMarkdown`
- `PreviewPaneHtml`
- `PreviewPaneCsv`
- `EmptyState`
- `ErrorState`
- `Skeleton`
- `KbdHint`

## 4.4 Future 组件

- `CommandPalette`
- `ThemeSwitch`
- `SplitterHandle`
- `InlineEditComposer`

### 4.5 关键 props 约定（示例）

| 组件 | 关键 props |
|------|------------|
| `ToolRow` | `toolName`, `status`, `args`, `result`, `audit`, `defaultExpanded` |
| `ArtifactCard` | `artifactId`, `path`, `mimeType`, `size`, `onOpenPreview` |
| `RunSummaryBar` | `phase`, `nextStep`, `updatedAt` |
| `ApprovalBanner` | `toolName`, `riskLevel`, `approvalStatus`, `reason` |
| `PreviewPaneCsv` | `rows`, `columns`, `truncated`, `maxPreviewRows` |

---

## 5. 状态规约（通用）

### 5.1 Loading

- 默认骨架屏，避免转圈占位。
- 加载超过 2 秒显示次级提示文案（如“仍在同步事件…”）。

### 5.2 Empty

- 每页提供具体空态文案。
- 至少一个主 CTA（如“新会话”“管理合约”）。

### 5.3 Error

- 错误条包含短原因 + “重试”。
- 不清空已加载内容。

### 5.4 Partial

- 可展示部分数据时，不阻塞整体渲染。
- 顶部或局部提示“部分数据可用”。

---

## 6. 动效策略

| 元素 | 动效 |
|------|------|
| Modal 进入/退出 | 120ms, ease-out |
| Sheet | 180ms |
| Drawer | 200ms |
| 状态点（running） | 1s 轻脉冲 |

约束：

- 支持 `prefers-reduced-motion`。
- 列表滚动不叠加额外动画。

---

## 7. 键盘快捷键

| 快捷键 | 行为 |
|--------|------|
| `g s` | 打开设置 |
| `g c` | 回主会话 |
| `g h` | 聚焦历史对话 |
| `/` | 聚焦搜索 |
| `Esc` | 关闭 Modal/Drawer/Sheet |
| `?` | 打开快捷键帮助 |
| `Cmd/Ctrl+K` | 命令面板（Future） |

规则：

- 快捷键在输入框聚焦时应避免误触全局跳转。
- 触发后给出可见反馈（聚焦样式或 Toast）。

---

## 8. 可访问性（A11y）

### 8.1 结构语义

- 对话流容器：`role=log`
- Modal：`role=dialog` + `aria-modal=true`
- SSE 新增消息：`aria-live=polite`

### 8.2 键盘与焦点

- 所有可点击项必须可 `Tab` 到达。
- Modal 开启后焦点锁定在 Modal 内，关闭后返回触发源。

### 8.3 可读性

- 对比度不低于 4.5:1。
- 状态不只靠颜色，必须有文字或图标。

---

## 9. 性能预算与运行策略

### 9.1 预算

- 本地首屏可交互：<= 2s
- 流式事件追加渲染：单次 <= 16ms
- CSV 预览滚动：目标 60fps

### 9.2 策略

- 长列表使用虚拟滚动。
- SSE 重连指数退避：1s -> 2s -> 4s ... 最大 30s。
- 右栏预览与中栏消息解耦渲染，避免互相阻塞。

---

## 10. 文案与 i18n

- 默认语言：`zh-CN`
- 关键术语统一：工作区、会话、合约、进化、记忆、技能、审计、偏好与合规
- 文案风格：简短、可执行、避免术语堆叠

---

## 11. Future 能力详规

### 11.1 命令面板（`Cmd/Ctrl+K`）

- 全局命令：
  - 跳转路由
  - 切换会话
  - 打开概览 Modal
  - 打开指定设置子页
- 命令源：全局注册 + 视图局部注册

### 11.2 主题切换

- 模式：`system` / `light` / `dark`
- Token 解析顺序：用户设置 > system > 默认 light

### 11.3 对话内改稿

- 在 assistant 内容中选择段落 -> 打开改稿弹层。
- 提交后生成 patch 指令并走工具审批链。
- 保留完整审计轨迹。

### 11.4 Splitter 交互

- 拖拽时显示实时宽度指示。
- 支持双击复位。

---

## 12. 系统级验收清单（P1-C + Future 标识）

1. 基础组件集可覆盖主工作区与 6 个设置子页。
2. 所有状态（loading/empty/error/partial）有统一呈现规范。
3. 键盘快捷键与焦点行为符合 A11y 约束。
4. 性能预算与 SSE 重连策略有明确实现要求。
5. Future 能力均有独立规范，不影响 P1-C 强验收项。
