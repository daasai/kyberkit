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

describe('LeftSidebar Space switcher', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      sessions: [
        { id: 's1', title: 'Alpha Space', createdAt: iso(120_000), updatedAt: iso(60_000) },
        { id: 's2', title: 'Beta Space', createdAt: iso(300_000), updatedAt: iso(30_000) },
      ],
      activeSessionId: 's1',
      setActiveSessionId: vi.fn(),
      createSession: vi.fn(async () => 'new'),
      deleteSession: vi.fn(async () => {}),
      refreshSessions: vi.fn(async () => {}),
      switchToSessionSpace: vi.fn(async () => 'focused' as const),
    })
  })

  it('shows current space title on the anchor', () => {
    render(<LeftSidebar />)
    const btn = screen.getByTestId('space-switcher')
    expect(btn).toHaveTextContent('Alpha Space')
  })

  it('opens menu with space rows and manage action', () => {
    render(<LeftSidebar />)
    fireEvent.click(screen.getByTestId('space-switcher'))
    const menu = screen.getByTestId('space-switcher-menu')
    expect(menu).toBeInTheDocument()
    expect(within(menu).getByText('Alpha Space')).toBeInTheDocument()
    expect(within(menu).getByText('Beta Space')).toBeInTheDocument()
    expect(within(menu).getByText('管理 Space…')).toBeInTheDocument()
  })
})
