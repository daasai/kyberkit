import type { AgentEvent } from '../../types/agent-events.js';
import type { StreamMiddleware, MiddlewareContext } from '../StreamMiddleware.js';
import type { SessionMemoryExtractor } from '../../memory/extractors/SessionMemoryExtractor.js';
import type { SessionMemory } from '../../memory/SessionMemory.js';
import type { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';
import { AsyncMutex } from '../../util/AsyncMutex.js';

/**
 * Optional LongTermMemoryExtractor contract. Implemented in Step 10; typed
 * here as a structural interface so the middleware can be wired today while
 * Step 10 is still pending.
 */
export interface LongTermMemoryExtractorLike {
  extract(
    messages: import('../../types/model.js').ChatMessage[],
  ): Promise<Array<{ category: string; slug: string }>>;
}

export interface MemoryTriggerConfig {
  /** Tokens accumulated since the last session extraction. Default: 4000 */
  readonly sessionTokenThreshold: number;
  /** Tool calls since the last session extraction. Default: 8 */
  readonly sessionToolCallThreshold: number;
  /** Turns since the last session extraction. Default: 5 */
  readonly sessionTurnThreshold: number;
  /** Minimum turns between two LTM extractions. Default: 3 */
  readonly ltmTurnCooldown: number;
  /** Master on/off. Default: true */
  readonly enabled: boolean;
}

export const DEFAULT_MEMORY_TRIGGER_CONFIG: MemoryTriggerConfig = {
  sessionTokenThreshold: 4000,
  sessionToolCallThreshold: 8,
  sessionTurnThreshold: 5,
  ltmTurnCooldown: 3,
  enabled: true,
};

export interface MemoryTriggerDeps {
  readonly sessionExtractor: SessionMemoryExtractor;
  readonly sessionMemory: SessionMemory;
  /** Optional — wired in Step 10. When absent, LTM branch is skipped. */
  readonly ltmExtractor?: LongTermMemoryExtractorLike;
  readonly eventBus: TypedEventBus<KyberEvents>;
  readonly config: MemoryTriggerConfig;
}

/**
 * MemoryTriggerMiddleware — Sprint 4 §4.4
 *
 * Subscribes to `usage`, `tool_use_complete`, `turn_complete` events and
 * fires async memory extractions when thresholds are reached. Extractions
 * run fire-and-forget through an AsyncMutex so they never block the main
 * agent stream. Errors surface via the `memory.extraction_skipped` event.
 */
export class MemoryTriggerMiddleware implements StreamMiddleware {
  readonly name = 'memory_trigger';

  private tokenSinceLastExtract = 0;
  private toolCallsSinceLastExtract = 0;
  private turnsSinceLastSessionExtract = 0;
  private turnsSinceLastLtmExtract = 0;

  private readonly sessionMutex = new AsyncMutex();
  private readonly ltmMutex = new AsyncMutex();

  /** Tracks in-flight work so tests can await completion. */
  private inFlight: Array<Promise<void>> = [];

  constructor(private readonly deps: MemoryTriggerDeps) {}

  process(event: AgentEvent, ctx: MiddlewareContext): AgentEvent | null {
    if (!this.deps.config.enabled) return event;

    switch (event.type) {
      case 'usage': {
        const u = event.usage;
        this.tokenSinceLastExtract += (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
        break;
      }
      case 'tool_use_complete':
        this.toolCallsSinceLastExtract++;
        break;
      case 'turn_complete':
        this.turnsSinceLastSessionExtract++;
        this.turnsSinceLastLtmExtract++;
        this.maybeTriggerSession(ctx);
        this.maybeTriggerLtm(ctx, event.stopReason);
        break;
    }
    return event;
  }

  /**
   * Wait for all outstanding fire-and-forget extractions to settle.
   * Primarily a test helper — production code does not need to call this.
   */
  async waitIdle(): Promise<void> {
    while (this.inFlight.length > 0) {
      const pending = this.inFlight.splice(0);
      await Promise.allSettled(pending);
    }
  }

  private maybeTriggerSession(ctx: MiddlewareContext): void {
    const c = this.deps.config;
    const shouldTrigger =
      this.tokenSinceLastExtract >= c.sessionTokenThreshold ||
      this.toolCallsSinceLastExtract >= c.sessionToolCallThreshold ||
      this.turnsSinceLastSessionExtract >= c.sessionTurnThreshold;

    if (!shouldTrigger) return;

    const snapshotMessages = [...ctx.agent.messages];
    this.resetSessionCounters();

    const job = this.sessionMutex.runExclusive(async () => {
      try {
        const prev = this.deps.sessionMemory.hasExtractedNotes()
          ? this.deps.sessionMemory.getExtractedMarkdown()
          : null;
        const { markdown, tokenCount } =
          await this.deps.sessionExtractor.extract(snapshotMessages, prev);
        if (markdown.trim().length === 0) {
          this.deps.eventBus.emit('memory.extraction_skipped', {
            tier: 'session',
            reason: 'empty extractor output',
          });
          return;
        }
        this.deps.sessionMemory.mergeExtracted(markdown, {
          basedOnMessages: snapshotMessages.length,
          tokenCount,
        });
        this.deps.eventBus.emit('memory.extracted', {
          tier: 'session',
          entryCount: 1,
          basedOnMessages: snapshotMessages.length,
        });
      } catch (err) {
        this.deps.eventBus.emit('memory.extraction_skipped', {
          tier: 'session',
          reason: (err as Error).message,
        });
      }
    });
    this.track(job);
  }

  private maybeTriggerLtm(ctx: MiddlewareContext, stopReason: string): void {
    if (!this.deps.ltmExtractor) return;
    if (stopReason !== 'end_turn') return;
    if (this.turnsSinceLastLtmExtract < this.deps.config.ltmTurnCooldown) return;

    const snapshotMessages = [...ctx.agent.messages];
    this.turnsSinceLastLtmExtract = 0;
    const extractor = this.deps.ltmExtractor;

    const job = this.ltmMutex.runExclusive(async () => {
      try {
        const entries = await extractor.extract(snapshotMessages);
        this.deps.eventBus.emit('memory.extracted', {
          tier: 'long_term',
          entryCount: entries.length,
          basedOnMessages: snapshotMessages.length,
        });
      } catch (err) {
        this.deps.eventBus.emit('memory.extraction_skipped', {
          tier: 'long_term',
          reason: (err as Error).message,
        });
      }
    });
    this.track(job);
  }

  private track(promise: Promise<void>): void {
    this.inFlight.push(promise);
    promise.finally(() => {
      const idx = this.inFlight.indexOf(promise);
      if (idx >= 0) this.inFlight.splice(idx, 1);
    });
  }

  private resetSessionCounters(): void {
    this.tokenSinceLastExtract = 0;
    this.toolCallsSinceLastExtract = 0;
    this.turnsSinceLastSessionExtract = 0;
  }
}
