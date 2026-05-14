import type { Kevin2TaskProfile, Kevin2TaskType } from '../types/kevin2-models.js'

const PROFILES: Record<Kevin2TaskType, Kevin2TaskProfile> = {
  first_encounter: {
    taskType: 'first_encounter',
    totalStages: 5,
    stageNames: ['scan', 'sample', 'analyze', 'generate_cognition', 'persist'],
    allowedTools: ['read_file', 'list_directory', 'search_files'],
    modelConfig: {
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.3,
      maxTokens: 4096,
    },
    systemPromptTemplate: (ctx) =>
      `Kevin first encounter. Directory: ${String(ctx.directoryPath ?? '')}`,
  },
  artifact_generation: {
    taskType: 'artifact_generation',
    totalStages: 5,
    stageNames: ['load_materials', 'generate_blocks', 'ground_evidence', 'validate_schema', 'persist_artifact'],
    allowedTools: ['read_file', 'search_materials', 'get_material_content'],
    modelConfig: {
      model: 'claude-3-7-sonnet-20250219',
      temperature: 0.4,
      maxTokens: 8192,
    },
    systemPromptTemplate: (ctx) => `Artifact generation for ${String(ctx.artifactType ?? '')}`,
  },
  review_diff: {
    taskType: 'review_diff',
    totalStages: 4,
    stageNames: ['load_artifact', 'generate_suggestions', 'present_diff', 'record_decisions'],
    allowedTools: ['read_file', 'get_artifact_block', 'get_material_content'],
    modelConfig: {
      model: 'claude-3-7-sonnet-20250219',
      temperature: 0.5,
      maxTokens: 4096,
    },
    systemPromptTemplate: (ctx) => `Review diff for ${String(ctx.blockType ?? '')}`,
  },
  external_projection: {
    taskType: 'external_projection',
    totalStages: 5,
    stageNames: [
      'render_preview',
      'create_action_request',
      'waiting_signoff',
      'write_to_connector',
      'write_audit',
    ],
    allowedTools: ['get_artifact_content', 'feishu_create_doc', 'feishu_write_content'],
    modelConfig: {
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.1,
      maxTokens: 2048,
    },
    systemPromptTemplate: () => 'External projection assistant.',
  },
  always_on_monitor: {
    taskType: 'always_on_monitor',
    totalStages: 3,
    stageNames: ['check_materials', 'diff_changes', 'push_notification'],
    allowedTools: ['list_directory', 'read_file', 'check_file_modified'],
    modelConfig: {
      model: 'claude-3-5-haiku-20241022',
      temperature: 0.2,
      maxTokens: 1024,
    },
    systemPromptTemplate: (ctx) => `Monitor space ${String(ctx.spaceId ?? '')}`,
  },
}

export class Kevin2TaskProfileRegistry {
  get(taskType: Kevin2TaskType): Kevin2TaskProfile {
    const profile = PROFILES[taskType]
    if (!profile) {
      throw new Error(`Unknown Kevin2 task type: ${taskType}`)
    }
    return profile
  }

  list(): Kevin2TaskProfile[] {
    return Object.values(PROFILES)
  }
}
