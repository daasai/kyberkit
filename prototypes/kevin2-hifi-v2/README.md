# Kevin 2.0 高保真原型 v2（沉浸式流程 · Claude Design 2B 风格）

在 [v1](../kevin2-hifi/) 基础上迭代：**无左侧场景导航**，通过页面内按钮串联核心流程；**剔除大块深绿背景**，深绿色仅用于主按钮、进度条、选中 Tab 等强调；布局与功能仍对齐 Kevin 2.0 文档。

### Claude Design 式对话（v2.1）

- **顶栏分流**：`创建工作区` / `第一次见面` / `Settings` 等仍可用 **`KevinFloatingChrome`** + **`KevinBrandLarge`**；**Workspace 主工作态** 默认全屏，与 **Artifact** 一致采用极薄 **`CdMicroTabRow`** + **`KevinBrandCompact`**。主操作按钮统一 **深绿 `j-brand`**（含 Composer 发送）。其它矢量 Logo 候选仅在 **SVG 图库** 中保留供实验。
- 可复用 **`CdChatThread`**（[`src/components/cd/CdChatThread.tsx`](src/components/cd/CdChatThread.tsx)）：用户气泡、**Thinking** 折叠块、**Tool** 行（状态 ✓ / …）、正文回复、**输出卡**（对话列）；底部 **Composer**（+、输入、模型 pill、发送）。
- **Workspace 右栏**：**工作区** 标题下 **浏览 | Artifact**（CD 式 Tab；Artifact 为内嵌占位，全屏仍走路由）。**浏览** 为目录树 + 预览（列宽约 **66%**）；预览含 **文档/表格/幻灯片** 等示意帧。**?** 折叠原型说明（多会话、目录模型）；正式版可换成功能帮助。
- **聊天入口**：Workspace 中栏、Artifact 左侧、第一次见面等；Workspace 阶段为多会话 Tab、无 Comments。
- **概览（无独立路由）**：原 Home 仪表盘卡片抽为 **`WorkspaceOverviewBody`**，嵌入 **「工作区 ▾」→ 概览** 抽屉（或底栏 **← 概览**）；默认进入 **Workspace** 主界面。

## 运行

```bash
cd prototypes/kevin2-hifi-v2
npm install
npm run dev
```

开发服务器：<http://localhost:5101>

### SVG 图库（筛选 Logo / 装饰 / 工作包图标）

在 **Workspace** 顶栏「⋯」菜单打开 **「SVG 图库（筛选）」**，可浏览所有候选矢量及 `id` 标注，选定后把 id 列表交给实现即可。

## 推荐演示路径

1. 默认进入 **Workspace**；**工作区 ▾** 或底栏 **← 概览** 打开仪表盘卡片区。  
2. 对话列 **Open** 或树中结构化入口 → **Artifact Focus**  
3. Inspector → **Actions** →「投影到飞书…」→ **Action Panel**（浮层）  
4. **⋯** 菜单：**My Kevin**、**创建工作区**、**SVG 图库**；支线结束后回到 **Workspace**。

v1 仍可在 `../kevin2-hifi` 端口 **5100** 运行以便对照。
