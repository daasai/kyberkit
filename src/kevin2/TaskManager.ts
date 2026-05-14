import { TypedEventBus } from '../events/EventBus.js'
import type { KyberEvents } from '../types/events.js'
import type { Kevin2Events } from '../types/kevin2-events.js'
import type { EvidenceRef, Kevin2TaskType } from '../types/kevin2-models.js'
import { Kevin2TaskProfileRegistry } from './TaskProfileRegistry.js'

type AnyEvents = KyberEvents & Kevin2Events

export interface ManagedTask {
  taskId: string
  taskType: Kevin2TaskType
  status: 'queued' | 'running' | 'waiting_signoff' | 'completed' | 'failed' | 'cancelled'
  currentStage: string | null
  stageIndex: number
  totalStages: number
  payload: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export class Kevin2TaskManager {
  private tasks = new Map<string, ManagedTask>()
  private registry = new Kevin2TaskProfileRegistry()

  constructor(private eventBus: TypedEventBus<AnyEvents>) {}

  enqueue(taskType: Kevin2TaskType, payload: Record<string, unknown>): string {
    const profile = this.registry.get(taskType)
    const taskId = crypto.randomUUID()
    const now = Date.now()
    const task: ManagedTask = {
      taskId,
      taskType,
      status: 'queued',
      currentStage: null,
      stageIndex: 0,
      totalStages: profile.totalStages,
      payload,
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(taskId, task)
    return taskId
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task && task.status !== 'completed' && task.status !== 'failed') {
      task.status = 'cancelled'
      task.updatedAt = Date.now()
    }
  }

  getStatus(taskId: string): ManagedTask | undefined {
    return this.tasks.get(taskId)
  }

  listActive(): ManagedTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === 'queued' || t.status === 'running' || t.status === 'waiting_signoff',
    )
  }

  reportStageStarted(taskId: string, stageIndex: number, stageName: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = 'running'
    task.currentStage = stageName
    task.stageIndex = stageIndex
    task.updatedAt = Date.now()
    this.eventBus.emit('kevin2.task.stage_started', {
      taskId,
      taskType: task.taskType,
      stageIndex,
      stageName,
      timestamp: Date.now(),
    })
  }

  reportStageCompleted(taskId: string, stageName: string, durationMs: number): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.updatedAt = Date.now()
    this.eventBus.emit('kevin2.task.stage_completed', {
      taskId,
      taskType: task.taskType,
      stageName,
      durationMs,
      timestamp: Date.now(),
    })
    if (task.stageIndex >= task.totalStages - 1) {
      task.status = 'completed'
    }
  }

  reportStageFailed(taskId: string, stageName: string, error: string): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = 'failed'
    task.updatedAt = Date.now()
    this.eventBus.emit('kevin2.task.stage_failed', {
      taskId,
      taskType: task.taskType,
      stageName,
      error,
      timestamp: Date.now(),
    })
  }

  reportWaitingSignoff(
    taskId: string,
    actionRequestId: string,
    riskLevel: 'low' | 'medium' | 'high',
    preview: string,
  ): void {
    const task = this.tasks.get(taskId)
    if (!task) return
    task.status = 'waiting_signoff'
    task.updatedAt = Date.now()
    this.eventBus.emit('kevin2.task.waiting_signoff', {
      taskId,
      actionRequestId,
      riskLevel,
      preview,
      timestamp: Date.now(),
    })
  }

  reportBlockReady(
    taskId: string,
    artifactId: string,
    blockIndex: number,
    blockType: string,
    content: string,
    evidenceRefs: EvidenceRef[],
  ): void {
    this.eventBus.emit('kevin2.artifact.block_ready', {
      taskId,
      artifactId,
      blockIndex,
      blockType,
      content,
      evidenceRefs,
      timestamp: Date.now(),
    })
  }
}
