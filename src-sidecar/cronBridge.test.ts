import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
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
import { CronScheduler, type CronJobDef } from './CronScheduler'
import { TaskManager } from './TaskManager'
import { cronJobsForSpace, makeCronOnTrigger, syncCronForSpace } from './cronBridge'

let tempHome: string
let nodeRoot: string
let spaceId: string
let libraryId: string

function writeSkill(rootDir: string, slug: string, fm: string, body = 'Body\n'): void {
  const dir = join(rootDir, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\n${fm}\n---\n${body}`, 'utf-8')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'kyber-cron-bridge-'))
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
  upsertSpaceLibraryBinding({ spaceId, libraryId, mountPath: tempHome, displayName: 'Test' })
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  delete process.env.KYBER_HOME
  delete process.env.KEVIN_NODE_ROOT
})

describe('cronBridge.cronJobsForSpace', () => {
  it('returns only skills that declare a kevin.cron expression', () => {
    writeSkill(spaceSkillsDir(spaceId), 'standup', [
      'name: standup',
      'description: daily standup brief',
      'kevin:',
      '  cron: "0 9 * * 1-5"',
    ].join('\n'))
    writeSkill(spaceSkillsDir(spaceId), 'manual-only', [
      'name: manual-only',
      'description: not scheduled',
    ].join('\n'))

    const jobs = cronJobsForSpace(spaceId)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toEqual({ name: 'standup', cron: '0 9 * * 1-5' })
  })
})

describe('cronBridge.syncCronForSpace', () => {
  it('registers cron-bearing skills and removes ones no longer present', () => {
    const scheduler = new CronScheduler({ onTrigger: () => {}, nowFn: () => Date.now() })
    writeSkill(spaceSkillsDir(spaceId), 's1', [
      'name: s1',
      'description: s1',
      'kevin:',
      '  cron: "*/15 * * * *"',
    ].join('\n'))

    syncCronForSpace(scheduler, spaceId)
    expect(scheduler.list().map((j) => j.skillName)).toEqual(['s1'])

    rmSync(join(spaceSkillsDir(spaceId), 's1'), { recursive: true, force: true })
    syncCronForSpace(scheduler, spaceId)
    expect(scheduler.list()).toHaveLength(0)
    scheduler.shutdown()
  })
})

describe('cronBridge.makeCronOnTrigger', () => {
  it('enqueues a TaskManager task with trigger_kind=cron when fired', () => {
    const taskManager = new TaskManager({}, 60_000)
    const onTrigger = makeCronOnTrigger(taskManager)
    const job: CronJobDef = {
      id: `${spaceId}:standup`,
      cron: '* * * * *',
      spaceId,
      skillName: 'standup',
    }
    onTrigger(job)
    const tasks = taskManager.list(spaceId)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].trigger_kind).toBe('cron')
    expect(tasks[0].skill_name).toBe('standup')
    const payload = JSON.parse(tasks[0].payload ?? '{}')
    expect(payload.cron).toBe('* * * * *')
    expect(payload.jobId).toBe(`${spaceId}:standup`)
  })
})
