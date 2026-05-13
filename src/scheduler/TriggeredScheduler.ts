/**
 * TriggeredScheduler — 3.0 P1
 *
 * Listens to `external.event` on the event bus.
 * When a triggered contract's source + match pattern aligns, emits `contract.run.due`.
 * Respects per-contract backoff to prevent thundering-herd retriggering.
 */

import type { TypedEventBus } from '../observability/TypedEventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { ContractRegistry } from './ContractRegistry.js';

export interface TriggeredSchedulerOptions {
  readonly registry: ContractRegistry;
  readonly eventBus: TypedEventBus<KyberEvents>;
  /** Override current time (for testing). */
  readonly nowFn?: () => number;
}

/**
 * Parse a human-readable backoff string like "5m", "30s", "1h" to milliseconds.
 * Falls back to 0 (no throttle) on unknown formats.
 */
export function parseBackoffMs(backoff: string): number {
  const match = /^(\d+)(s|m|h)$/.exec(backoff.trim());
  if (!match) return 0;
  const [, numStr, unit] = match as [string, string, string];
  const n = Number(numStr);
  switch (unit) {
    case 's':
      return n * 1_000;
    case 'm':
      return n * 60_000;
    case 'h':
      return n * 3_600_000;
    default:
      return 0;
  }
}

export class TriggeredScheduler {
  private readonly lastFiredAt = new Map<string, number>(); // contractId → timestamp ms
  private unsubscribe: (() => void) | null = null;
  private readonly nowMs: () => number;

  constructor(private readonly opts: TriggeredSchedulerOptions) {
    this.nowMs = opts.nowFn ?? (() => Date.now());
  }

  start(): void {
    if (this.unsubscribe !== null) return;
    const handler = (payload: KyberEvents['external.event']) => {
      this.handleExternalEvent(payload);
    };
    this.opts.eventBus.on('external.event', handler);
    this.unsubscribe = () => this.opts.eventBus.off?.('external.event', handler);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Exposed for direct testing without emitting on the bus. */
  handleExternalEvent(event: KyberEvents['external.event']): void {
    const triggeredContracts = this.opts.registry.list({
      contractType: 'triggered',
      status: 'active',
    });

    const now = this.nowMs();

    for (const contract of triggeredContracts) {
      if (!contract.triggered) continue;

      // ── source match ──────────────────────────────────────────────────────
      if (contract.triggered.source !== '*' && contract.triggered.source !== event.source) {
        continue;
      }

      // ── payload pattern match ─────────────────────────────────────────────
      const payloadStr = typeof event.payload === 'string'
        ? event.payload
        : JSON.stringify(event.payload);
      if (!payloadStr.includes(contract.triggered.match)) continue;

      // ── backoff throttle ──────────────────────────────────────────────────
      if (contract.triggered.backoff) {
        const backoffMs = parseBackoffMs(contract.triggered.backoff);
        const lastFired = this.lastFiredAt.get(contract.taskId) ?? 0;
        if (now - lastFired < backoffMs) continue;
      }

      // ── fire ──────────────────────────────────────────────────────────────
      this.lastFiredAt.set(contract.taskId, now);
      this.opts.eventBus.emit('contract.run.due', {
        contractId: contract.taskId,
        contractType: 'triggered',
        triggeredBy: 'event',
        eventPayload: event.payload,
        scheduledAt: now,
      });
    }
  }
}
