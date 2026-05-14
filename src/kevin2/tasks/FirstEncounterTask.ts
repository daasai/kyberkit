/**
 * FirstEncounterTask — Phase 1 骨架
 *
 * 执行顺序（5 stages）：
 *   scan → sample → analyze → generate_cognition → persist
 *
 * Phase 1：确定性阶段（scan/sample/persist）已实现；LLM 阶段（analyze /
 * generate_cognition）返回 mock 输出。Phase 2 接入 AgentLoop 后替换。
 *
 * 触发方式：Rust task_dispatch('first_encounter', payload) 目前直接在 Rust
 * 线程执行；Phase 2 改为 sidecar HTTP 端点调用本模块。
 */

import type { Kevin2TaskManager } from '../TaskManager.js'

export interface FirstEncounterPayload {
  taskId: string
  spaceId: string
  directoryPath: string
}

export interface DirectoryCognition {
  projectType: string
  projectSummary: string
  keyFindings: string[]
  suggestions: string[]
  uncertainties: string[]
  scannedFiles: number
}

const STAGE_NAMES = ['scan', 'sample', 'analyze', 'generate_cognition', 'persist'] as const
type StageName = (typeof STAGE_NAMES)[number]

/**
 * 运行 FirstEncounterTask。
 * Phase 1 返回 mock DirectoryCognition；Phase 2 接入真实 LLM 分析。
 */
export async function runFirstEncounterTask(
  payload: FirstEncounterPayload,
  manager: Kevin2TaskManager,
): Promise<DirectoryCognition> {
  const { taskId, directoryPath } = payload

  const timeStage = async (idx: number, name: StageName, work: () => Promise<void>) => {
    const t0 = Date.now()
    manager.reportStageStarted(taskId, idx, name)
    await work()
    manager.reportStageCompleted(taskId, name, Date.now() - t0)
  }

  let scannedFiles = 0

  // Stage 0: scan — 遍历目录统计文件数
  await timeStage(0, 'scan', async () => {
    scannedFiles = await countFilesAsync(directoryPath, 5)
  })

  // Stage 1: sample — 抽样 README / spec 文件（Phase 1: 占位）
  await timeStage(1, 'sample', async () => {
    // Phase 2: 读取 README、主要 spec 文件内容
  })

  // Stage 2: analyze — LLM 分析（Phase 1: mock）
  await timeStage(2, 'analyze', async () => {
    // Phase 2: agentDeps.agentLoop.run(prompt, tools: [read_file, list_directory])
  })

  // Stage 3: generate_cognition — 结构化输出（Phase 1: mock）
  let cognition: DirectoryCognition
  await timeStage(3, 'generate_cognition', async () => {
    cognition = buildMockCognition(directoryPath, scannedFiles)
  })

  // Stage 4: persist — 写入 C2 资产（Phase 3 完整实现）
  await timeStage(4, 'persist', async () => {
    // Phase 3: 写入 directory_cognition 到 kevin2 资产表
  })

  return cognition!
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function countFilesAsync(dir: string, maxDepth: number): Promise<number> {
  if (!dir || maxDepth <= 0) return 0
  let count = 0
  try {
    const { readdir, stat } = await import('node:fs/promises')
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const full = `${dir}/${e.name}`
      if (e.isFile()) {
        count++
      } else if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        count += await countFilesAsync(full, maxDepth - 1)
      }
    }
  } catch {
    // permission error or path not found — skip silently
  }
  return count
}

function inferProjectType(path: string): string {
  const lower = path.toLowerCase()
  if (lower.includes('kevin') || lower.includes('prd') || lower.includes('spec')) {
    return '产品规范项目'
  }
  if (lower.includes('data') || lower.includes('analytics') || lower.includes('metric')) {
    return '数据分析项目'
  }
  if (lower.includes('content') || lower.includes('copy') || lower.includes('script')) {
    return '内容运营项目'
  }
  return '通用工作项目'
}

function buildMockCognition(directoryPath: string, scannedFiles: number): DirectoryCognition {
  return {
    projectType: inferProjectType(directoryPath),
    projectSummary: `已扫描 ${scannedFiles} 个文件，识别为 ${inferProjectType(directoryPath)}。Phase 2 将接入 LLM 生成详细认知。`,
    keyFindings: [
      `共扫描到 ${scannedFiles} 个文件`,
      '目录结构已建立索引，可开始生成制品',
    ],
    suggestions: [
      '查看材料库中已索引的文件',
      '开始与 Kevin 对话了解项目内容',
      '生成第一份 PRD 制品',
    ],
    uncertainties: [
      'LLM 深度分析将在 Phase 2 接入后提供',
    ],
    scannedFiles,
  }
}
