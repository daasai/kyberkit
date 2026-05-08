import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { GlobalSearchView } from './GlobalSearchView'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

import { useSession } from '../../contexts/SessionContext'

describe('GlobalSearchView', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue({
      sessions: [
        { id: 's1', title: 'Growth Weekly Sync', createdAt: '', updatedAt: '', artifactPreview: 'weekly report summary' },
        { id: 's2', title: 'Finance Notes', createdAt: '', updatedAt: '', artifactPreview: 'budget planning' },
      ],
      setActiveSessionId: vi.fn(),
    } as unknown as ReturnType<typeof useSession>)
  })

  it('shows blank guidance when no keyword', () => {
    render(<GlobalSearchView onBack={vi.fn()} />)
    expect(screen.getByText('搜索中心（Global Search）')).toBeInTheDocument()
  })

  it('filters sessions and opens result', () => {
    const setActiveSessionId = vi.fn()
    const onBack = vi.fn()
    vi.mocked(useSession).mockReturnValue({
      sessions: [
        { id: 's1', title: 'Growth Weekly Sync', createdAt: '', updatedAt: '', artifactPreview: 'weekly report summary' },
      ],
      setActiveSessionId,
    } as unknown as ReturnType<typeof useSession>)

    render(<GlobalSearchView onBack={onBack} />)
    fireEvent.change(screen.getByPlaceholderText('搜索会话标题或制品摘要...'), { target: { value: 'growth' } })
    fireEvent.click(screen.getByText('Growth Weekly Sync'))
    expect(setActiveSessionId).toHaveBeenCalledWith('s1')
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('filters sessions by artifact preview', () => {
    render(<GlobalSearchView onBack={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('搜索会话标题或制品摘要...'), { target: { value: 'budget' } })
    expect(screen.getByText('Finance Notes')).toBeInTheDocument()
    expect(screen.queryByText('Growth Weekly Sync')).not.toBeInTheDocument()
  })

  it('pressing Escape goes back to editor', () => {
    const onBack = vi.fn()
    render(<GlobalSearchView onBack={onBack} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
