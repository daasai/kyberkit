/**
 * Async task lifecycle (Kevin v1.5) — persisted + space-scoped SSE.
 */

import { randomUUID } from 'crypto'
import {
  dbInsertTask,
  dbUpdateTaskState,
  dbGetTask,
  dbListTasks,
  dbDeleteTask,
  type TaskRow,
  type TaskState,
} from './db.js'
import { broadcastSpaceEvent } from './spaceEventBroadcast.js'

const TERMINAL_STATES: ReadonlySet<TaskState> = new Set(['completed', 'cancelled', 'failed'])
const ALLOWED_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  queued: ['running', 'cancelled', 'failed'],
  running: ['awaiting-signoff', 'completed', 'cancelled', 'failed'],
  'awaiting-signoff': ['completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
}

export class TaskManager {
  constructor(
    private readonly hooks: {
      onSignoffQueued?: (task: TaskRow) => void
    } = {},
    private readonly signoffQueueDelayMs: number = 60_000,
  ) {}

  /** Task id -> timer handles. */
  private timers = new Map<string, Set<ReturnType<typeof setTimeout>>>()

  createTask(
    spaceId: string,
    opts: {
      skill_name?: string
      trigger_kind?: string
      payload?: unknown
    } = {},
  ): TaskRow {
    const id = randomUUID()
    const now = new Date().toISOString()
    const row: TaskRow = {
      id,
      space_id: spaceId,
      state: 'queued',
      skill_name: opts.skill_name ?? null,
      trigger_kind: opts.trigger_kind ?? 'manual',
      payload: opts.payload !== undefined ? JSON.stringify(opts.payload) : null,
      progress: 0,
      message: null,
      created_at: now,
      updated_at: now,
    }
    dbInsertTask(row)
    broadcastSpaceEvent(spaceId, { type: 'task_progress', space_id: spaceId, task: this.serialize(row) })
    this.scheduleDemoProgress(id, spaceId)
    return row
  }

  private isTerminal(state: TaskState): boolean {
    return TERMINAL_STATES.has(state)
  }

  private addTimer(taskId: string, timer: ReturnType<typeof setTimeout>): void {
    const set = this.timers.get(taskId) ?? new Set<ReturnType<typeof setTimeout>>()
    set.add(timer)
    this.timers.set(taskId, set)
  }

  private clearTaskTimers(taskId: string): void {
    const set = this.timers.get(taskId)
    if (!set) return
    for (const h of set) {
      clearTimeout(h)
    }
    this.timers.delete(taskId)
  }

  private transition(
    taskId: string,
    nextState: TaskState,
    patch: Partial<Pick<TaskRow, 'progress' | 'message'>> = {},
  ): TaskRow | null {
    const cur = dbGetTask(taskId)
    if (!cur) return null
    if (cur.state === nextState) return cur
    if (this.isTerminal(cur.state)) return cur
    if (!ALLOWED_TRANSITIONS[cur.state].includes(nextState)) return null

    dbUpdateTaskState(taskId, { state: nextState, ...patch })
    const next = dbGetTask(taskId)
    if (!next) return null
    if (this.isTerminal(next.state)) this.clearTaskTimers(taskId)
    return next
  }

  private serialize(t: TaskRow) {
    return {
      id: t.id,
      space_id: t.space_id,
      state: t.state,
      skill_name: t.skill_name,
      trigger_kind: t.trigger_kind,
      payload: t.payload,
      progress: t.progress,
      message: t.message,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }
  }

  /** Moves queued → running → completed with synthetic progress (placeholder runner). */
  private scheduleDemoProgress(taskId: string, spaceId: string): void {
    const h1 = setTimeout(() => {
      const tr1 = this.transition(taskId, 'running', {
        progress: 0.25,
        message: 'Starting...',
      })
      if (!tr1 || tr1.space_id !== spaceId || tr1.state !== 'running') return
      broadcastSpaceEvent(spaceId, {
        type: 'task_progress',
        space_id: spaceId,
        task: this.serialize(tr1),
      })

      const h2 = setTimeout(() => {
        const tr2 = this.transition(taskId, 'running', {
          progress: 0.72,
          message: 'Working...',
        })
        if (!tr2 || tr2.space_id !== spaceId || tr2.state !== 'running') return
        broadcastSpaceEvent(spaceId, {
          type: 'task_progress',
          space_id: spaceId,
          task: this.serialize(tr2),
        })

        const h3 = setTimeout(() => {
          const tr3 = this.transition(taskId, 'completed', {
            progress: 1,
            message: 'Done',
          })
          if (!tr3 || tr3.space_id !== spaceId || tr3.state !== 'completed') return
          broadcastSpaceEvent(spaceId, {
            type: 'task_completed',
            space_id: spaceId,
            task: this.serialize(tr3),
          })
        }, 900)
        this.addTimer(taskId, h3)
      }, 700)
      this.addTimer(taskId, h2)
    }, 350)
    this.addTimer(taskId, h1)
  }

