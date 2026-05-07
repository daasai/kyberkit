# Kevin v1.5 UAT Full Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 Kevin v1.5 第一轮 UAT 全量整改，修复发布阻塞项并完成已确认 UX 收敛（Space A1 + 顶部紧凑通知条 B + 右栏语义收敛）。

**Architecture:** 采用三波纵切片执行。第 1 波修复 Space 切换与窗口语义；第 2 波打通 runtime-sidecar-frontend 事件链并重做顶部状态条；第 3 波收敛左栏信息架构和右栏职责，消除“输入区/状态区/制品区”语义冲突。所有波次均按 TDD 先测后改，并在每波结束做回归。

**Tech Stack:** TypeScript, React, Tauri, Node Sidecar, SSE, Vitest/Jest（按仓内既有测试框架）

---

## File Structure Mapping

核心修改文件（按职责）：

- `src-sidecar/index.ts`：runtime bus 事件订阅与 SSE 广播扩展（含 `skill.suggested`）。
- `src-sidecar/spaceEventBroadcast.ts`：Space/任务相关广播封装（若当前文件已存在则补齐事件契约）。
- `app/src/contexts/SessionContext.tsx`：前端任务/会话状态聚合入口。
- `app/src/hooks/useDynamicIslandState.ts`：顶部状态条（原灵动岛）状态优先级归并。
- `app/src/components/layout/DynamicIsland.tsx`：按 B 方案重绘紧凑通知条。
- `app/src/components/layout/LeftSidebar.tsx`：Space 锚点与左栏结构重排。
- `app/src/components/layout/RightPanel.tsx`：右栏职责收敛（仅对话+过程追踪+上下文摘要）。
- `app/src/components/layout/CenterPanel.tsx`：明确制品主舞台承载。
- `app/src/components/notifications/NotificationCenter.tsx`：补齐建议事件与状态镜像。
- `src-sidecar/TaskManager.test.ts`、`src-sidecar/skillTierOps.test.ts`、`src/exception/ExceptionHandler.test.ts`：事件链和边界行为回归。

新增/补充测试建议：

- `app/src/hooks/useDynamicIslandState.test.ts`
- `app/src/components/layout/DynamicIsland.test.tsx`
- `app/src/components/layout/LeftSidebar.test.tsx`
- `app/src/components/layout/RightPanel.test.tsx`

---

### Task 1: Space A1 语义落地（严格新窗口切换）

**Files:**
- Modify: `app/src/components/layout/LeftSidebar.tsx`
- Modify: `app/src/lib/tauriSpace.ts`
- Modify: `app/src/contexts/SessionContext.tsx`
- Test: `app/src/components/layout/LeftSidebar.test.tsx`

- [ ] **Step 1: 写失败用例（非当前 Space 必须新开并聚焦）**

```tsx
it("opens and focuses a new window when selecting a non-current space", async () => {
  const openSpaceWindow = vi.fn().mockResolvedValue(undefined);
  const focusSpaceWindow = vi.fn().mockResolvedValue(undefined);
  render(<LeftSidebar />);
  await user.click(screen.getByRole("button", { name: /space switcher/i }));
  await user.click(screen.getByRole("menuitem", { name: "Project-B" }));
  expect(openSpaceWindow).toHaveBeenCalledWith("project-b");
  expect(focusSpaceWindow).toHaveBeenCalledWith("project-b");
});
```

- [ ] **Step 2: 运行单测并确认失败**

Run: `cd app && npm test -- LeftSidebar.test.tsx`  
Expected: FAIL（当前实现未满足 A1 双调用语义）

- [ ] **Step 3: 最小实现（锁定 A1 行为）**

```ts
// app/src/lib/tauriSpace.ts
export async function switchToSpace(spaceId: string, currentSpaceId: string) {
  if (spaceId === currentSpaceId) return { action: "noop" as const };
  await openSpaceWindow(spaceId);
  await focusSpaceWindow(spaceId);
  return { action: "opened_and_focused" as const };
}
```

- [ ] **Step 4: 在侧边栏接入并禁止就地切换**

```tsx
// app/src/components/layout/LeftSidebar.tsx
const onSelectSpace = async (spaceId: string) => {
  const result = await switchToSpace(spaceId, currentSpaceId);
  if (result.action === "noop") setSpaceMenuOpen(false);
};
```

- [ ] **Step 5: 重新运行测试**

