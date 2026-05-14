export interface EvidenceRef {
  materialId: string
  excerpt: string
  confidence: number
}

export type Kevin2TaskType =
  | 'first_encounter'
  | 'artifact_generation'
  | 'review_diff'
  | 'external_projection'
  | 'always_on_monitor'

export interface Kevin2TaskProfile {
  taskType: Kevin2TaskType
  totalStages: number
  stageNames: string[]
  allowedTools: string[]
  modelConfig: {
    model: string
    temperature: number
    maxTokens: number
  }
  systemPromptTemplate: (ctx: Record<string, unknown>) => string
}
