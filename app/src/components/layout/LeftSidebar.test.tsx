import { describe, expect, it, vi } from 'vitest'
import { connectorSummary, handleSpaceSelection, sortConnectors } from './LeftSidebar'

describe('handleSpaceSelection', () => {
  it('opens and focuses target space for non-current selection', async () => {
    const switchToSessionSpace = vi.fn(async () => 'focused' as const)

    const outcome = await handleSpaceSelection({
      targetSessionId: 'space-b',
      activeSessionId: 'space-a',
      switchToSessionSpace,
    })

    expect(outcome).toBe('focused')
    expect(switchToSessionSpace).toHaveBeenCalledTimes(1)
    expect(switchToSessionSpace).toHaveBeenCalledWith('space-b')
  })

  it('noops for current selection', async () => {
    const switchToSessionSpace = vi.fn(async () => 'focused' as const)
    const onCurrentSpaceSelected = vi.fn()

    const outcome = await handleSpaceSelection({
      targetSessionId: 'space-a',
      activeSessionId: 'space-a',
      switchToSessionSpace,
      onCurrentSpaceSelected,
    })

    expect(outcome).toBe('noop')
    expect(switchToSessionSpace).not.toHaveBeenCalled()
    expect(onCurrentSpaceSelected).toHaveBeenCalledTimes(1)
  })
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
})
