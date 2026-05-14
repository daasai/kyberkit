import type { TypedEventBus } from '../events/EventBus.js'
import type { KyberEvents } from '../types/events.js'
import type { Kevin2Events } from '../types/kevin2-events.js'

type AnyEvents = KyberEvents & Kevin2Events

export class TaskObservabilityBridge {
  private recentEvents: Array<{ type: string; payload: unknown; timestamp: number }> = []
  private readonly maxRecent = 50

  constructor(
    private eventBus: TypedEventBus<AnyEvents>,
    private tauriEmit: (event: string, payload: unknown) => void,
  ) {
    this.subscribe()
  }

  private subscribe(): void {
    this.eventBus.on('kevin2.task.stage_started', (e) => {
      this.record('kevin2.task.stage_started', e)
      this.tauriEmit('kevin2://task/stage', { ...e, status: 'started' })
    })

    this.eventBus.on('kevin2.task.stage_completed', (e) => {
      this.record('kevin2.task.stage_completed', e)
      this.tauriEmit('kevin2://task/stage', { ...e, status: 'completed' })
    })

    this.eventBus.on('kevin2.task.stage_failed', (e) => {
      this.record('kevin2.task.stage_failed', e)
      this.tauriEmit('kevin2://task/stage', { ...e, status: 'failed' })
    })

    this.eventBus.on('kevin2.task.waiting_signoff', (e) => {
      this.record('kevin2.task.waiting_signoff', e)
      this.tauriEmit('kevin2://signoff/required', e)
    })

    this.eventBus.on('kevin2.artifact.block_ready', (e) => {
      this.tauriEmit('kevin2://artifact/block', e)
    })

    this.eventBus.on('kevin2.material_changed', (e) => {
      this.record('kevin2.material_changed', e)
      this.tauriEmit('kevin2://workspace/material-changed', e)
    })

    this.eventBus.on('kevin2.audit.event', (e) => {
      this.record('kevin2.audit.event', e)
    })
  }

  private record(type: string, payload: unknown): void {
    this.recentEvents.push({ type, payload, timestamp: Date.now() })
    if (this.recentEvents.length > this.maxRecent) {
      this.recentEvents.shift()
    }
  }

  getRecentEvents(limit = 10) {
    return this.recentEvents.slice(-limit)
  }
}
