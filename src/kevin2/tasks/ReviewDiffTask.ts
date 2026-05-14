/**
 * ReviewDiffTask — Phase 1 骨架
 *
 * 执行顺序（4 stages）：
 *   load_artifact → generate_suggestions → present_diff → record_decisions
 *
 * Phase 1：返回 mock 建议列表；Phase 2：接入 LLM diff 生成。
 */

import type { Kevin2TaskManager } from '../TaskManager.js'

export interface DiffSuggestion {
  id: string
  blockId: string
  blockType: string
  original: string
  suggestion: string
  type: 'must_fix' | 'suggestion'
  evidenceRefs: Array<{ materialId: string; excerpt: string; confidence: number }>
}

export interface ReviewDiffPayload {
  taskId: string
  spaceId: string
  artifactId: string
}

export interface ReviewDiffResult {
  artifactId: string
  suggestions: DiffSuggestion[]
  acceptedCount: number
  rejectedCount: number
}

export async function runReviewDiffTask(
  payload: ReviewDiffPayload,
  manager: Kevin2TaskManager,
): Promise<ReviewDiffResult> {
  const { taskId, artifactId } = payload

  let t = Date.now()
  manager.reportStageStarted(taskId, 0, 'load_artifact')
  await delay(200)
  manager.reportStageCompleted(taskId, 'load_artifact', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 1, 'generate_suggestions')
  await delay(400)
  const suggestions: DiffSuggestion[] = [
    {
      id: crypto.randomUUID(),
      blockId: '',
      blockType: 'problem',
      original: '用户在多平台协作中面临信息孤岛问题，导致决策延迟与重复劳动。',
      suggestion:
        '用户在多工具协作环境中面临信息孤岛与上下文碎片化问题，直接导致决策周期拉长（平均+2天）和无效重复劳动（约30%时间损耗）。',
      type: 'must_fix',
      evidenceRefs: [
        { materialId: 'mock-material-1', excerpt: '访谈数据显示决策延迟平均2天', confidence: 0.91 },
      ],
    },
    {
      id: crypto.randomUUID(),
      blockId: '',
      blockType: 'goals',
      original: '减少 30% 的跨工具切换成本；提升产出文档的证据可追溯率至 90%+。',
      suggestion:
        '核心目标一：减少跨工具切换成本 ≥30%（基准：用户日均切换 8.2 次）。核心目标二：产出文档证据可追溯率 ≥90%，支持 CMP/OKR review 直接引用。',
      type: 'suggestion',
      evidenceRefs: [],
    },
  ]
  manager.reportStageCompleted(taskId, 'generate_suggestions', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 2, 'present_diff')
  await delay(100)
  manager.reportStageCompleted(taskId, 'present_diff', Date.now() - t)

  t = Date.now()
  manager.reportStageStarted(taskId, 3, 'record_decisions')
  await delay(100)
  manager.reportStageCompleted(taskId, 'record_decisions', Date.now() - t)

  return {
    artifactId,
    suggestions,
    acceptedCount: 0,
    rejectedCount: 0,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms))
}