  list(spaceId: string): TaskRow[] {
    return dbListTasks(spaceId)
  }

  get(id: string): TaskRow | null {
    return dbGetTask(id)
  }

  getInSpace(id: string, spaceId: string): TaskRow | null {
    const row = dbGetTask(id)
    if (!row || row.space_id !== spaceId) return null
    return row
  }

  setState(id: string, state: TaskState, patch?: Partial<Pick<TaskRow, 'progress' | 'message'>>): void {
    const row = dbGetTask(id)
    if (!row) return
    const tr = this.transition(id, state, patch)
    if (tr) {
      broadcastSpaceEvent(row.space_id, {
        type: 'task_progress',
        space_id: row.space_id,
        task: this.serialize(tr),
      })
    }
  }

  /**
   * Task stuck in `awaiting-signoff` until `resolveSignoff` (medium-risk actuators).
   */
  createSignoffTask(
    spaceId: string,
    opts: { skill_name?: string; payload?: unknown } = {},
  ): TaskRow {
    const id = randomUUID()
    const now = new Date().toISOString()
    const row: TaskRow = {
      id,
      space_id: spaceId,
      state: 'running',
      skill_name: opts.skill_name ?? 'artifact.feishu-doc.write',
      trigger_kind: 'actuator',
      payload: opts.payload !== undefined ? JSON.stringify(opts.payload) : null,
      progress: 0.35,
      message: 'Running actuator (pending sign-off window)',
      created_at: now,
      updated_at: now,
    }
    dbInsertTask(row)
    broadcastSpaceEvent(spaceId, { type: 'task_progress', space_id: spaceId, task: this.serialize(row) })

    const waitHandle = setTimeout(() => {
      const queued = this.transition(id, 'awaiting-signoff', {
        progress: 0.5,
        message: 'Waiting for sign-off',
      })
      if (!queued) return
      broadcastSpaceEvent(spaceId, {
        type: 'task_progress',
        space_id: spaceId,
        task: this.serialize(queued),
      })
      broadcastSpaceEvent(spaceId, { type: 'signoff_required', space_id: spaceId, task_id: id })
      this.hooks.onSignoffQueued?.(queued)
    }, this.signoffQueueDelayMs)
    this.addTimer(id, waitHandle)
    return row
  }

  resolveSignoff(taskId: string, approved: boolean): TaskRow | null {
    const row = dbGetTask(taskId)
    if (!row) return null

    // Idempotent behavior: resolving terminal tasks has no side effects.
    if (this.isTerminal(row.state)) return row
    if (row.state !== 'awaiting-signoff' && row.state !== 'running') return null

    const tr = this.transition(
      taskId,
      approved ? 'completed' : 'cancelled',
      approved
        ? { progress: 1, message: 'Signed off' }
        : { progress: 0, message: 'Sign-off rejected' },
    )
    if (tr) {
      broadcastSpaceEvent(row.space_id, {
        type: approved ? 'task_completed' : 'task_cancelled',
        space_id: row.space_id,
        task: this.serialize(tr),
      })
    }
    return tr
  }

  cancel(id: string): boolean {
    const row = dbGetTask(id)
    if (!row || row.state === 'completed' || row.state === 'cancelled') return false
    const tr = this.transition(id, 'cancelled', { message: 'Cancelled', progress: 0 })
    if (!tr) return false
    broadcastSpaceEvent(row.space_id, {
      type: 'task_cancelled',
      space_id: row.space_id,
      task_id: id,
    })
    return true
  }

  delete(id: string): void {
    dbDeleteTask(id)
  }
}
