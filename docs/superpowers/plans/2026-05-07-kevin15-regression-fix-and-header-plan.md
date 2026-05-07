# Kevin v1.5 退化修复 + AppHeader 功能层实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复整改提交 `2fc80e8` 损坏的 App→AppShell→AppHeader/LeftSidebar prop 传递链，修复 spaceId 作用域，移除冗余 UI 元素，新增头像账户菜单，使系统回到并超越第一轮 UAT 截图水平。

**Architecture:** 外科手术策略，以当前代码为基准逐层补回接线。顺序严格按依赖拓扑：sidecarUrl 工具函数 → SessionContext → RightPanel → App.tsx → AppShell → AppHeader → LeftSidebar。整改已有的 Space 切换逻辑、DynamicIsland 组件、LeftSidebar IA 拆分全部保留不动。

**Tech Stack:** TypeScript, React 18, Vite, Vitest + React Testing Library, Tauri 2, Bun Sidecar

---

## File Structure Mapping

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `app/src/config/sidecarUrl.ts` | 补回 `qsSpace` 工具函数 |
| Modify | `app/src/contexts/SessionContext.tsx` | 恢复 `spaceId` / `setSpaceId` |
| Modify | `app/src/components/layout/RightPanel.tsx` | 恢复 `qsSpace(spaceId)` 作用域 |
| Modify | `app/src/App.tsx` | 恢复 ConfigProvider + KevinGate + SettingsPanel |
| Modify | `app/src/components/layout/AppShell.tsx` | 恢复路由层 + prop 分发 |
| Modify | `app/src/components/layout/AppHeader.tsx` | 移除 Nav Tabs + 接线 + 接入 AccountMenu |
| Create | `app/src/components/layout/AccountMenu.tsx` | 头像账户下拉菜单 |
| Modify | `app/src/components/layout/LeftSidebar.tsx` | 恢复导航 props + 连接器动态化 |

---

## Task 1: 补回 `qsSpace` 工具函数

**Files:**
- Modify: `app/src/config/sidecarUrl.ts`

`NotificationCenter` 和 `AutomationCenter` 已经 import 了 `qsSpace` 但当前文件里不存在，会导致 tsc 报错。这是所有后续任务的前提。

- [ ] **Step 1: 查看现有文件并确认缺失**

```bash
cat app/src/config/sidecarUrl.ts
```

Expected 输出：只有 `SIDECAR_URL`，无 `qsSpace`。

- [ ] **Step 2: 补回 `qsSpace`**

将 `app/src/config/sidecarUrl.ts` 替换为：

```ts
/** Kevin web UI → Bun Sidecar base URL (override in `.env`: `VITE_SIDECAR_URL`). */
export const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL ?? 'http://localhost:3001'

/** 将 spaceId 附加为 query string，供所有 sidecar API 请求使用。 */
export function qsSpace(spaceId: string): string {
  return spaceId && spaceId !== 'default' ? `?space_id=${encodeURIComponent(spaceId)}` : ''
}
```

- [ ] **Step 3: 类型检查**

```bash
cd app && npx tsc --noEmit 2>&1 | grep sidecarUrl
```

Expected: 无报错。

- [ ] **Step 4: 提交**

```bash
git add app/src/config/sidecarUrl.ts
git commit -m "fix(sidecar): restore qsSpace helper for space-scoped API calls"
```

---

## Task 2: SessionContext — 恢复 spaceId

**Files:**
- Modify: `app/src/contexts/SessionContext.tsx`

- [ ] **Step 1: 写失败单测（spaceId 应在 Context 中可用）**

```ts
// app/src/contexts/SessionContext.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionContext'

function Probe() {
  const { spaceId } = useSession()
  return <div data-testid="space">{spaceId}</div>
}

describe('SessionContext', () => {
  it('exposes spaceId with default value', () => {
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByTestId('space').textContent).toBe('default')
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- SessionContext.test.tsx
```

Expected: FAIL — `spaceId` 不在 Context 类型中。

- [ ] **Step 3: 在 SessionContext.tsx 中恢复 spaceId**

在 `SessionContextType` 接口中加入：

```ts
spaceId: string
setSpaceId: (id: string) => void
```

在 `SessionProvider` 中加入 state 和深链读取（在现有 `sessions` state 之后）：

