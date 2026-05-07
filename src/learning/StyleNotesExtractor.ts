/**
 * LearningLoop Layer 1 — 从「模型原始输出 vs 用户编辑版」提炼偏好（PRD §13）。
 * v1.5：最小骨架；后续接入 Artifact 编辑器 diff 与会话记忆拼接。
 */

export interface StyleNotesChunk {
  summary: string
  tags: string[]
}

export function extractStyleNotesFromDiff(original: string, edited: string): StyleNotesChunk | null {
  const o = original.trim()
  const e = edited.trim()
  if (!e || o === e) return null
  return {
    summary: `User prefers edits differing from model output (${Math.min(o.length, e.length)} chars compared).`,
    tags: ['style-diff'],
  }
}
