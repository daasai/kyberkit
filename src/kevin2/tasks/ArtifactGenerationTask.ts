/**
 * ArtifactGenerationTask — Phase 1 骨架
 *
 * 执行顺序（5 stages）：
 *   load_materials → generate_blocks → ground_evidence → validate_schema → persist_artifact
 *
 * Phase 1：确定性流程已实现，返回 mock 块内容。
 * Phase 2：接入 AgentLoop + LLM 生成真实内容。
 */

import type { Kevin2TaskManager } from '../TaskManager.js'

export interface ArtifactGenerationPayload {
  taskId: string
  spaceId: string
  artifactType: 'prd' | 'weekly_ops_review'
  title: string
  materialIds: string[]
}

export interface GeneratedArtifact {
  id: string
  spaceId: string
  artifactType: string
  title: string
  blocks: GeneratedBlock[]
  createdAt: number
}

export interface GeneratedBlock {
  id: string
  blockType: string
  content: string
  evidenceRefs: Array<{ materialId: string; excerpt: string; confidence: number }>
  reviewState: 'pending'
}

const STAGE_NAMES = [
  'load_materials',
  'generate_blocks',
  'ground_evidence',
  'validate_schema',
  'persist_artifact',
] as const

type StageName = (typeof STAGE_NAMES)[number]

const REQUIRED_BLOCKS: Record<string, string[]> = {
  prd: ['problem', 'users', 'goals', 'features', 'risks'],
  weekly_ops_review: ['metric_snapshot', 'key_findings', 'action_plan'],
}

export async function runArtifactGenerationTask(
  payload: ArtifactGenerationPayload,
  manager: Kevin2TaskManager,
): Promise<GeneratedArtifact> {
  const { taskId, spaceId, artifactType, title, materialIds } = payload

  const timeStage = async (idx: number, name: StageName, work: () => Promise<void>) => {
    const t0 = Date.now()
    manager.reportStageStarted(taskId, idx, name)
    await work()
    manager.reportStageCompleted(taskId, name, Date.now() - t0)
  }

  // Stage 0: load_materials
  await timeStage(0, 'load_materials', async () => {
    await delay(300)
    // Phase 2: fetch material content from library via IPC
  })

  // Stage 1: generate_blocks — emit one block at a time for streaming UI
  const blocks: GeneratedBlock[] = []
  await timeStage(1, 'generate_blocks', async () => {
    const requiredBlocks = REQUIRED_BLOCKS[artifactType] ?? ['content']
    const pendingArtifactId = `pending-${spaceId}`
    let blockIndex = 0
    for (const blockType of requiredBlocks) {
      await delay(250)
      const block = buildMockBlock(blockType, materialIds)
      blocks.push(block)
      // Emit per-block event for streaming UI
      // TODO: Phase 2 — wire via Tauri AppHandle to emit 'kevin2://artifact/block' to frontend
      manager.reportBlockReady(
        taskId,
        pendingArtifactId,
        blockIndex++,
        block.blockType,
        block.content,
        block.evidenceRefs,
      )
    }
  })

  // Stage 2: ground_evidence
  await timeStage(2, 'ground_evidence', async () => {
    await delay(200)
    // Phase 2: cross-reference blocks with material excerpts
  })

  // Stage 3: validate_schema
  await timeStage(3, 'validate_schema', async () => {
    await delay(100)
    // Phase 2: validate all required block types are present and well-formed
  })

  // Stage 4: persist_artifact
  let artifact!: GeneratedArtifact
  await timeStage(4, 'persist_artifact', async () => {
    await delay(150)
    artifact = {
      id: crypto.randomUUID(),
      spaceId,
      artifactType,
      title,
      blocks,
      createdAt: Date.now(),
    }
    // Phase 3: persist to kevin2 artifact table via Rust IPC
  })

  return artifact
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildMockBlock(blockType: string, materialIds: string[]): GeneratedBlock {
  const contentMap: Record<string, string> = {
    problem: '用户在多平台协作中面临信息孤岛问题，导致决策延迟与重复劳动。',
    users: '产品经理、设计师、数据分析师——需要跨工具整合上下文的知识工作者。',
    goals: '减少 30% 的跨工具切换成本；提升产出文档的证据可追溯率至 90%+。',
    features: 'Kevin 工作区：材料库挂载、AI 对话生成、制品结构化输出、飞书投影。',
    risks: '外部 API 限速、材料质量参差不齐、LLM 幻觉需人工 Review 把关。',
    metric_snapshot: 'DAU WoW +4.2%；留存 D7 62%；核心任务完成率 78%（本周数仓）。',
    key_findings: '增长主要来自 PRD 生成功能；留存与功能深度使用正相关。',
    action_plan: '下周重点：优化 Composer 体验、补充 Evidence grounding 精度测试。',
    content: '制品内容（占位，Phase 2 接入 LLM 生成）。',
  }
  return {
    id: crypto.randomUUID(),
    blockType,
    content: contentMap[blockType] ?? `${blockType} block（占位）`,
    evidenceRefs: materialIds.slice(0, 1).map((mid) => ({
      materialId: mid,
      excerpt: '…相关原文摘录（Phase 2 实装）…',
      confidence: 0.82,
    })),
    reviewState: 'pending' as const,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms))
}
