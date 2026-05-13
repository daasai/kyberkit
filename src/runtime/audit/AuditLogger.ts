/**
 * Kevin v1.5 — HITL Sign-off audit log (Sprint C / S-7).
 *
 * Per the MVP-RC plan §4 Sprint C, the audit jsonl path collapses from
 * `~/.kyberkit/users/<id>/audit/` to `${KEVIN_NODE_ROOT}/audit/YYYY-MM-DD.jsonl`
 * to align with Rev3's per-node storage layout. The legacy User-tier helper
 * (`appendUserAudit`) is retained for callers that still need it.
 */

import { appendFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { kevinNodeRoot, userAuditDir } from '../paths/PathResolver.js'

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

export function kevinAuditDir(): string {
  return join(kevinNodeRoot(), 'audit')
}

export function kevinAuditPathForDate(day: string): string {
  return join(kevinAuditDir(), `${day}.jsonl`)
}

/**
 * Append an audit record to the Kevin-node audit log (Rev3 path).
 */
export function appendAudit(event: Omit<AuditEvent, 'ts'>): AuditEvent {
  const dir = kevinAuditDir()
  mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  const file = kevinAuditPathForDate(day)
  const line: AuditEvent = { ...event, ts: new Date().toISOString() }
  appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf-8')
  return line
}

/**
 * @deprecated Sprint C — use {@link appendAudit}.
 * Legacy User-tier path: `~/.kyberkit/users/<id>/audit/YYYY-MM-DD.jsonl`.
 * Retained for callers that still write per-user audit (e.g. CLI scenarios).
 */
export function appendUserAudit(userId: string, event: Omit<AuditEvent, 'ts'>): void {
  const dir = userAuditDir(userId)
  mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  const file = join(dir, `${day}.jsonl`)
  const line: AuditEvent = { ...event, ts: new Date().toISOString() }
  appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf-8')
}
