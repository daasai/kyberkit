/**
 * Kevin v1.5 MVP-RC — End-to-end acceptance (Sprint E / S-12).
 *
 * Drives the MVP-RC core narrative through the in-process module surface
 * (no live HTTP server) so it runs in any Bun environment:
 *
 *   1. Bootstrap a Space + Library binding under a temp KEVIN_NODE_ROOT.
 *   2. Forge a Skill from an explicit user trigger and verify it lands in Space tier.
 *   3. Append a LearningLoop style note and confirm L2 composition includes it.
 *   4. Register a cron-bearing Skill, sync the scheduler, fire a tick, see a task.
 *   5. Open a Sign-off task, resolve it, verify TaskManager + audit JSONL.
 *   6. Aggregate the resulting task list through the Notification rules.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

import {
  ensureKevinLayout,
  ensureSpaceTier,
  ensureTierLayout,
  libraryTechRoot,
  spaceSkillsDir,
  upsertSpaceLibraryBinding,
} from '../src/runtime/paths/PathResolver.js'
import {
  appendAudit,
  kevinAuditDir,
  kevinAuditPathForDate,
} from '../src/runtime/audit/AuditLogger.js'

import { acceptForgeDraft, suggestForgeDraft } from './SkillForge'
import { scanSkillsForSpace, loadSkillFull } from './SkillScanner'
import {
  appendStyleNote,
  composeSkillBody,
  loadStyleNotes,
} from './SkillLearningLoop'
import { CronScheduler } from './CronScheduler'
import { syncCronForSpace, makeCronOnTrigger } from './cronBridge'
import { TaskManager } from './TaskManager'
import { previewFeishuDocDiff, runFeishuDocWriteMock } from './actuators/feishuDocWrite'
import {
  aggregateNotifications,
  type RawTaskRow,
} from '../app/src/lib/notificationAggregation'

let tempHome: string
let nodeRoot: string
let spaceId: string
let libraryId: string

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'kyber-e2e-mvp-rc-'))
  nodeRoot = join(tempHome, 'node')
  process.env.KYBER_HOME = tempHome
  process.env.KEVIN_NODE_ROOT = nodeRoot
  mkdirSync(nodeRoot, { recursive: true })
  ensureKevinLayout()
  ensureTierLayout('default')

  spaceId = randomUUID()
  libraryId = randomUUID()
  ensureSpaceTier(spaceId)
  mkdirSync(libraryTechRoot(libraryId), { recursive: true })
  upsertSpaceLibraryBinding({ spaceId, libraryId, mountPath: tempHome, displayName: 'E2E Library' })
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  delete process.env.KYBER_HOME
  delete process.env.KEVIN_NODE_ROOT
})

describe('Kevin v1.5 MVP-RC end-to-end acceptance', () => {
  it('runs the full forge → cron → sign-off → audit → notification pipeline', () => {
    // (1) Forge — explicit trigger detected
    const draft = suggestForgeDraft({ message: '以后都这样：把会议纪要导出为 SKILL' })
    expect(draft).not.toBeNull()
    expect(draft?.trigger).toBe('explicit')

    const accepted = acceptForgeDraft({
      spaceId,
      name: 'meeting-export',
      description: '把会议纪要导出为标准 SKILL',
      bodyMarkdown: '## How\n- Export markdown to artifact\n',
    })
    expect(accepted.name).toBe('meeting-export')
    expect(existsSync(accepted.absPath)).toBe(true)

    // (2) Scanner picks the new skill at Space tier
    const visible = scanSkillsForSpace(spaceId)
    const meta = visible.find((s) => s.name === 'meeting-export')
    expect(meta).toBeDefined()
    expect(meta?.scope).toBe('space')

    // (3) LearningLoop note → L2 composition
    appendStyleNote({
      spaceId,
      skillName: 'meeting-export',
      note: '语气简洁，开头列要点。',
    })
    const styleNotes = loadStyleNotes(spaceId, 'meeting-export')
    expect(styleNotes).toContain('语气简洁')
    const full = loadSkillFull(spaceId, 'meeting-export')
    expect(full).not.toBeNull()
    const composed = composeSkillBody(full?.body ?? '', styleNotes)
    expect(composed).toContain('语气简洁')

    // (4) Cron — write a scheduled skill, sync scheduler, fire tick
    const scheduledDir = join(spaceSkillsDir(spaceId), 'standup')
    mkdirSync(scheduledDir, { recursive: true })
    writeFileSync(
      join(scheduledDir, 'SKILL.md'),
      [
        '---',
        'name: standup',
        'description: daily standup brief',
        'kevin:',
        '  cron: "0 9 * * 1-5"',
        '---',
        'Body',
      ].join('\n'),
      'utf-8',
    )
    const taskManager = new TaskManager({}, 60_000)
    const scheduler = new CronScheduler({ onTrigger: makeCronOnTrigger(taskManager) })
    const synced = syncCronForSpace(scheduler, spaceId)
    expect(synced.map((j) => j.name)).toEqual(['standup'])
    scheduler._tickNowForTest(`${spaceId}:standup`)
    const cronTasks = taskManager.list(spaceId).filter((t) => t.trigger_kind === 'cron')
    expect(cronTasks).toHaveLength(1)
    expect(cronTasks[0].skill_name).toBe('standup')
    scheduler.shutdown()

    // (5) Sign-off — request → audit (pending) → resolve → audit (approved)
    const diff = previewFeishuDocDiff({ prior: '# v1\n', next: '# v2\n- new\n' })
    expect(diff.added.length).toBeGreaterThan(0)
    const signoffTask = taskManager.createSignoffTask(spaceId, {
      skill_name: 'meeting-export',
      payload: { actuatorId: 'artifact.feishu-doc.write', title: 'Weekly', diff },
    })
    appendAudit({
      userId: 'default',
      spaceId,
      taskId: signoffTask.id,
      skillName: 'meeting-export',
      actuatorId: 'artifact.feishu-doc.write',
      riskLevel: 'medium',
      decision: 'pending',
    })
    const result = runFeishuDocWriteMock(
      { title: 'Weekly', bodyMarkdown: '# v2\n- new\n', spaceId, sessionId: signoffTask.id },
      { mockDir: join(kevinAuditDir(), 'feishu-mock') },
    )
    expect(result.docId).toMatch(/^mock-doc-/)
    expect(result.network).toBe('mocked')
    const resolved = taskManager.resolveSignoff(signoffTask.id, true)
    expect(resolved?.state).toBe('completed')
    appendAudit({
      userId: 'default',
      spaceId,
      taskId: signoffTask.id,
      skillName: 'meeting-export',
      actuatorId: 'artifact.feishu-doc.write',
      riskLevel: 'medium',
      decision: 'approved',
      signoffLatencyMs: 1234,
    })
    const auditPath = kevinAuditPathForDate(new Date().toISOString().slice(0, 10))
    expect(existsSync(auditPath)).toBe(true)
    const lines = readFileSync(auditPath, 'utf-8').trim().split('\n')
    const decisions = lines.map((l) => JSON.parse(l).decision).sort()
    expect(decisions).toContain('pending')
    expect(decisions).toContain('approved')

    // (6) Notification aggregation — build a synthetic task feed and assert grouping
    const allTasks = taskManager.list(spaceId)
    const raw: RawTaskRow[] = allTasks.map((t) => ({
      id: t.id,
      state: t.state,
      skill_name: t.skill_name,
      trigger_kind: t.trigger_kind,
      message: t.message,
      updated_at: t.updated_at,
    }))
    const groups = aggregateNotifications(raw, { nowMs: Date.now(), threshold: 1, windowMs: 60 * 60_000 })
    expect(groups.length).toBeGreaterThan(0)
    const kinds = new Set(groups.map((g) => g.kind))
    // Threshold=1 collapses every same-skill completion into an aggregate card.
    expect(kinds.has('aggregate') || kinds.has('completed')).toBe(true)
  })
})
