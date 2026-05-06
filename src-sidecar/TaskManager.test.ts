import { describe, it, expect } from 'bun:test'
import { TypedEventBus } from '../src/events/EventBus.js'
import type { KyberEvents } from '../src/types/events.js'
import {
  attachSkillSuggestedRuntimeBridge,
  createSpaceEventBroadcaster,
  toSkillSuggestedSsePayload,
} from './spaceEventBroadcast.js'

describe('spaceEventBroadcast', () => {
  it('maps skill.suggested payload to SSE shape', () => {
    const payload = {
      sessionId: 'session-1',
      spaceId: 'space-1',
      timestamp: 1715000000000,
      draft: {
        draftId: 'draft-1',
        slug: 'test-skill',
        title: 'Use fast path',
        markdown: '# Use fast path\n\nPrefer fast path for batch mode.',
        taskId: 'task-1',
      },
      toolNames: ['shell'],
    }

    expect(toSkillSuggestedSsePayload(payload)).toEqual({
      type: 'skill.suggested',
      sessionId: 'session-1',
      spaceId: 'space-1',
      title: 'Use fast path',
      summary: 'Prefer fast path for batch mode.',
      sourceTaskId: 'task-1',
      timestamp: 1715000000000,
    })
  })

  it('suppresses immediate duplicate broadcasts', () => {
    const broadcaster = createSpaceEventBroadcaster()
    const events: unknown[] = []
    broadcaster.subscribe((event) => events.push(event))
    const payload = {
      draft: {
        draftId: 'draft-1',
        slug: 'test-skill',
        title: 'Use fast path',
        markdown: '# Use fast path\n\nPrefer fast path for batch mode.',
        taskId: 'task-1',
      },
      toolNames: ['shell'],
    }

    const first = broadcaster.broadcastSkillSuggested(payload, 1000)
    const second = broadcaster.broadcastSkillSuggested(payload, 1500)
    const third = broadcaster.broadcastSkillSuggested(payload, 3000)

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(third).toBe(true)
    expect(events).toHaveLength(2)
  })

  it('bridges runtime bus skill.suggested into broadcaster', () => {
    const bus = new TypedEventBus<KyberEvents>()
    const broadcaster = createSpaceEventBroadcaster()
    const events: unknown[] = []
    broadcaster.subscribe((event) => events.push(event))

    const detach = attachSkillSuggestedRuntimeBridge(bus, broadcaster)
    bus.emit('skill.suggested', {
      draft: {
        draftId: 'draft-1',
        slug: 'test-skill',
        title: 'Use fast path',
        markdown: '# Use fast path\n\nPrefer fast path for batch mode.',
        taskId: 'task-1',
      },
      toolNames: ['shell'],
    })
    detach()

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'skill.suggested',
      title: 'Use fast path',
      sourceTaskId: 'task-1',
    })
  })
})
