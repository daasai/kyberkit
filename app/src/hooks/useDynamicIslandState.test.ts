import { describe, expect, it } from 'vitest'
import { reduceIslandState, type IslandEvent } from './useDynamicIslandState'

describe('reduceIslandState', () => {
  it('prioritizes awaiting_signoff over completed_transient', () => {
    const events: IslandEvent[] = [
      { type: 'task.completed', summary: 'Done' },
      { type: 'task.awaiting_signoff', pendingCount: 2 },
    ]
    const state = reduceIslandState(events)
    expect(state.mode).toBe('awaiting_signoff')
    expect(state.label).toBe('2 items need sign-off')
  })
})

