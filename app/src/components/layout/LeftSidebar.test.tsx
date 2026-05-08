import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LeftSidebar, connectorSummary, sortConnectors } from './LeftSidebar'
import { useSession } from '../../contexts/SessionContext'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({ clearArtifact: vi.fn() }),
}))

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

function baseSessionMock(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    spaceId: 'default',
    setSpaceId: vi.fn(),
    spaces: [{ id: 'default', label: '默认 Space' }],
    refreshSpaces: vi.fn().mockResolvedValue(undefined),
    sessions: [
      { id: 's1', title: 'Chat One', createdAt: iso(120_000), updatedAt: iso(60_000) },
      { id: 's2', title: 'Chat Two', createdAt: iso(300_000), updatedAt: iso(30_000) },
    ],
    activeSessionId: 's1',
    setActiveSessionId: vi.fn(),
    createSession: vi.fn(async () => 'new'),
    deleteSession: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    openSpaceInNewWindow: vi.fn(async () => 'focused' as const),
    ...overrides,
  } as ReturnType<typeof useSession>
}

beforeEach(() => {
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
})

describe('history sessions in sidebar', () => {
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
      if (url.includes('/library/tree') && url.includes('space_id=beta')) {
        return {
          ok: true,
          json: async () => ([
            {
              name: 'docs',
              path: '@/spaces/default/docs/docs',
              kind: 'dir',
              children: [
                {
                  name: 'this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md',
                  path: '@/spaces/default/docs/docs/this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md',
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
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ spaceId: 'beta' }))

    render(<LeftSidebar />)
    const longName = await screen.findByText('this-is-a-very-very-long-file-name-for-sidebar-overflow-check.md')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/library/tree?space_id=beta'))
    expect(longName).toHaveStyle({
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    })
  })
})
