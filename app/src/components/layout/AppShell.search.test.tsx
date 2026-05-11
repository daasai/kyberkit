import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppShell } from './AppShell'
import { useSession } from '../../contexts/SessionContext'

vi.mock('react-resizable-panels', () => ({
  PanelGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  PanelResizeHandle: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({
    artifact: { streaming: false, libraryFileRef: null, savedPath: null, sessionId: null, content: '', loadSeq: 0 },
    loadArtifact: vi.fn(),
    openLibraryDocument: vi.fn(),
    clearArtifact: vi.fn(),
  }),
}))

vi.mock('./AppHeader', () => ({
  AppHeader: (p: { onOpenSearch?: () => void }) => (
    <header>
      <button type="button" onClick={() => p.onOpenSearch?.()}>
        搜索
      </button>
    </header>
  ),
}))

vi.mock('./CenterPanel', () => ({
  CenterPanel: () => <main data-testid="editor-center-panel">Editor Center Panel</main>,
}))

vi.mock('./RightPanel', () => ({
  RightPanel: () => <aside>Right Panel</aside>,
}))

vi.mock('../skill-store/SkillStore', () => ({
  SkillStore: () => <main>Skill Store</main>,
}))

vi.mock('../automation/AutomationCenter', () => ({
  AutomationCenter: () => <main>Automation Center</main>,
}))

vi.mock('../notifications/NotificationCenter', () => ({
  NotificationCenter: () => null,
}))

vi.mock('../../hooks/useDynamicIslandState', () => ({
  useDynamicIslandState: () => ({ mode: 'idle' }),
}))

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const SPACE_A = 'a0000000-0000-4000-8000-000000000001'

function baseSessionMock(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    spaceId: SPACE_A,
    setSpaceId: vi.fn(),
    spaces: [{ id: SPACE_A, label: '默认 Space' }],
    refreshSpaces: vi.fn().mockResolvedValue([{ id: SPACE_A, label: '默认 Space' }]),
    sessions: [
      { id: 's1', title: 'Growth Weekly Sync', createdAt: iso(120_000), updatedAt: iso(60_000), artifactPreview: 'weekly report summary' },
      { id: 's2', title: 'Finance Notes', createdAt: iso(300_000), updatedAt: iso(30_000), artifactPreview: 'budget planning' },
    ],
    activeSessionId: 's1',
    setActiveSessionId: vi.fn(),
    createSession: vi.fn(async () => 'new'),
    deleteSession: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    pinSession: vi.fn(async () => {}),
    createSpaceLibrary: vi.fn(async () => ({ id: SPACE_A, label: '默认 Space' })),
    updateSpaceDisplayName: vi.fn(async () => {}),
    deleteSpace: vi.fn(async () => {}),
    openSpaceInNewWindow: vi.fn(async () => 'focused' as const),
    ...overrides,
  } as ReturnType<typeof useSession>
}

describe('AppShell global search', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as unknown as typeof fetch)
    vi.mocked(useSession).mockReturnValue(baseSessionMock())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens embedded global search from the header, replacing the editor center', () => {
    render(<AppShell />)

    fireEvent.click(screen.getByText('搜索'))

    const region = screen.getByRole('region', { name: '全局搜索' })
    const input = within(region).getByPlaceholderText(/搜索会话标题、制品摘要或文档库正文/)
    expect(screen.queryByTestId('editor-center-panel')).not.toBeInTheDocument()
    expect(input).toHaveFocus()

    fireEvent.change(input, { target: { value: 'growth' } })
    expect(within(region).getByText('Growth Weekly Sync')).toBeInTheDocument()
  })

  it('selects a search result and closes the overlay', () => {
    const setActiveSessionId = vi.fn()
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ setActiveSessionId }))

    render(<AppShell />)

    fireEvent.click(screen.getByText('搜索'))
    const region = screen.getByRole('region', { name: '全局搜索' })
    fireEvent.change(within(region).getByPlaceholderText(/搜索会话标题、制品摘要或文档库正文/), { target: { value: 'finance' } })
    fireEvent.click(within(region).getByText('Finance Notes'))

    expect(setActiveSessionId).toHaveBeenCalledWith('s2')
    expect(screen.queryByRole('region', { name: '全局搜索' })).not.toBeInTheDocument()
    expect(screen.getByTestId('editor-center-panel')).toBeInTheDocument()
  })

  it('loads active session artifact with required space_id query', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ artifactContent: '', messages: [] }),
    })) as unknown as typeof fetch
    vi.stubGlobal('fetch', fetchMock)

    render(<AppShell />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/sessions/s1?space_id=${SPACE_A}`))
    })
  })
})
