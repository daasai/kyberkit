/**
 * Kevin v1.5 — Notification Center aggregation rules (Sprint D / S-9).
 *
 * PRD §11.4 — sign-off cards always lead the queue; same-skill completions
 * within a 1h rolling window collapse into a single aggregated card so the
 * Notification Center never floods on cron-heavy days.
 *
 * Pure function so the rules stay easy to unit-test independently of UI.
 */

export type RawTaskState =
  | 'queued'
  | 'running'
  | 'awaiting-signoff'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface RawTaskRow {
  id: string
  state: RawTaskState | string
  skill_name: string | null
  trigger_kind?: string | null
  message?: string | null
  updated_at?: string | null
}

export type NotificationKind =
  | 'signoff'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'aggregate'

export interface NotificationGroup {
  kind: NotificationKind
  /** Stable identifier — taskId for individual cards, `agg:<skill>` for aggregates. */
  key: string
  title: string
  detail?: string
  count: number
  /** Most recent updated_at across grouped tasks (ISO). */
  latestUpdatedAt: string
  /** Underlying task ids (one for individual cards, many for aggregates). */
  taskIds: string[]
  skillName: string | null
}

export interface AggregateOptions {
  /** Defaults to Date.now(); injectable for tests. */
  nowMs?: number
  /** 1h rolling window per PRD §11.4. */
  windowMs?: number
  /** Minimum same-skill completions inside window to collapse. */
  threshold?: number
}

const DEFAULT_WINDOW = 60 * 60_000
const DEFAULT_THRESHOLD = 3

function parseTs(raw: string | null | undefined, fallbackMs: number): number {
  if (!raw) return fallbackMs
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : fallbackMs
}

function describeSkill(name: string | null): string {
  if (!name) return '任务'
  return name
}

export function aggregateNotifications(
  rows: RawTaskRow[],
  opts: AggregateOptions = {},
): NotificationGroup[] {
  const nowMs = opts.nowMs ?? Date.now()
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD

  const signoffs: NotificationGroup[] = []
  const failed: NotificationGroup[] = []
  const cancelled: NotificationGroup[] = []
  // skill -> rows in window
  const completedBySkill = new Map<string, RawTaskRow[]>()
  const completedNoSkill: RawTaskRow[] = []

  for (const row of rows) {
    const updatedMs = parseTs(row.updated_at, nowMs)
    if (row.state === 'awaiting-signoff') {
      signoffs.push({
        kind: 'signoff',
        key: row.id,
        title: `待签批 · ${describeSkill(row.skill_name)}`,
        detail: row.message ?? undefined,
        count: 1,
        latestUpdatedAt: row.updated_at ?? new Date(updatedMs).toISOString(),
        taskIds: [row.id],
        skillName: row.skill_name,
      })
      continue
    }
    if (row.state === 'failed') {
      failed.push({
        kind: 'failed',
        key: row.id,
        title: `失败 · ${describeSkill(row.skill_name)}`,
        detail: row.message ?? undefined,
        count: 1,
        latestUpdatedAt: row.updated_at ?? new Date(updatedMs).toISOString(),
        taskIds: [row.id],
        skillName: row.skill_name,
      })
      continue
    }
    if (row.state === 'cancelled') {
      cancelled.push({
        kind: 'cancelled',
        key: row.id,
        title: `已取消 · ${describeSkill(row.skill_name)}`,
        detail: row.message ?? undefined,
        count: 1,
        latestUpdatedAt: row.updated_at ?? new Date(updatedMs).toISOString(),
        taskIds: [row.id],
        skillName: row.skill_name,
      })
      continue
    }
    if (row.state !== 'completed') continue
    if (nowMs - updatedMs > windowMs) continue
    const key = row.skill_name ?? '__noskill__'
    if (!row.skill_name) {
      completedNoSkill.push(row)
      continue
    }
    const bucket = completedBySkill.get(key) ?? []
    bucket.push(row)
    completedBySkill.set(key, bucket)
  }

  const aggregates: NotificationGroup[] = []
  const completedSingles: NotificationGroup[] = []

  for (const [skill, bucket] of completedBySkill.entries()) {
    if (bucket.length >= threshold) {
      const sorted = [...bucket].sort(
        (a, b) => parseTs(b.updated_at, 0) - parseTs(a.updated_at, 0),
      )
      aggregates.push({
        kind: 'aggregate',
        key: `agg:${skill}`,
        title: `${skill} · 1 小时内完成 ${bucket.length} 次`,
        detail: sorted[0].message ?? undefined,
        count: bucket.length,
        latestUpdatedAt:
          sorted[0].updated_at ?? new Date(nowMs).toISOString(),
        taskIds: sorted.map((r) => r.id),
        skillName: skill,
      })
    } else {
      for (const r of bucket) {
        completedSingles.push({
          kind: 'completed',
          key: r.id,
          title: `已完成 · ${describeSkill(r.skill_name)}`,
          detail: r.message ?? undefined,
          count: 1,
          latestUpdatedAt:
            r.updated_at ?? new Date(parseTs(r.updated_at, nowMs)).toISOString(),
          taskIds: [r.id],
          skillName: r.skill_name,
        })
      }
    }
  }

  for (const r of completedNoSkill) {
    completedSingles.push({
      kind: 'completed',
      key: r.id,
      title: `已完成 · 任务`,
      detail: r.message ?? undefined,
      count: 1,
      latestUpdatedAt:
        r.updated_at ?? new Date(parseTs(r.updated_at, nowMs)).toISOString(),
      taskIds: [r.id],
      skillName: null,
    })
  }

  const sortRecent = (a: NotificationGroup, b: NotificationGroup) =>
    parseTs(b.latestUpdatedAt, 0) - parseTs(a.latestUpdatedAt, 0)

  return [
    ...signoffs.sort(sortRecent),
    ...aggregates.sort(sortRecent),
    ...failed.sort(sortRecent),
    ...completedSingles.sort(sortRecent),
    ...cancelled.sort(sortRecent),
  ]
}