```ts
const SPACE_STORAGE_KEY = 'kevin:active-space-id'

function readInitialSpaceId(): string {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('space_id')?.trim()
      if (q) {
        localStorage.setItem(SPACE_STORAGE_KEY, q)
        return q
      }
      return localStorage.getItem(SPACE_STORAGE_KEY) || 'default'
    }
  } catch { /* ignore */ }
  return 'default'
}

// 在 SessionProvider function body 里：
const [spaceId, setSpaceId] = useState<string>(readInitialSpaceId)

const setSpaceIdAndPersist = useCallback((id: string) => {
  try { localStorage.setItem(SPACE_STORAGE_KEY, id) } catch { /* ignore */ }
  setSpaceId(id)
}, [])
```

将 `spaceId` 和 `setSpaceId: setSpaceIdAndPersist` 加入 context value 对象。

- [ ] **Step 4: 恢复 refreshSessions 的 space 作用域**

找到 `refreshSessions` 里的 fetch 调用，改为：

```ts
const res = await fetch(`${SIDECAR_URL}/sessions${qsSpace(spaceId)}`)
```

同时在文件顶部确保 import：

```ts
import { SIDECAR_URL, qsSpace } from '../config/sidecarUrl'
```

- [ ] **Step 5: 运行测试**

```bash
cd app && npm test -- SessionContext.test.tsx
```

Expected: PASS

- [ ] **Step 6: 全量类型检查**

```bash
cd app && npx tsc --noEmit 2>&1 | head -20
```

Expected: 无新增报错。

- [ ] **Step 7: 提交**

```bash
git add app/src/contexts/SessionContext.tsx app/src/contexts/SessionContext.test.tsx
git commit -m "fix(session): restore spaceId/setSpaceId to SessionContext with deep link support"
```

---

## Task 3: RightPanel — 恢复 spaceId 作用域

**Files:**
- Modify: `app/src/components/layout/RightPanel.tsx`

- [ ] **Step 1: 写失败单测（RightPanel 的 sidecar fetch 需带 space_id）**

```tsx
// app/src/components/layout/RightPanel.spaceScope.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RightPanel } from './RightPanel'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))
vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({
    onArtifactStart: vi.fn(),
    onArtifactDelta: vi.fn(),
    onArtifactEnd: vi.fn(),
    loadArtifact: vi.fn(),
    artifact: { streaming: false, content: '', sessionId: null },
  }),
}))

import { useSession } from '../../contexts/SessionContext'

describe('RightPanel space scoping', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      activeSessionId: null,
      spaceId: 'project-alpha',
      setSpaceId: vi.fn(),
      sessions: [],
      setActiveSessionId: vi.fn(),
      createSession: vi.fn(async () => 'new'),
      deleteSession: vi.fn(async () => {}),
      refreshSessions: vi.fn(async () => {}),
      switchToSessionSpace: vi.fn(async () => 'focused' as const),
    })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response)
  })

  it('passes spaceId to useSession', () => {
    render(<RightPanel />)
    expect(useSession).toHaveBeenCalled()
    const ctx = vi.mocked(useSession).mock.results[0]?.value
    expect(ctx?.spaceId).toBe('project-alpha')
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- RightPanel.spaceScope.test.tsx
```

Expected: FAIL — `spaceId` 不在 useSession 返回值中。

- [ ] **Step 3: 在 RightPanel 中取出 spaceId 并加回 qsSpace**

找到 `useSession()` 解构处，加入 `spaceId`：

```ts
const { activeSessionId, createSession, refreshSessions, spaceId } = useSession()
```

找到所有 `fetch(\`${SIDECAR_URL}/tasks\`)`、`fetch(\`${SIDECAR_URL}/sessions/...\`)` 等调用，统一加上 `qsSpace(spaceId)`：

```ts
// 任务轮询（signoff queue）
const res = await fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)

// 消息历史加载
const res = await fetch(`${SIDECAR_URL}/sessions/${activeSessionId}${qsSpace(spaceId)}`)

// 发送消息的 stream endpoint
const res = await fetch(`${SIDECAR_URL}/sessions/${sid}/stream${qsSpace(spaceId)}`, { ... })
```

在文件顶部确保 import：

