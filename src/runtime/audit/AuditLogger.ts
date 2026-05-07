/**
 * User 层审计 JSONL（PRD §10.3）— ~/.kyberkit/users/default/audit/YYYY-MM-DD.jsonl
 */

import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { userAuditDir } from '../paths/PathResolver.js'

export interface AuditEvent {
  ts: string
  userId: string
  spaceId?: string
  sessionId?: string
  taskId?: string
  skillName?: string
  actuatorId: string
  riskLevel: string
  targetSummary?: string
  decision: 'approved' | 'rejected' | 'timeout' | 'pending' | 'direct'
  signoffLatencyMs?: number
}

export function appendAudit(userId: string, event: Omit<AuditEvent, 'ts'>): void {
  const dir = userAuditDir(userId)
  mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  const file = join(dir, `${day}.jsonl`)
  const line: AuditEvent = { ...event, ts: new Date().toISOString() }
  appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf-8')
}
