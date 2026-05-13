/**
 * Kevin v1.5 — minute-resolution cron scheduler using existing CronParser.
 * Loads jobs from `~/.kyberkit/users/<id>/crontab.json` (see tier-architecture.md).
 */

import { readFileSync, existsSync, writeFileSync } from 'fs'
import { parseCron, cronMatches, type ParsedCron } from './CronParser.js'
import { userCrontabPath } from '../runtime/paths/PathResolver.js'

export interface CronJobDef {
  id: string
  space_id: string
  /** 5-field cron: `min hour dom month dow` */
  cron: string
  skill_name: string
}

export type CronTaskEnqueue = (
  spaceId: string,
  opts: {
    skill_name?: string
    trigger_kind?: string
    payload?: unknown
  },
) => void

export function loadUserCronJobs(userId = 'default'): CronJobDef[] {
  const p = userCrontabPath(userId)
  if (!existsSync(p)) {
    try {
      writeFileSync(p, '[\n]\n', 'utf-8')
    } catch {
      /* ignore */
    }
    return []
  }
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    const arr = Array.isArray(raw) ? raw : []
    const out: CronJobDef[] = []
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue
      const o = row as Record<string, unknown>
      const id = typeof o.id === 'string' ? o.id : ''
      const space_id = typeof o.space_id === 'string' ? o.space_id : ''
      const cron = typeof o.cron === 'string' ? o.cron : ''
      const skill_name = typeof o.skill_name === 'string' ? o.skill_name : ''
      if (!id || !space_id || !cron || !skill_name) continue
      out.push({ id, space_id, cron, skill_name })
    }
    return out
  } catch {
    return []
  }
}

/**
 * Fires matching cron jobs at most once per job per clock minute.
 */
export class CronEngine {
  private timer: ReturnType<typeof setInterval> | null = null
  /** job id → last fired minute key `YYYY-MM-DD-HH-mm` */
  private lastMinute = new Map<string, string>()
  private parsed = new Map<string, ParsedCron>()

  constructor(
    private readonly enqueue: CronTaskEnqueue,
    private readonly userId: string = 'default',
  ) {}

  start(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), 60_000)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private minuteKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}-${d.getMinutes()}`
  }

  private getParsed(expr: string): ParsedCron | null {
    const hit = this.parsed.get(expr)
    if (hit) return hit
    try {
      const c = parseCron(expr)
      this.parsed.set(expr, c)
      return c
    } catch (e) {
      console.warn('[CronEngine] invalid cron:', expr, e)
      return null
    }
  }

  private tick(): void {
    const now = new Date()
    const mk = this.minuteKey(now)
    const jobs = loadUserCronJobs(this.userId)
    for (const job of jobs) {
      const cron = this.getParsed(job.cron)
      if (!cron || !cronMatches(cron, now)) continue
      if (this.lastMinute.get(job.id) === mk) continue
      this.lastMinute.set(job.id, mk)
      this.enqueue(job.space_id, {
        skill_name: job.skill_name,
        trigger_kind: 'cron',
        payload: { cron: job.cron, job_id: job.id },
      })
    }
  }
}