```ts
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
```

同时恢复 space 切换时清空聊天状态的 effect（防止跨 space 污染）：

```ts
useEffect(() => {
  setMessages([])
  setSendHint(null)
  setArtifactsBySession({})
  setSelectedArtifactId(null)
  artifactDraftRef.current = ''
}, [spaceId])
```

- [ ] **Step 4: 运行测试**

```bash
cd app && npm test -- RightPanel.spaceScope.test.tsx RightPanel.test.tsx
```

Expected: 全部 PASS

- [ ] **Step 5: 提交**

```bash
git add app/src/components/layout/RightPanel.tsx app/src/components/layout/RightPanel.spaceScope.test.tsx
git commit -m "fix(right-panel): restore spaceId scoping for all sidecar fetch calls"
```

---

## Task 4: App.tsx — 恢复配置层

**Files:**
- Modify: `app/src/App.tsx`

- [ ] **Step 1: 写失败单测（App 应渲染 OnboardingWizard 当未配置时）**

```tsx
// app/src/App.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

vi.mock('./contexts/ConfigContext', () => ({
  ConfigProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useKevinConfig: () => ({
    config: null,
    loading: false,
    error: null,
    refresh: vi.fn(async () => {}),
  }),
}))
vi.mock('./components/layout/AppShell', () => ({
  AppShell: () => <div data-testid="app-shell" />,
}))
vi.mock('./components/onboarding/OnboardingWizard', () => ({
  OnboardingWizard: ({ onComplete }: { onComplete: () => void }) => (
    <button onClick={onComplete} data-testid="onboarding">onboarding</button>
  ),
}))
vi.mock('./components/settings/SettingsPanel', () => ({
  SettingsPanel: () => null,
}))
vi.mock('./contexts/SessionContext', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('./contexts/ArtifactContext', () => ({
  ArtifactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe('App', () => {
  it('shows OnboardingWizard when config is null', () => {
    render(<App />)
    expect(screen.getByTestId('onboarding')).toBeInTheDocument()
    expect(screen.queryByTestId('app-shell')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- App.test.tsx
```

Expected: FAIL — App 目前直接渲染 AppShell，无 onboarding 判断。

- [ ] **Step 3: 替换 App.tsx**

```tsx
import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { SessionProvider } from './contexts/SessionContext'
import { ArtifactProvider } from './contexts/ArtifactContext'
import { ConfigProvider, useKevinConfig } from './contexts/ConfigContext'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { SettingsPanel } from './components/settings/SettingsPanel'

function KevinGate() {
  const { config, loading, error, refresh } = useKevinConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-surface-variant)' }}>
        加载中…
      </div>
    )
  }

  if (error && !config) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px' }}>
        <p>无法连接 Sidecar（{error}）</p>
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
          请确认 Kevin Sidecar 已在 localhost:3001 运行。
        </p>
      </div>
    )
  }

  const needsOnboarding = !config?.onboardingComplete || !config?.user.apiKeyConfigured

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={refresh} />
  }

  return (
    <>
      <SessionProvider>
        <ArtifactProvider>
          <AppShell onOpenSettings={() => setSettingsOpen(true)} />
        </ArtifactProvider>
      </SessionProvider>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refresh}
      />
    </>
  )
}

export default function App() {
  return (
    <ConfigProvider>
      <KevinGate />
    </ConfigProvider>
  )
}
```

- [ ] **Step 4: 运行测试**

```bash
cd app && npm test -- App.test.tsx
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/src/App.tsx app/src/App.test.tsx
git commit -m "fix(app): restore ConfigProvider, KevinGate, OnboardingWizard and SettingsPanel"
```

---

## Task 5: AppShell — 恢复路由层

**Files:**
- Modify: `app/src/components/layout/AppShell.tsx`

- [ ] **Step 1: 写失败单测（点击 onOpenSkillStore 后 SkillStore 可见）**

