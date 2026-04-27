import { AgentEvent, CumulativeUsage } from '../types/agent-events.js';
import { MessageContent, StopReason } from '../types/model.js';
import { DefaultAgentInstance } from './AgentInstance.js';

/**
 * Shared mutable context accessible to all middlewares within a turn.
 */
export interface MiddlewareContext {
  /** Current agent instance */
  readonly agent: DefaultAgentInstance;
  /** Current turn number */
  turnNumber: number;
  /** Latest natural-language user text for this turn (set by AgentLoop). */
  latestUserTurnText: string;
  /** Cumulative session usage */
  cumulative: CumulativeUsage;
  /** Accumulated content blocks for current assistant turn */
  accumulatedContent: Array<MessageContent>;
  /** Accumulated tool_use blocks pending execution */
  pendingToolUses: Array<{
    id: string;
    name: string;
    input: unknown;
  }>;
  /** Current stop reason (set when message_stop events flow through) */
  stopReason: StopReason | null;
}

/**
 * StreamMiddleware processes agent events in a pipeline.
 *
 * Each middleware can:
 * - Pass the event through unchanged (return it)
 * - Transform the event (return modified version)
 * - Filter the event (return null)
 * - Produce additional events (return an array)
 */
export interface StreamMiddleware {
  readonly name: string;

  /**
   * Process an agent event.
   * @param event - The incoming event
   * @param context - Shared mutable context for this turn
   * @returns Processed event(s), null to filter, or the original event
   */
  process(
    event: AgentEvent,
    context: MiddlewareContext,
  ): AgentEvent | AgentEvent[] | null;
}

/**
 * MiddlewarePipeline chains middlewares and processes events through them sequentially.
 * Synchronous by design — middleware should not perform I/O.
 */
export class MiddlewarePipeline {
  private readonly middlewares: StreamMiddleware[] = [];

  use(middleware: StreamMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Process an event through all middlewares in order.
   * Returns the final event(s) to yield to the consumer.
   */
  process(event: AgentEvent, context: MiddlewareContext): AgentEvent[] {
    let events: AgentEvent[] = [event];

    for (const mw of this.middlewares) {
      const nextEvents: AgentEvent[] = [];
      for (const e of events) {
        const result = mw.process(e, context);
        if (result === null) continue;
        if (Array.isArray(result)) {
          nextEvents.push(...result);
        } else {
          nextEvents.push(result);
        }
      }
      events = nextEvents;
    }

    return events;
  }

  /** Returns the count of registered middlewares. */
  get size(): number {
    return this.middlewares.length;
  }
}

/**
 * Creates a fresh MiddlewareContext for a new session.
 */
export function createMiddlewareContext(agent: DefaultAgentInstance): MiddlewareContext {
  return {
    agent,
    turnNumber: 0,
    latestUserTurnText: '',
    cumulative: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      turnCount: 0,
    },
    accumulatedContent: [],
    pendingToolUses: [],
    stopReason: null,
  };
}
