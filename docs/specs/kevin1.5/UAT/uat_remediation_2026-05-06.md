# Kevin v1.5 UAT 整改跟进（2026-05-06）

本轮按 `docs/superpowers/specs/2026-05-06-kevin15-uat-full-remediation-design.md` 实施后的复测勾选项。

## 技术

- [x] `skill.suggested`：Runtime → Sidecar 订阅 → SSE 并入会话流（`src-sidecar/spaceEventBroadcast.ts`）
- [x] 根目录 `npm test`：`bun test src`，避免误跑 Playwright 规格文件

## 体验

- [x] 顶部状态：紧凑通知条（`DynamicIsland` + `AppHeader` + 右栏事件）
- [x] 左栏 IA：`文档库` / `连接器` 分区（`LeftSidebar`）
- [x] 右栏语义：主制品列表迁出；保留对话、过程追踪、上下文摘要（`RightPanel`）
- [x] 中栏：`artifact-primary-view` 锚点；欢迎文案去除「预装 Skill」暗示（`CenterPanel`）

## 待第二轮 UAT 实机确认

- [ ] Space A1：Tauri `open_and_focus_space_window` 命令与桌面端多窗口行为
- [ ] 灵动岛四态与真实任务流、签批流联调
