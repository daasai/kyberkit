import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LeftSidebar, connectorSummary, sortConnectors } from './LeftSidebar'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: vi.fn(),
}))

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const SPACE_A = 'a0000000-0000-4000-8000-000000000001'
const SPACE_B = 'b0000000-0000-4000-8000-000000000002'

function baseSessionMock(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    spaceId: SPACE_A,
    setSpaceId: vi.fn(),
    spaces: [{ id: SPACE_A, label: '默认 Space' }],
    refreshSpaces: vi.fn().mockResolvedValue([{ id: SPACE_A, label: '默认 Space' }]),
    sessions: [
      { id: 's1', title: 'Chat One', createdAt: iso(120_000), updatedAt: iso(60_000) },
      { id: 's2', title: 'Chat Two', createdAt: iso(300_000), updatedAt: iso(30_000) },
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

beforeEach(() => {
  vi.mocked(useArtifact).mockReturnValue({
    clearArtifact: vi.fn(),
    loadArtifact: vi.fn(),
    openLibraryDocument: vi.fn(),
  } as ReturnType<typeof useArtifact>)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })) as unknown as typeof fetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('connectors in sidebar', () => {
  it('sorts error connectors first', () => {
    const sorted = sortConnectors([
      { name: 'A', status: 'healthy', lastSuccess: '刚刚' },
      { name: 'B', status: 'error', lastSuccess: '20分钟前' },
    ])
    expect(sorted[0]?.name).toBe('B')
  })

  it('shows healthy/error summary text', () => {
    const summary = connectorSummary([
      { name: 'A', status: 'healthy', lastSuccess: '刚刚' },
      { name: 'B', status: 'error', lastSuccess: '20分钟前' },
      { name: 'C', status: 'healthy', lastSuccess: '2分钟前' },
    ])
    expect(summary).toBe('2 正常 / 1 异常')
  })

  it('shows empty connectors copy when connectors request fails', async () => {
    vi.mocked(useSession).mockReturnValue(baseSessionMock())
    render(<LeftSidebar />)

    expect(await screen.findByText('暂无可用连接器')).toBeInTheDocument()
    expect(screen.queryByText('Filesystem MCP')).not.toBeInTheDocument()
    expect(screen.queryByText('状态不可用')).not.toBeInTheDocument()
  })

  it('shows only 贝易转 DW when API returns multiple connector rows', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/connectors')) {
        return {
          ok: true,
          json: async () => [
            { name: 'Filesystem MCP', status: 'healthy', lastSuccess: '刚刚' },
            { name: '贝易转 DW', status: 'healthy', lastSuccess: '刚刚' },
          ],
        } as Response
      }
      return { ok: false, json: async () => [] } as Response
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    vi.mocked(useSession).mockReturnValue(baseSessionMock())

    render(<LeftSidebar />)

    expect(await screen.findByText('贝易转 DW')).toBeInTheDocument()
    expect(screen.queryByText('Filesystem MCP')).not.toBeInTheDocument()
  })
})

describe('history sessions in sidebar', () => {
  it('shows at most three sessions until 更多 is expanded', async () => {
    const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
    vi.mocked(useSession).mockReturnValue(
      baseSessionMock({
        sessions: [
          { id: 's1', title: 'One', createdAt: iso(10_000), updatedAt: iso(10_000) },
          { id: 's2', title: 'Two', createdAt: iso(20_000), updatedAt: iso(20_000) },
          { id: 's3', title: 'Three', createdAt: iso(30_000), updatedAt: iso(30_000) },
          { id: 's4', title: 'Four', createdAt: iso(40_000), updatedAt: iso(40_000) },
        ],
        activeSessionId: 's1',
      }),
    )
    render(<LeftSidebar />)

    expect(screen.getByText('One')).toBeInTheDocument()
    expect(screen.getByText('Two')).toBeInTheDocument()
    expect(screen.getByText('Three')).toBeInTheDocument()
    expect(screen.queryByText('Four')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('更多（1）'))
    expect(await screen.findByText('Four')).toBeInTheDocument()
    fireEvent.click(screen.getByText('收起'))
    expect(screen.queryByText('Four')).not.toBeInTheDocument()
  })

  it('switches sessions in-place without opening a new window', () => {
    const setActiveSessionId = vi.fn()
    const openSpaceInNewWindow = vi.fn(async () => 'focused' as const)
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ setActiveSessionId, openSpaceInNewWindow }))

    render(<LeftSidebar />)
    fireEvent.click(screen.getByText('Chat Two'))

    expect(setActiveSessionId).toHaveBeenCalledWith('s2')
    expect(openSpaceInNewWindow).not.toHaveBeenCalled()
    expect(windowOpen).not.toHaveBeenCalled()
  })
})

describe('document library in sidebar', () => {
  it('loads tree by current space and truncates long names', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/library/tree') && url.includes(`space_id=${SPACE_B}`)) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'docs',
              path: '@/libraries/lib-1/docs',
              kind: 'dir',
              children: [
                {
                  name: 'this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md',
                  path: '@/libraries/lib-1/docs/this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md',
                  kind: 'file',
                },
              ],
            },
          ]),
        } as Response
      }
      return { ok: false, json: async () => [] } as Response
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ spaceId: SPACE_B }))

    render(<LeftSidebar />)
    const longName = await screen.findByText('this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`/library/tree?space_id=${SPACE_B}`))
    expect(longName).toHaveStyle({
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    })
  })

  it('shows friendly preview unsupported message for large/binary files', async () => {
    const loadArtifact = vi.fn()
    const openLibraryDocument = vi.fn()
    vi.mocked(useArtifact).mockReturnValue({
      clearArtifact: vi.fn(),
      loadArtifact,
      openLibraryDocument,
    } as ReturnType<typeof useArtifact>)
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/library/tree') && url.includes(`space_id=${SPACE_B}`)) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'docs',
              path: '@/libraries/lib-1/docs',
              kind: 'dir',
              children: [
                {
                  name: 'big.bin',
                  path: '@/libraries/lib-1/docs/big.bin',
                  kind: 'file',
                },
              ],
            },
          ]),
        } as Response
      }
      if (url.includes('/library/file') && url.includes(`space_id=${SPACE_B}`)) {
        return {
          ok: false,
          status: 413,
          json: async () => ({ reason: 'too_large', size: 8 * 1024 * 1024, maxSize: 5 * 1024 * 1024 }),
        } as Response
      }
      return { ok: false, json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ spaceId: SPACE_B, activeSessionId: 's1' }))

    render(<LeftSidebar />)
    fireEvent.click(await screen.findByText('big.bin'))

    await waitFor(() => {
      expect(loadArtifact).toHaveBeenCalled()
      const lastCall = loadArtifact.mock.calls.at(-1)
      expect(String(lastCall?.[1] ?? '')).toContain('文件预览不可用')
      expect(String(lastCall?.[1] ?? '')).toContain('超过预览上限')
    })
  })
})
