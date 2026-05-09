/**
 * Kevin v1.5 — Cron <-> SkillScanner <-> TaskManager bridge (S-8 of MVP-RC).
 *
 * - cronJobsForSpace(spaceId): inspect Skills (Global/User/Space) and return the
 *   subset that carry a `kevin.cron` field.
 * - syncCronForSpace(scheduler, spaceId): re-register that subset with the scheduler.
 * - bindSchedulerToTaskManager(scheduler, taskManager): on every cron tick, emit a
 *   `cron`-triggered task in the owning Space.
 *
 * The bridge is intentionally side-effect-free until wired by `index.ts`, so it can
 * be unit-tested with stub callbacks.
 */

import type { CronScheduler } from './CronScheduler'
import type { TaskManager } from './TaskManager'
import { scanSkillsForSpace } from './SkillScanner'

export interface CronSkillEntry {
  name: string
  cron: string
}

export function cronJobsForSpace(spaceId: string): CronSkillEntry[] {
  return scanSkillsForSpace(spaceId)
    .filter((s) => typeof s.cron === 'string' && s.cron.length > 0)
    .map((s) => ({ name: s.name, cron: s.cron as string }))
}

export function syncCronForSpace(scheduler: CronScheduler, spaceId: string): CronSkillEntry[] {
  const entries = cronJobsForSpace(spaceId)
  scheduler.syncFromSkills(spaceId, entries)
  return entries
}

/**
 * Wire the scheduler's onTrigger callback so each hit creates an `awaiting-run`
 * task scoped to the originating Space. The actual execution is delegated to
 * the runtime in v2.0; for MVP-RC we only persist the trigger so the UI can
 * surface it through the existing notifications channel.
 */
export function makeCronOnTrigger(taskManager: TaskManager) {
  return (job: { id: string; cron: string; spaceId: string; skillName: string }) => {
    try {
      taskManager.createTask(job.spaceId, {
        skill_name: job.skillName,
        trigger_kind: 'cron',
        payload: { cron: job.cron, jobId: job.id, firedAt: new Date().toISOString() },
      })
    } catch (err) {
      console.error(`[cronBridge] Failed to enqueue cron-triggered task for ${job.id}:`, err)
    }
  }
}
