import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { LeftSidebar } from './LeftSidebar'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: () => ({ clearArtifact: vi.fn() }),
}))

import { useSession } from '../../contexts/SessionContext'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

const SPACE_A = 'a0000000-0000-4000-8000-000000000001'
const SPACE_B = 'b0000000-0000-4000-8000-000000000002'

function baseSessionMock(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    spaceId: SPACE_A,
    setSpaceId: vi.fn(),
    spaces: [
      { id: SPACE_A, label: '默认 Space' },
      { id: SPACE_B, label: 'Beta Space' },
    ],
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
    createSpaceLibrary: vi.fn(async () => ({ id: SPACE_A, label: '默认 Space' })),
    openSpaceInNewWindow: vi.fn(async () => 'focused' as const),
    ...overrides,
  } as ReturnType<typeof useSession>
}

describe('LeftSidebar Space switcher', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue(baseSessionMock())
  })

  it('shows current Space label on the anchor', () => {
    render(<LeftSidebar />)
    const btn = screen.getByTestId('space-switcher')
    expect(btn).toHaveTextContent('默认 Space')
  })

  it('opens menu with Space rows and manage action', () => {
    render(<LeftSidebar />)
    fireEvent.click(screen.getByTestId('space-switcher'))
    const menu = screen.getByTestId('space-switcher-menu')
    expect(menu).toBeInTheDocument()
    expect(within(menu).getByText('默认 Space')).toBeInTheDocument()
    expect(within(menu).getByText('Beta Space')).toBeInTheDocument()
    expect(within(menu).getByText('管理 Space…')).toBeInTheDocument()
  })

  it('selecting another Space calls setSpaceId in current window', () => {
    const setSpaceId = vi.fn()
    vi.mocked(useSession).mockReturnValue(baseSessionMock({ setSpaceId }))
    render(<LeftSidebar />)
    fireEvent.click(screen.getByTestId('space-switcher'))
    const menu = screen.getByTestId('space-switcher-menu')
    const items = within(menu).getAllByRole('menuitem')
    fireEvent.click(items[1] as HTMLElement)
    expect(setSpaceId).toHaveBeenCalledWith(SPACE_B)
  })

  it('manage action opens space manager panel', () => {
    vi.mocked(useSession).mockReturnValue(baseSessionMock())
    render(<LeftSidebar />)
    fireEvent.click(screen.getByTestId('space-switcher'))
    const menu = screen.getByTestId('space-switcher-menu')
    fireEvent.click(within(menu).getByText('管理 Space…'))
    expect(screen.getByText('新建 Space')).toBeInTheDocument()
  })
})
