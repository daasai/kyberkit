# Kevin v1.5 UAT 实时走查记录（2026-05-08）

> 走查状态：已完成（本轮主链路回归）
> 执行角色：工程联调 + UAT 复核
> 记录范围：Rev3 system refactor 收尾项（Space/Library、文档树、制品链路、隔离路由）

## 本轮目标

- 验证 Space/Library 新建与切换主链路可用。
- 验证“首条消息 404”修复后不再复现。
- 验证文档预览降级提示、制品落库后自动选中与右侧目录 chip 同步。
- 验证关键请求均携带 `space_id`（尤其是 AppShell 自动加载链路）。

## 走查结果

- UAT-20260508-001 `Space/Library 新建`：**PASS**
  - 步骤：打开“管理 Space”面板 -> 填写 mountPath 创建。
  - 结果：成功返回 `spaceId/libraryId`，`/spaces` 列表可见新条目并含 `mountPath`。

- UAT-20260508-002 `Space 切换后首条消息`：**PASS**
  - 步骤：新建 Space 后直接在右栏发送第一条消息。
  - 历史问题：偶发 `404 Session not found`。
  - 本轮结果：不再复现。修复点为切换时清空旧会话态 + 404 一次性自愈重试。

- UAT-20260508-003 `文档预览降级`：**PASS**
  - 步骤：点击不可预览文件（超大/二进制）。
  - 结果：右侧显示“文件预览不可用”友好提示，不阻塞会话链路。

- UAT-20260508-004 `新制品回写联动`：**PASS**
  - 步骤：生成新制品并落库。
  - 结果：文档树自动定位到新文件，右侧当前目录 chip 同步到对应目录。

- UAT-20260508-005 `space_id 路由隔离`：**PASS**
  - 步骤：切换 Space 后触发会话详情自动加载。
  - 结果：请求路径带 `space_id`，未观察到跨 Space 会话串读。

## 自动化回归（本轮新增）

- `src/components/layout/RightPanel.test.tsx`
  - 覆盖发送消息渲染稳定性（防白屏）。
  - 覆盖 `artifact_end.library_path` 触发目录 chip + 选择事件同步。

- `src/components/layout/LeftSidebar.test.tsx`
  - 覆盖大文件/二进制预览不可用提示文案链路。

- `src/components/layout/AppShell.search.test.tsx`
  - 覆盖 AppShell 自动加载会话详情时 `space_id` 必带。

- `src/components/layout/LeftSidebar.space.test.tsx`
  - 更新为“管理 Space 面板”入口行为校验。

## 结论

- Rev3 收尾主链路达到可用状态，可进入下一轮更大范围 UAT（包含长会话、并发、多窗口交互和回归巡检）。
