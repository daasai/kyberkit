/**
 * Kevin v1.5 — In-process Cron scheduler (Sprint D / S-8).
 *
 * Bun-native — uses setTimeout per next-fire and a tiny cron parser
 * (5-field POSIX subset: m h dom mon dow, with `*` `,` `-` and step "/n").
 *
 * Per the MVP-RC plan section 4 Sprint D:
 *   - SkillRegistry change -> re-sync via syncFromSkills().
 *   - On hit -> onTrigger(job); the bridge in index.ts creates a TaskManager task.
 *   - On Sidecar restart, in-flight cron-trigger tasks are marked failed rather than
 *     auto-resumed (prevents double-execution; documented in task-lifecycle.md section 7).
 */

export type CronField = '*' | number[]

export interface CronFields {
  minute: CronField
  hour: CronField
  dayOfMonth: CronField
  month: CronField
  dayOfWeek: CronField
}

const RANGE = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 6 },
}

function parseField(raw: string, range: { min: number; max: number }): CronField {
  if (raw === '*') return '*'
  const parts = raw.split(',')
  const values = new Set<number>()
  for (const part of parts) {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);
    if (!stepMatch) throw new Error(`Invalid cron field: ${raw}`);
    const head = stepMatch[1]
    const step = stepMatch[2] ? parseInt(stepMatch[2], 10) : 1
    if (step <= 0) throw new Error(`Invalid step in cron field: ${raw}`)

    let lo = range.min
    let hi = range.max
    if (head === '*') {
      // keep full range
    } else if (head.includes('-')) {
      const [a, b] = head.split('-').map((n) => parseInt(n, 10))
      if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`Invalid range in cron field: ${raw}`)
      lo = a
      hi = b
    } else {
      const single = parseInt(head, 10)
      if (Number.isNaN(single)) throw new Error(`Invalid value in cron field: ${raw}`)
      if (step === 1) {
        lo = single
        hi = single
      } else {
        lo = single
        hi = range.max
      }
    }
    if (lo < range.min || hi > range.max || lo > hi) {
      throw new Error(`Cron field out of range: ${raw}`)
    }
    for (let v = lo; v <= hi; v += step) values.add(v)
  }
  return [...values].sort((a, b) => a - b)
}

export function parseCronExpression(expr: string): CronFields {
  const tokens = expr.trim().split(/\s+/)
  if (tokens.length !== 5) {
    throw new Error(`Cron expression must have 5 fields: "${expr}"`)
  }
  return {
    minute: parseField(tokens[0], RANGE.minute),
    hour: parseField(tokens[1], RANGE.hour),
    dayOfMonth: parseField(tokens[2], RANGE.dayOfMonth),
    month: parseField(tokens[3], RANGE.month),
    dayOfWeek: parseField(tokens[4], RANGE.dayOfWeek),
  }
}

function fieldMatches(field: CronField, value: number): boolean {
  if (field === '*') return true
  return field.includes(value)
}

/**
 * Compute the next millisecond timestamp at which the cron expression matches,
 * strictly after `fromMs`. Operates in UTC.
 */
export function nextCronTimestamp(expr: string, fromMs: number): number {
  const fields = parseCronExpression(expr)
  // Start from the next minute boundary after fromMs.
  let cursor = new Date(Math.floor(fromMs / 60_000) * 60_000 + 60_000)
  // Bound iterations to ~4 years to avoid infinite loops on impossible expressions.
  const limit = cursor.getTime() + 4 * 366 * 24 * 60 * 60_000
  while (cursor.getTime() < limit) {
    const m = cursor.getUTCMinutes()
    const h = cursor.getUTCHours()
    const dom = cursor.getUTCDate()
    const mon = cursor.getUTCMonth() + 1
    const dow = cursor.getUTCDay()
    if (
      fieldMatches(fields.minute, m) &&
      fieldMatches(fields.hour, h) &&
      fieldMatches(fields.dayOfMonth, dom) &&
      fieldMatches(fields.month, mon) &&
      fieldMatches(fields.dayOfWeek, dow)
    ) {
      return cursor.getTime()
    }
    cursor = new Date(cursor.getTime() + 60_000)
  }
  throw new Error(`No upcoming cron match within 4 years for "${expr}"`)
}

export interface CronJobDef {
  id: string
  cron: string
  spaceId: string
  skillName: string
  /** Free-form payload forwarded to the trigger callback (e.g. Skill metadata). */
  payload?: unknown
}

export interface CronSchedulerOptions {
  onTrigger: (job: CronJobDef) => void
  /** Override `Date.now` for tests. */
  nowFn?: () => number
}

interface RegisteredJob extends CronJobDef {
  timer: ReturnType<typeof setTimeout> | null
}

/** In-process cron scheduler. Restart-on-process behaviour is intentional (see plan risks). */
export class CronScheduler {
  private jobs = new Map<string, RegisteredJob>()
  private readonly onTrigger: (job: CronJobDef) => void
  private readonly nowFn: () => number

  constructor(opts: CronSchedulerOptions) {
    this.onTrigger = opts.onTrigger
    this.nowFn = opts.nowFn ?? (() => Date.now())
  }

  list(): CronJobDef[] {
    return Array.from(this.jobs.values()).map(({ timer: _t, ...rest }) => rest)
  }

  register(job: CronJobDef): void {
    this.unregister(job.id)
    // Validate eagerly so callers see the error.
    parseCronExpression(job.cron)
    const wrapped: RegisteredJob = { ...job, timer: null }
    this.jobs.set(job.id, wrapped)
    this.scheduleNext(job.id)
  }

  unregister(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.timer) clearTimeout(job.timer)
    this.jobs.delete(id)
  }

  /**
   * Reconcile cron jobs for one Space. Any existing job belonging to this Space
   * not present in `skills` is removed; any new entry is registered.
   */
  syncFromSkills(spaceId: string, skills: Array<{ name: string; cron: string }>): void {
    const desired = new Set<string>()
    for (const skill of skills) {
      const id = `${spaceId}:${skill.name}`
      desired.add(id)
      this.register({
        id,
        cron: skill.cron,
        spaceId,
        skillName: skill.name,
      })
    }
    for (const job of [...this.jobs.values()]) {
      if (job.spaceId === spaceId && !desired.has(job.id)) {
        this.unregister(job.id)
      }
    }
  }

  /** Visible to tests so they can inject a fire without waiting for real time. */
  _tickNowForTest(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    const { timer: _t, ...def } = job
    this.onTrigger(def)
    this.scheduleNext(id)
  }

  shutdown(): void {
    for (const job of this.jobs.values()) {
      if (job.timer) clearTimeout(job.timer)
    }
    this.jobs.clear()
  }

  private scheduleNext(id: string): void {
    const job = this.jobs.get(id)
    if (!job) return
    if (job.timer) clearTimeout(job.timer)
    let nextMs: number
    try {
      nextMs = nextCronTimestamp(job.cron, this.nowFn())
    } catch {
      return
    }
    const delay = Math.max(0, nextMs - this.nowFn())
    job.timer = setTimeout(() => {
      const live = this.jobs.get(id)
      if (!live) return
      const { timer: _t, ...def } = live
      try {
        this.onTrigger(def)
      } catch (err) {
        console.error(`[CronScheduler] onTrigger failed for ${id}:`, err)
      }
      this.scheduleNext(id)
    }, delay)
  }
}