Run: `cd app && npm test -- LeftSidebar.test.tsx`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add app/src/components/layout/LeftSidebar.tsx app/src/lib/tauriSpace.ts app/src/components/layout/LeftSidebar.test.tsx
git commit -m "feat(ui): enforce A1 space switch with open-and-focus semantics"
```

---

### Task 2: sidecar 广播补齐 `skill.suggested`

**Files:**
- Modify: `src-sidecar/index.ts`
- Modify: `src-sidecar/spaceEventBroadcast.ts`
- Test: `src-sidecar/TaskManager.test.ts`

- [ ] **Step 1: 写失败用例（runtime 事件应进入 SSE）**

```ts
it("broadcasts skill.suggested over sse", async () => {
  const broadcast = vi.fn();
  const bus = new EventEmitter();
  wireRuntimeEvents(bus, broadcast);
  bus.emit("skill.suggested", { sessionId: "s1", title: "Extract as skill" });
  expect(broadcast).toHaveBeenCalledWith("skill.suggested", expect.objectContaining({ sessionId: "s1" }));
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src-sidecar/TaskManager.test.ts`  
Expected: FAIL（未订阅或未广播该事件）

- [ ] **Step 3: 实现 sidecar 订阅和广播**

```ts
// src-sidecar/index.ts
runtime.bus.on("skill.suggested", (payload) => {
  sseBroadcast("skill.suggested", {
    sessionId: payload.sessionId,
    spaceId: payload.spaceId,
    title: payload.title,
    summary: payload.summary,
    sourceTaskId: payload.sourceTaskId,
    timestamp: payload.timestamp ?? Date.now(),
  });
});
```

- [ ] **Step 4: 为广播加最小去重保护**

```ts
// src-sidecar/spaceEventBroadcast.ts
const seen = new Map<string, number>();
export function shouldBroadcastSkillSuggested(key: string, now = Date.now()) {
  const last = seen.get(key) ?? 0;
  if (now - last < 3000) return false;
  seen.set(key, now);
  return true;
}
```

- [ ] **Step 5: 运行测试**

Run: `npm test -- src-sidecar/TaskManager.test.ts`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src-sidecar/index.ts src-sidecar/spaceEventBroadcast.ts src-sidecar/TaskManager.test.ts
git commit -m "fix(sidecar): broadcast skill.suggested to frontend via sse"
```

---

### Task 3: 顶部状态条改为 B（紧凑通知条）

**Files:**
- Modify: `app/src/hooks/useDynamicIslandState.ts`
- Modify: `app/src/components/layout/DynamicIsland.tsx`
- Test: `app/src/hooks/useDynamicIslandState.test.ts`
- Test: `app/src/components/layout/DynamicIsland.test.tsx`

- [ ] **Step 1: 写失败用例（状态优先级）**

```ts
it("prioritizes awaiting_signoff over completed transient", () => {
  const state = reduceIslandState([
    { type: "task.completed" },
    { type: "task.awaiting_signoff", pendingCount: 2 },
  ]);
  expect(state.mode).toBe("awaiting_signoff");
});
```

- [ ] **Step 2: 写失败用例（非输入语义）**

```tsx
it("renders status bar role and no input affordance", () => {
  render(<DynamicIsland state={{ mode: "idle", label: "Session: A" }} />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/type|ask/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `cd app && npm test -- useDynamicIslandState.test.ts DynamicIsland.test.tsx`  
Expected: FAIL

- [ ] **Step 4: 实现状态 reducer（四态 + 优先级）**

```ts
const PRIORITY = { idle: 0, completed_transient: 1, running: 2, awaiting_signoff: 3 } as const;
export function pickHigher(a: IslandMode, b: IslandMode): IslandMode {
  return PRIORITY[a] >= PRIORITY[b] ? a : b;
}
```

- [ ] **Step 5: 重绘组件为紧凑通知条**

```tsx
return (
  <div role="status" aria-live="polite" className="island-bar island-bar--compact" data-mode={state.mode}>
    <span className="island-bar__dot" />
    <span className="island-bar__label">{state.label}</span>
  </div>
);
```

- [ ] **Step 6: 运行测试**

Run: `cd app && npm test -- useDynamicIslandState.test.ts DynamicIsland.test.tsx`  
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add app/src/hooks/useDynamicIslandState.ts app/src/components/layout/DynamicIsland.tsx app/src/hooks/useDynamicIslandState.test.ts app/src/components/layout/DynamicIsland.test.tsx
git commit -m "feat(ui): redesign dynamic island into compact status bar"
```

---

### Task 4: 左栏 IA 拆分（文档库 + 连接器）

**Files:**
- Modify: `app/src/components/layout/LeftSidebar.tsx`
- Modify: `app/src/components/layout/AppShell.tsx`
- Test: `app/src/components/layout/LeftSidebar.test.tsx`

- [ ] **Step 1: 写失败用例（区块拆分和默认摘要态）**

```tsx
it("shows document library and connector summary as separate sections", () => {
  render(<LeftSidebar />);
  expect(screen.getByText("文档库")).toBeInTheDocument();
  expect(screen.getByText("连接器")).toBeInTheDocument();
  expect(screen.getByText(/正常|异常/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试并确认失败**

Run: `cd app && npm test -- LeftSidebar.test.tsx`  
Expected: FAIL

- [ ] **Step 3: 最小实现区块拆分和摘要文案**

```tsx
<SidebarSection title="文档库">{/* tree + @引用 */}</SidebarSection>
<SidebarSection title="连接器">
  <ConnectorSummary healthy={2} unhealthy={1} />
</SidebarSection>
```

- [ ] **Step 4: 加异常优先排序**

```ts
const sortedConnectors = [...connectors].sort((a, b) => Number(b.isUnhealthy) - Number(a.isUnhealthy));
```

- [ ] **Step 5: 重跑测试**

Run: `cd app && npm test -- LeftSidebar.test.tsx`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add app/src/components/layout/LeftSidebar.tsx app/src/components/layout/AppShell.tsx app/src/components/layout/LeftSidebar.test.tsx
git commit -m "feat(ui): split sidebar into document library and connectors"
```

---

### Task 5: 右栏语义收敛（只保留对话/过程追踪/上下文摘要）

**Files:**
- Modify: `app/src/components/layout/RightPanel.tsx`
- Modify: `app/src/components/layout/CenterPanel.tsx`
- Modify: `app/src/App.tsx`
- Test: `app/src/components/layout/RightPanel.test.tsx`

- [ ] **Step 1: 写失败用例（右栏不出现主制品区域）**

```tsx
it("does not render primary artifact canvas in right panel", () => {
  render(<RightPanel />);
  expect(screen.queryByTestId("artifact-primary-view")).not.toBeInTheDocument();
  expect(screen.getByTestId("process-tracker")).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试并确认失败**

Run: `cd app && npm test -- RightPanel.test.tsx`  
Expected: FAIL

- [ ] **Step 3: 收敛右栏结构**

```tsx
<RightPanelLayout>
  <ConversationStream />
  <ProcessTracker data-testid="process-tracker" />
  <ContextAttribution />
  <Composer />
</RightPanelLayout>
```

- [ ] **Step 4: 保证中栏承载主制品**

```tsx
<CenterPanel>
  <PrimaryArtifactView data-testid="artifact-primary-view" />
</CenterPanel>
```

- [ ] **Step 5: 运行测试**

Run: `cd app && npm test -- RightPanel.test.tsx`  
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add app/src/components/layout/RightPanel.tsx app/src/components/layout/CenterPanel.tsx app/src/App.tsx app/src/components/layout/RightPanel.test.tsx
git commit -m "refactor(ui): converge right panel semantics to conversation and process tracking"
```

---

### Task 6: 欢迎区文案纠偏 + 端到端回归

**Files:**
- Modify: `app/src/App.tsx`
- Modify: `app/src/components/onboarding/OnboardingWizard.tsx`
- Modify: `docs/specs/kevin1.5/UAT/uat_report_v1.5.md`
- Test: `src/exception/ExceptionHandler.test.ts`

- [ ] **Step 1: 写失败用例（禁用预装 Skill 暗示）**

```tsx
it("does not imply preinstalled skills in welcome copy", () => {
  render(<OnboardingWizard />);
  expect(screen.queryByText(/预装|built-in skill/i)).not.toBeInTheDocument();
  expect(screen.getByText(/@文件|附件|\/ 调用已安装 Skill/)).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `cd app && npm test -- OnboardingWizard`  
Expected: FAIL

- [ ] **Step 3: 更新欢迎文案**

```tsx
const guide = "你可以通过 @文件、附件、自然语言任务，或使用 / 调用已安装 Skill 开始。示例仅用于演示，不代表预装能力。";
```

- [ ] **Step 4: 执行回归命令（前后端）**

Run: `npm test && cd app && npm test`  
Expected: PASS（若失败，先修复失败再继续）

- [ ] **Step 5: 更新 UAT 复测结论草稿**

```md
- [x] `skill.suggested` 事件已从 runtime 经 sidecar SSE 到前端展示
- [x] 顶部状态条采用紧凑通知条语义，四态可见且无输入框误导
- [x] 右栏只承载对话、过程追踪与上下文摘要
```

- [ ] **Step 6: 提交**

```bash
git add app/src/App.tsx app/src/components/onboarding/OnboardingWizard.tsx docs/specs/kevin1.5/UAT/uat_report_v1.5.md
git commit -m "chore(ux): align onboarding copy and finalize uat remediation regression"
```

---

## Self-Review Checklist (Completed)

- Spec coverage: 已覆盖 Space、事件链、顶部状态条、左栏拆分、右栏语义、欢迎文案六大需求点。
- Placeholder scan: 无 TBD/TODO/“后续实现”类占位内容。
- Type consistency: 使用 `skill.suggested`、`task.awaiting_signoff`、`completed_transient` 等命名保持前后一致。

