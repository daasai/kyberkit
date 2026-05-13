/**
 * RecurringScheduler — 3.0 P1
 *
 * Polls active recurring contracts every minute.
 * On cron match: checks drift, then emits `contract.run.due`.
 * On expiry: calls ContractRegistry.expire().
 */

import type { TypedEventBus } from '../observability/TypedEventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { ContractRegistry } from './ContractRegistry.js';
import type { DriftDetector } from './DriftDetector.js';
import { cronMatches, parseCron } from './CronParser.js';

export interface RecurringSchedulerOptions {
  readonly registry: ContractRegistry;
  readonly driftDetector: DriftDetector;
  readonly eventBus: TypedEventBus<KyberEvents>;
  /** How often to tick, in ms. Default 60 000. Lower values useful for tests. */
  readonly tickIntervalMs?: number;
  /** Override current time (for testing). */
  readonly nowFn?: () => Date;
}

export class RecurringScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly lastFiredMinute = new Map<string, string>(); // contractId → 'YYYY-MM-DDTHH:MM'
  private readonly opts: Required<Pick<RecurringSchedulerOptions, 'tickIntervalMs' | 'nowFn'>> &
    Omit<RecurringSchedulerOptions, 'tickIntervalMs' | 'nowFn'>;

  constructor(options: RecurringSchedulerOptions) {
    this.opts = {
      ...options,
      tickIntervalMs: options.tickIntervalMs ?? 60_000,
      nowFn: options.nowFn ?? (() => new Date()),
    };
  }

  start(): void {
    if (this.timer !== null) return;
    // Fire once immediately, then on interval
    this.tick();
    this.timer = setInterval(() => this.tick(), this.opts.tickIntervalMs);
  }

  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Exposed for testing. */
  tick(): void {
    const now = this.opts.nowFn();
    const minuteKey = toMinuteKey(now);

    const recurringContracts = this.opts.registry.list({
      contractType: 'recurring',
      status: 'active',
    });

    for (const contract of recurringContracts) {
      if (!contract.recurring) continue;

      // ── expiry check ──────────────────────────────────────────────────────
      if (contract.recurring.expiresAt) {
        const expiresAt = new Date(contract.recurring.expiresAt).getTime();
        if (now.getTime() >= expiresAt) {
          this.opts.registry.expire(contract.taskId);
          continue;
        }
      }

      // ── cron match ────────────────────────────────────────────────────────
      let parsed;
      try {
        parsed = parseCron(contract.recurring.schedule);
      } catch {
        // Invalid cron — skip without pausing (operator needs to fix manually)
        continue;
      }

      if (!cronMatches(parsed, now)) continue;

      // ── dedup: only fire once per minute per contract ─────────────────────
      if (this.lastFiredMinute.get(contract.taskId) === minuteKey) continue;

      // ── drift check ───────────────────────────────────────────────────────
      if (contract.recurring.scopeDriftLimit) {
        const drift = this.opts.driftDetector.checkDrift(
          contract.taskId,
          contract.recurring.scopeDriftLimit,
        );
        if (drift.drifted) {
          this.opts.registry.pause(contract.taskId, drift.reason ?? 'Drift threshold exceeded');
          this.opts.eventBus.emit('contract.drift.detected', {
            contractId: contract.taskId,
            reason: drift.reason ?? 'Drift threshold exceeded',
            metric: drift.metric ?? 'failure_streak',
            value: drift.value ?? 0,
            threshold: drift.threshold ?? 0,
          });
          continue;
        }
      }

      // ── fire ──────────────────────────────────────────────────────────────
      this.lastFiredMinute.set(contract.taskId, minuteKey);
      this.opts.eventBus.emit('contract.run.due', {
        contractId: contract.taskId,
        contractType: 'recurring',
        triggeredBy: 'schedule',
        scheduledAt: now.getTime(),
      });
    }
  }
}

function toMinuteKey(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0') +
    'T' +
    String(date.getHours()).padStart(2, '0') +
    ':' +
    String(date.getMinutes()).padStart(2, '0')
  );
}
