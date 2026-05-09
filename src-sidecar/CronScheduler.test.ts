import { describe, expect, it } from 'bun:test'
import {
  CronScheduler,
  nextCronTimestamp,
  parseCronExpression,
  type CronJobDef,
} from './CronScheduler'

describe('parseCronExpression', () => {
  it('accepts every-minute expression', () => {
    const fields = parseCronExpression('* * * * *')
    expect(fields.minute).toEqual('*')
    expect(fields.hour).toEqual('*')
    expect(fields.dayOfMonth).toEqual('*')
    expect(fields.month).toEqual('*')
    expect(fields.dayOfWeek).toEqual('*')
  })

  it('accepts numeric and list values', () => {
    const fields = parseCronExpression('0 9,17 * * 1-5')
    expect(fields.minute).toEqual([0])
    expect(fields.hour).toEqual([9, 17])
    expect(fields.dayOfWeek).toEqual([1, 2, 3, 4, 5])
  })

  it('accepts step values', () => {
    const fields = parseCronExpression('*/15 * * * *')
    expect(fields.minute).toEqual([0, 15, 30, 45])
  })

  it('rejects malformed expressions', () => {
    expect(() => parseCronExpression('not-a-cron')).toThrow()
    expect(() => parseCronExpression('* * *')).toThrow()
    expect(() => parseCronExpression('60 * * * *')).toThrow()
  })
})

describe('nextCronTimestamp', () => {
  it('returns the next minute when expression is */1 or *', () => {
    const base = new Date('2026-05-09T12:34:21Z').getTime()
    const next = nextCronTimestamp('* * * * *', base)
    expect(new Date(next).toISOString()).toBe('2026-05-09T12:35:00.000Z')
  })

  it('honours hour fields', () => {
    const base = new Date('2026-05-09T08:30:00Z').getTime()
    const next = nextCronTimestamp('0 9 * * *', base)
    expect(new Date(next).toISOString()).toBe('2026-05-09T09:00:00.000Z')
  })

  it('skips weekends with day-of-week filter', () => {
    // 2026-05-09 is Saturday (dow=6); next "0 9 * * 1" (Mon 09:00) is 2026-05-11
    const base = new Date('2026-05-09T08:00:00Z').getTime()
    const next = nextCronTimestamp('0 9 * * 1', base)
    expect(new Date(next).toISOString()).toBe('2026-05-11T09:00:00.000Z')
  })
})

describe('CronScheduler — registration & dispatch', () => {
  it('fires the onTrigger callback at the next minute boundary', async () => {
    const fired: CronJobDef[] = []
    const scheduler = new CronScheduler({ onTrigger: (job) => fired.push(job), nowFn: () => Date.now() })

    scheduler.register({
      id: 'job-1',
      cron: '* * * * *',
      spaceId: 'space-1',
      skillName: 'standup',
    })

    // Manually trigger one cycle to avoid waiting for real time.
    scheduler._tickNowForTest('job-1')
    expect(fired).toHaveLength(1)
    expect(fired[0].skillName).toBe('standup')

    scheduler.shutdown()
  })

  it('replaces an existing job with the same id', () => {
    const scheduler = new CronScheduler({ onTrigger: () => {}, nowFn: () => Date.now() })
    scheduler.register({ id: 'j', cron: '* * * * *', spaceId: 's', skillName: 'a' })
    scheduler.register({ id: 'j', cron: '0 * * * *', spaceId: 's', skillName: 'b' })
    expect(scheduler.list()).toHaveLength(1)
    expect(scheduler.list()[0].skillName).toBe('b')
    scheduler.shutdown()
  })

  it('unregisters by id', () => {
    const scheduler = new CronScheduler({ onTrigger: () => {}, nowFn: () => Date.now() })
    scheduler.register({ id: 'j', cron: '* * * * *', spaceId: 's', skillName: 'a' })
    expect(scheduler.list()).toHaveLength(1)
    scheduler.unregister('j')
    expect(scheduler.list()).toHaveLength(0)
    scheduler.shutdown()
  })
})

describe('CronScheduler — Skill registry sync', () => {
  it('syncFromSkills adds and removes jobs based on the input list', () => {
    const fired: CronJobDef[] = []
    const scheduler = new CronScheduler({ onTrigger: (job) => fired.push(job), nowFn: () => Date.now() })

    scheduler.syncFromSkills('space-1', [
      { name: 'a', cron: '* * * * *' },
      { name: 'b', cron: '0 9 * * *' },
    ])
    expect(scheduler.list().map((j) => j.skillName).sort()).toEqual(['a', 'b'])

    scheduler.syncFromSkills('space-1', [{ name: 'a', cron: '*/30 * * * *' }])
    expect(scheduler.list().map((j) => j.skillName)).toEqual(['a'])

    scheduler.shutdown()
  })

  it('isolates jobs per Space (different spaces are independent)', () => {
    const scheduler = new CronScheduler({ onTrigger: () => {}, nowFn: () => Date.now() })
    scheduler.syncFromSkills('space-A', [{ name: 'a', cron: '* * * * *' }])
    scheduler.syncFromSkills('space-B', [{ name: 'b', cron: '* * * * *' }])
    expect(scheduler.list()).toHaveLength(2)
    scheduler.syncFromSkills('space-A', [])
    expect(scheduler.list().map((j) => j.spaceId)).toEqual(['space-B'])
    scheduler.shutdown()
  })
})
