import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appendAudit, kevinAuditDir, kevinAuditPathForDate } from './AuditLogger.js'

let tempRoot: string

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'kyber-audit-'))
  process.env.KEVIN_NODE_ROOT = tempRoot
})

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
  delete process.env.KEVIN_NODE_ROOT
})

describe('AuditLogger — Rev3 path under ${KEVIN_NODE_ROOT}/audit', () => {
  it('writes jsonl line under ${KEVIN_NODE_ROOT}/audit/<YYYY-MM-DD>.jsonl', () => {
    expect(kevinAuditDir()).toBe(join(tempRoot, 'audit'))
    appendAudit({
      userId: 'default',
      spaceId: 'space-1',
      sessionId: 'sess-1',
      taskId: 'task-1',
      skillName: 'feishu-write',
      actuatorId: 'artifact.feishu-doc.write',
      riskLevel: 'medium',
      decision: 'approved',
      signoffLatencyMs: 4231,
    })
    const today = new Date().toISOString().slice(0, 10)
    const file = kevinAuditPathForDate(today)
    expect(existsSync(file)).toBe(true)
    const lines = readFileSync(file, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0])
    expect(parsed.actuatorId).toBe('artifact.feishu-doc.write')
    expect(parsed.decision).toBe('approved')
    expect(parsed.signoffLatencyMs).toBe(4231)
    expect(typeof parsed.ts).toBe('string')
  })

  it('appends multiple events to the same daily file', () => {
    appendAudit({
      userId: 'default',
      actuatorId: 'a1',
      riskLevel: 'medium',
      decision: 'pending',
    })
    appendAudit({
      userId: 'default',
      actuatorId: 'a2',
      riskLevel: 'medium',
      decision: 'timeout',
    })
    const today = new Date().toISOString().slice(0, 10)
    const lines = readFileSync(kevinAuditPathForDate(today), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).actuatorId).toBe('a1')
    expect(JSON.parse(lines[1]).decision).toBe('timeout')
  })

  it('creates the audit directory on demand', () => {
    expect(existsSync(kevinAuditDir())).toBe(false)
    appendAudit({
      userId: 'default',
      actuatorId: 'first-write',
      riskLevel: 'medium',
      decision: 'direct',
    })
    expect(existsSync(kevinAuditDir())).toBe(true)
  })
})