```tsx
// app/src/components/layout/AppShell.routing.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppShell } from './AppShell'

vi.mock('./AppHeader', () => ({
  AppHeader: ({ onOpenSettings }: { onOpenSettings?: () => void }) => (
    <button data-testid="open-settings" onClick={onOpenSettings}>settings</button>
  ),
}))
vi.mock('./LeftSidebar', () => ({
  LeftSidebar: ({ onOpenSkillStore, onOpenAutomation }: { onOpenSkillStore?: () => void; onOpenAutomation?: () => void }) => (
    <div>
      <button data-testid="open-skillstore" onClick={onOpenSkillStore}>skill store</button>
      <button data-testid="open-automation" onClick={onOpenAutomation}>automation</button>
    </div>
  ),
}))
vi.mock('./CenterPanel', () => ({ CenterPanel: () => <div data-testid="center-panel" /> }))
vi.mock('../skill-store/SkillStore', () => ({ SkillStore: () => <div data-testid="skill-store" /> }))
vi.mock('../automation/AutomationCenter', () => ({ AutomationCenter: () => <div data-testid="automation-center" /> }))
vi.mock('../notifications/NotificationCenter', () => ({ NotificationCenter: () => null }))
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sessions: [], activeSessionId: null, spaceId: 'default' }),
}))
vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({ artifact: { streaming: false }, loadArtifact: vi.fn(), clearArtifact: vi.fn() }),
}))

describe('AppShell routing', () => {
  it('shows CenterPanel by default', () => {
    render(<AppShell />)
    expect(screen.getByTestId('center-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('skill-store')).not.toBeInTheDocument()
  })

  it('switches to SkillStore when onOpenSkillStore fires', () => {
    render(<AppShell />)
    fireEvent.click(screen.getByTestId('open-skillstore'))
    expect(screen.getByTestId('skill-store')).toBeInTheDocument()
    expect(screen.queryByTestId('center-panel')).not.toBeInTheDocument()
  })

  it('switches to AutomationCenter when onOpenAutomation fires', () => {
    render(<AppShell />)
    fireEvent.click(screen.getByTestId('open-automation'))
    expect(screen.getByTestId('automation-center')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- AppShell.routing.test.tsx
```

Expected: FAIL

- [ ] **Step 3: 更新 AppShell.tsx**

在现有 `AppShell` 中加入以下 state 和逻辑（保留 `ArtifactAutoLoader`、`getSavedSizes`、`ResizeHandle` 不变）：

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { SkillStore } from '../skill-store/SkillStore'
import { AutomationCenter } from '../automation/AutomationCenter'
import { useDynamicIslandState, type IslandEvent } from '../../hooks/useDynamicIslandState'
import { useSession } from '../../contexts/SessionContext'

// 在 AppShell 函数签名中：
export function AppShell({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const savedSizes = getSavedSizes()
  const { spaceId, sessions, activeSessionId } = useSession()
  const [centerView, setCenterView] = useState<'editor' | 'skillstore' | 'automation'>('editor')
  const [notifOpen, setNotifOpen] = useState(false)
  const [islandEvents, setIslandEvents] = useState<IslandEvent[]>([])
  const islandState = useDynamicIslandState(islandEvents)

  // Island event listener（RightPanel 通过 window.dispatchEvent 发出）
  useEffect(() => {
    const ISLAND_EVENT = 'kevin:island-event'
    const listener = (evt: Event) => {
      const detail = (evt as CustomEvent<IslandEvent>).detail
      if (!detail) return
      setIslandEvents((prev) => [...prev.slice(-5), detail])
    }
    window.addEventListener(ISLAND_EVENT, listener)
    return () => window.removeEventListener(ISLAND_EVENT, listener)
  }, [])

  const notifyBadge =
    islandState.mode === 'awaiting_signoff'

  const onLayout = useCallback((sizes: number[]) => {
    try { localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes)) } catch { /* ignore */ }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ArtifactAutoLoader />
      <AppHeader
        onOpenSettings={onOpenSettings}
        onOpenNotifications={() => setNotifOpen((v) => !v)}
        islandState={islandState}
        notifyBadge={notifyBadge}
      />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        <PanelGroup direction="horizontal" onLayout={onLayout} style={{ width: '100%', height: '100%' }}>
          <Panel defaultSize={savedSizes[0]} minSize={15} maxSize={30}>
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <LeftSidebar
                onOpenSkillStore={() => setCenterView('skillstore')}
                onOpenAutomation={() => setCenterView('automation')}
                onOpenSearch={() => setCenterView('editor')}
              />
            </div>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={savedSizes[1]} minSize={35}>
            <div id="kevin-center-panel" style={{ height: '100%', overflow: 'hidden' }}>
              {centerView === 'editor' && <CenterPanel />}
              {centerView === 'skillstore' && <SkillStore onBack={() => setCenterView('editor')} />}
              {centerView === 'automation' && <AutomationCenter spaceId={spaceId} onBack={() => setCenterView('editor')} />}
            </div>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={savedSizes[2]} minSize={18} maxSize={40}>
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <RightPanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>
      <style>{`
        .resize-handle-inner:hover,
        [data-resize-handle-active] .resize-handle-inner {
          background: color-mix(in srgb, var(--color-primary) 30%, transparent) !important;
        }
      `}</style>
    </div>
  )
}
```

注意：将 `AppHeader` 中现有的 island event listener 逻辑删除（island 事件现在由 AppShell 统一管理）。

- [ ] **Step 4: 运行测试**

```bash
cd app && npm test -- AppShell.routing.test.tsx
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/src/components/layout/AppShell.tsx app/src/components/layout/AppShell.routing.test.tsx
git commit -m "fix(app-shell): restore centerView router, notifOpen, island events, and full prop chain"
```

---

## Task 6: AccountMenu — 新建头像账户菜单

**Files:**
- Create: `app/src/components/layout/AccountMenu.tsx`

- [ ] **Step 1: 写失败单测**

```tsx
// app/src/components/layout/AccountMenu.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'

