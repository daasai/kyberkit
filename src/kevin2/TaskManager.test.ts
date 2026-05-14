import { describe, it, expect, beforeEach } from 'bun:test'
import { TypedEventBus } from '../events/EventBus.js'
import type { KyberEvents } from '../types/events.js'
import type { Kevin2Events } from '../types/kevin2-events.js'
import { Kevin2TaskManager } from './TaskManager.js'

describe('Kevin2TaskManager', () => {
  let eventBus: TypedEventBus<KyberEvents & Kevin2Events>
  let manager: Kevin2TaskManager

  beforeEach(() => {
    eventBus = new TypedEventBus()
    manager = new Kevin2TaskManager(eventBus)
  })

  it('enqueue returns a taskId', () => {
    const id = manager.enqueue('first_encounter', { spaceId: 's1', directoryPath: '/tmp' })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('getStatus returns queued for new task', () => {
    const id = manager.enqueue('review_diff', { artifactId: 'a1' })
    const status = manager.getStatus(id)
    expect(status?.status).toBe('queued')
  })

  it('cancel sets status to cancelled', () => {
    const id = manager.enqueue('first_encounter', { spaceId: 's1' })
    manager.cancel(id)
    expect(manager.getStatus(id)?.status).toBe('cancelled')
  })

  it('emits stage event when stage is reported', () => {
    let last: unknown
    eventBus.on('kevin2.task.stage_started', (e) => {
      last = e
    })
    const id = manager.enqueue('first_encounter', { spaceId: 's1' })
    manager.reportStageStarted(id, 0, 'scan')
    expect(last).toBeDefined()
    const payload = last as { taskId: string; stageName: string }
    expect(payload.taskId).toBe(id)
    expect(payload.stageName).toBe('scan')
  })

  it('listActive returns only running/queued tasks', () => {
    const id1 = manager.enqueue('first_encounter', { spaceId: 's1' })
    const id2 = manager.enqueue('review_diff', { artifactId: 'a1' })
    manager.cancel(id2)
    const active = manager.listActive()
    expect(active.some((t) => t.taskId === id1)).toBe(true)
    expect(active.some((t) => t.taskId === id2)).toBe(false)
  })
})
