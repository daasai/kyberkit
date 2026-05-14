import type { EvidenceRef, Kevin2TaskType } from './kevin2-models.js'

export type Kevin2Events = {
  'kevin2.task.stage_started': {
    taskId: string
    taskType: Kevin2TaskType
    stageIndex: number
    stageName: string
    timestamp: number
  }
  'kevin2.task.stage_completed': {
    taskId: string
    taskType: Kevin2TaskType
    stageName: string
    durationMs: number
    timestamp: number
  }
  'kevin2.task.stage_failed': {
    taskId: string
    taskType: Kevin2TaskType
    stageName: string
    error: string
    timestamp: number
  }
  'kevin2.task.waiting_signoff': {
    taskId: string
    actionRequestId: string
    riskLevel: 'low' | 'medium' | 'high'
    preview: string
    timestamp: number
  }
  'kevin2.artifact.block_ready': {
    taskId: string
    artifactId: string
    blockIndex: number
    blockType: string
    content: string
    evidenceRefs: EvidenceRef[]
    timestamp: number
  }
  'kevin2.audit.event': {
    eventType: string
    subjectId: string
    spaceId: string
    metadata: Record<string, unknown>
    timestamp: number
  }
  'kevin2.material_changed': {
    materialId: string
    changeType: 'added' | 'updated' | 'removed'
    spaceId: string
    affectedArtifacts: string[]
    timestamp: number
  }
}