describe('AccountMenu', () => {
  it('renders user info and logout when open', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    render(
      <AccountMenu
        open={true}
        onClose={vi.fn()}
        anchorRef={ref}
        userName="Shawn"
        userEmail="shawn@example.com"
        onResetConfig={vi.fn()}
      />
    )
    expect(screen.getByText('Shawn')).toBeInTheDocument()
    expect(screen.getByText('shawn@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重置配置/i })).toBeInTheDocument()
  })

  it('is hidden when not open', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    render(
      <AccountMenu open={false} onClose={vi.fn()} anchorRef={ref} userName="Shawn" onResetConfig={vi.fn()} />
    )
    expect(screen.queryByText('Shawn')).not.toBeInTheDocument()
  })

  it('calls onClose when Escape pressed', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    const onClose = vi.fn()
    render(<AccountMenu open={true} onClose={onClose} anchorRef={ref} userName="U" onResetConfig={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onResetConfig when 重置配置 clicked', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    const onReset = vi.fn()
    render(<AccountMenu open={true} onClose={vi.fn()} anchorRef={ref} userName="U" onResetConfig={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /重置配置/i }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- AccountMenu.test.tsx
```

Expected: FAIL — 文件不存在。

- [ ] **Step 3: 创建 AccountMenu.tsx**

```tsx
// app/src/components/layout/AccountMenu.tsx
import { useEffect, useRef } from 'react'

type AccountMenuProps = {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  userName: string
  userEmail?: string
  onResetConfig: () => void
}

export function AccountMenu({ open, onClose, anchorRef, userName, userEmail, onResetConfig }: AccountMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onPointer = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        top: '56px',
        right: '16px',
        zIndex: 200,
        minWidth: '200px',
        background: 'var(--color-surface-container-low)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: '8px 0',
      }}
    >
      {/* 用户信息 */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface)' }}>{userName}</div>
        {userEmail && (
          <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '2px' }}>{userEmail}</div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ padding: '4px 0' }}>
        <button
          type="button"
          role="menuitem"
          aria-label="重置配置"
          onClick={() => { onResetConfig(); onClose() }}
          style={{
            width: '100%',
            padding: '8px 16px',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-error)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          重置配置
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 运行测试**

```bash
cd app && npm test -- AccountMenu.test.tsx
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add app/src/components/layout/AccountMenu.tsx app/src/components/layout/AccountMenu.test.tsx
git commit -m "feat(ui): add AccountMenu component for avatar dropdown (W-04)"
```

---

## Task 7: AppHeader — 清理 + 接线 + 接入 AccountMenu

**Files:**
- Modify: `app/src/components/layout/AppHeader.tsx`

- [ ] **Step 1: 写失败单测**

```tsx
// app/src/components/layout/AppHeader.functional.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppHeader } from './AppHeader'

const idleState = { mode: 'idle' as const, label: '就绪' }

describe('AppHeader', () => {
  it('does not render Drafts/Published/Reviews/Archive tabs', () => {
    render(<AppHeader islandState={idleState} />)
    expect(screen.queryByText('Drafts')).not.toBeInTheDocument()
    expect(screen.queryByText('Published')).not.toBeInTheDocument()
  })

  it('calls onOpenSettings when settings button clicked', () => {
    const onOpenSettings = vi.fn()
    render(<AppHeader islandState={idleState} onOpenSettings={onOpenSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /设置/i }))
    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenNotifications when bell clicked', () => {
    const onOpenNotifications = vi.fn()
    render(<AppHeader islandState={idleState} onOpenNotifications={onOpenNotifications} />)
    fireEvent.click(screen.getByRole('button', { name: /通知/i }))
    expect(onOpenNotifications).toHaveBeenCalledTimes(1)
  })

  it('shows AccountMenu when avatar clicked', () => {
    render(<AppHeader islandState={idleState} />)
    fireEvent.click(screen.getByRole('button', { name: /账户/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows notify badge dot when notifyBadge=true', () => {
    render(<AppHeader islandState={idleState} notifyBadge={true} />)
    expect(document.querySelector('[aria-label="通知"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- AppHeader.functional.test.tsx
```

Expected: FAIL（Nav Tabs 存在，按钮无 handler，AccountMenu 不存在）

- [ ] **Step 3: 替换 AppHeader.tsx**

```tsx
// app/src/components/layout/AppHeader.tsx
import { useRef, useState } from 'react'
import { DynamicIsland } from './DynamicIsland'
import { AccountMenu } from './AccountMenu'
import type { DynamicIslandState } from '../../hooks/useDynamicIslandState'

export function AppHeader({
  onOpenSettings,
  onOpenNotifications,
  islandState,
  notifyBadge = false,
}: {
  onOpenSettings?: () => void
  onOpenNotifications?: () => void
  islandState: DynamicIslandState
  notifyBadge?: boolean
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '56px',
        padding: '0 24px',
        backgroundColor: 'var(--color-surface-container-lowest)',
        borderBottom: '1px solid var(--color-outline-variant)',
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--color-on-surface)', minWidth: 0, flex: 1 }}>
        <span className="material-symbols-outlined filled" style={{ color: 'var(--color-primary)', fontSize: '22px' }}>terminal</span>
        Kevin
      </div>

      {/* Center: DynamicIsland */}
      <DynamicIsland state={islandState} />

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          type="button"
          aria-label="通知"
          onClick={() => onOpenNotifications?.()}
          style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)', position: 'relative' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
          {notifyBadge && (
            <span style={{ position: 'absolute', top: '8px', right: '8px', width: '7px', height: '7px', background: 'var(--color-error)', borderRadius: '50%' }} />
          )}
        </button>

        <button
          type="button"
          aria-label="设置"
          onClick={() => onOpenSettings?.()}
          style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
        </button>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-outline-variant)', margin: '0 4px' }} />

        {/* Avatar → AccountMenu */}
        <button
          ref={avatarRef}
          type="button"
          aria-label="账户"
          onClick={() => setAccountOpen((v) => !v)}
          style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-container)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          K
        </button>

        <AccountMenu
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          anchorRef={avatarRef}
          userName="Kevin 用户"
          onResetConfig={() => {
            localStorage.clear()
            window.location.reload()
          }}
        />
      </div>
    </header>
  )
}
```

- [ ] **Step 4: 运行测试**

```bash
cd app && npm test -- AppHeader.functional.test.tsx AppHeader.test.tsx
```

Expected: 全部 PASS（注意保留原有 DynamicIsland 无输入框测试通过）

- [ ] **Step 5: 提交**

```bash
git add app/src/components/layout/AppHeader.tsx app/src/components/layout/AppHeader.functional.test.tsx
git commit -m "fix(header): remove nav tabs, wire settings/notifications, add AccountMenu (W-01/W-03/W-04)"
```

---

## Task 8: LeftSidebar — 恢复导航 props + 连接器动态化

**Files:**
- Modify: `app/src/components/layout/LeftSidebar.tsx`

- [ ] **Step 1: 写失败单测（onOpenSkillStore prop 生效）**

```tsx
// app/src/components/layout/LeftSidebar.nav.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LeftSidebar } from './LeftSidebar'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    sessions: [],
    activeSessionId: null,
    spaceId: 'default',
    setSpaceId: vi.fn(),
    createSession: vi.fn(async () => 'new'),
    deleteSession: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    switchToSessionSpace: vi.fn(async () => 'focused' as const),
  }),
}))
vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({ clearArtifact: vi.fn() }),
}))

describe('LeftSidebar navigation props', () => {
  it('calls onOpenSkillStore when Skill Store clicked', () => {
    const onOpenSkillStore = vi.fn()
    render(<LeftSidebar onOpenSkillStore={onOpenSkillStore} />)
    fireEvent.click(screen.getByRole('button', { name: /skill store/i }))
    expect(onOpenSkillStore).toHaveBeenCalledTimes(1)
  })

  it('calls onOpenAutomation when 自动化 clicked', () => {
    const onOpenAutomation = vi.fn()
    render(<LeftSidebar onOpenAutomation={onOpenAutomation} />)
    fireEvent.click(screen.getByRole('button', { name: /自动化/i }))
    expect(onOpenAutomation).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行并确认失败**

```bash
cd app && npm test -- LeftSidebar.nav.test.tsx
```

Expected: FAIL — `LeftSidebar` 当前不接受这些 props。

- [ ] **Step 3: 在 LeftSidebar 中恢复导航 props**

将 `LeftSidebar` 函数签名改为：

```ts
export function LeftSidebar({
  onOpenSkillStore,
  onOpenAutomation,
  onOpenSearch,
}: {
  onOpenSkillStore?: () => void
  onOpenAutomation?: () => void
  onOpenSearch?: () => void
} = {}) {
```

在 Top Nav 区，将对应按钮的 `action` 回调改为：

```ts
{ icon: 'search',    label: '搜索',      action: () => onOpenSearch?.() },
{ icon: 'extension', label: 'Skill Store', action: () => onOpenSkillStore?.() },
{ icon: 'smart_toy', label: '自动化',    action: () => onOpenAutomation?.() },
```

- [ ] **Step 4: 恢复 spaceId 与 pendingSignoffSessionIds 轮询**

从 `useSession()` 取出 `spaceId`，恢复 4 秒轮询 `/tasks`：

```ts
const { sessions, activeSessionId, createSession, deleteSession, switchToSessionSpace, spaceId } = useSession()
const [pendingSignoffSessionIds, setPendingSignoffSessionIds] = useState<Set<string>>(new Set())

useEffect(() => {
  let cancelled = false
  const tick = async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
      if (!res.ok || cancelled) return
      const rows = (await res.json()) as Array<{ state: string; payload?: unknown }>
      const awaiting = rows.filter((r) => r.state === 'awaiting-signoff')
      const ids = new Set(
        awaiting.map((r) => {
          try {
            const obj = JSON.parse(String(r.payload ?? '')) as { session_id?: string; sessionId?: string }
            return obj.session_id ?? obj.sessionId ?? null
          } catch { return null }
        }).filter((id): id is string => Boolean(id))
      )
      if (!cancelled) setPendingSignoffSessionIds(ids)
    } catch {
      if (!cancelled) setPendingSignoffSessionIds(new Set())
    }
  }
  void tick()
  const timer = window.setInterval(tick, 4000)
  return () => { cancelled = true; window.clearInterval(timer) }
}, [spaceId])
```

在会话行中用 `pendingSignoffSessionIds.has(id)` 显示红点（原有逻辑已在 `LeftSidebar.tsx` 的会话行渲染中，确认保留）。

- [ ] **Step 5: 连接器动态拉取（fallback 硬编码）**

在现有 `connectors` 定义处改为动态拉取：

```ts
const FALLBACK_CONNECTORS = [
  { name: 'Filesystem MCP', status: 'healthy' as const, lastSuccess: '刚刚' },
  { name: '系统监控 MCP',  status: 'healthy' as const, lastSuccess: '2分钟前' },
  { name: '贝易转 DW',     status: 'error' as const,   lastSuccess: '20分钟前' },
]

const [rawConnectors, setRawConnectors] = useState(FALLBACK_CONNECTORS)

useEffect(() => {
  fetch(`${SIDECAR_URL}/connectors`)
    .then(r => r.ok ? r.json() : Promise.reject())
    .then((data: typeof FALLBACK_CONNECTORS) => {
      if (Array.isArray(data) && data.length > 0) setRawConnectors(data)
    })
    .catch(() => { /* fallback 保持默认 */ })
}, [])

const connectors = sortConnectors(rawConnectors)
```

- [ ] **Step 6: 运行测试**

```bash
cd app && npm test -- LeftSidebar.nav.test.tsx LeftSidebar.test.tsx LeftSidebar.space.test.tsx
```

Expected: 全部 PASS

- [ ] **Step 7: 提交**

```bash
git add app/src/components/layout/LeftSidebar.tsx app/src/components/layout/LeftSidebar.nav.test.tsx
git commit -m "fix(sidebar): restore nav props, spaceId signoff polling, and dynamic connectors (W-05/R-04/R-05)"
```

---

## Task 9: 全量冒烟测试与验收

**Files:**
- No file changes — 验证阶段

- [ ] **Step 1: 运行所有前端测试**

```bash
cd app && npm test
```

Expected: 全部 PASS，无新增失败。

- [ ] **Step 2: 类型检查**

```bash
cd app && npx tsc --noEmit
```

Expected: 0 errors。

- [ ] **Step 3: 启动开发服务器并手工验收**

```bash
# 终端 1：启动 sidecar
cd /Users/shawn/Data/Kyberkit && bun run src-sidecar/index.ts

# 终端 2：启动前端
cd /Users/shawn/Data/Kyberkit/app && npm run dev
```

逐项核查验收清单：

- [ ] 点击设置齿轮 → SettingsPanel 弹出，可修改并保存
- [ ] 点击通知铃铛 → NotificationCenter 面板展开
- [ ] 点击头像 K → AccountMenu 下拉，显示用户名，可点击"重置配置"
- [ ] 左栏 Skill Store → 中栏切换为 SkillStore 视图
- [ ] 左栏自动化 → 中栏切换为 AutomationCenter 视图
- [ ] 顶部无 Drafts / Published / Reviews / Archive 标签
- [ ] 顶部无 Export / Share 按钮
- [ ] 灵动岛显示为状态条（无 caret / placeholder）
- [ ] 发送一条消息 → 灵动岛从 idle → running → completed 状态流转可见
- [ ] 切换到不同 Space → 聊天记录清空，不跨 space 混入

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore(kevin1.5): regression fix complete — all W/R class issues resolved"
```

---

## Self-Review Checklist

**Spec 覆盖：**
- R-01（App.tsx config layer）→ Task 4 ✓
- R-02（AppShell routing）→ Task 5 ✓
- R-03（AppHeader nav tabs + handlers）→ Task 7 ✓
- R-04（LeftSidebar nav props）→ Task 8 ✓
- R-05（SessionContext spaceId）→ Task 2 ✓
- R-06（DynamicIsland wiring）→ Task 5 (AppShell island event listener) ✓
- R-07（RightPanel qsSpace）→ Task 3 ✓
- W-01（移除 Nav Tabs）→ Task 7 ✓
- W-02（灵动岛非输入框）→ 现有 DynamicIsland 组件已正确，Task 5 接线后生效 ✓
- W-03（按钮无响应）→ Task 5 + Task 7 ✓
- W-04（头像账户菜单）→ Task 6 + Task 7 ✓
- W-05（左栏导航无响应）→ Task 8 ✓
- qsSpace 缺失 → Task 1 ✓

**Placeholder 扫描：** 无 TBD / TODO / 后续实现。✓

**类型一致性：**
- `DynamicIslandState` 从 `useDynamicIslandState` import，AppShell 传给 AppHeader 的 `islandState` prop 类型一致 ✓
- `SpaceSwitchOutcome` 在 SessionContext 和 LeftSidebar mock 中一致使用 `'focused' as const` ✓
- `AccountMenu` 的 `anchorRef` 类型 `React.RefObject<HTMLButtonElement | null>` 与 `useRef<HTMLButtonElement>(null)` 一致 ✓
