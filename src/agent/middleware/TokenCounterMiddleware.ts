import { AgentEvent } from '../../types/agent-events.js';
import { StreamMiddleware, MiddlewareContext } from '../StreamMiddleware.js';

/**
 * Tracks cumulative token usage across the session.
 * Enriches UsageEvent with cumulative totals.
 */
export class TokenCounterMiddleware implements StreamMiddleware {
  readonly name = 'token-counter';

  process(event: AgentEvent, context: MiddlewareContext): AgentEvent {
    if (event.type === 'usage') {
      context.cumulative.totalInputTokens += event.usage.inputTokens;
      context.cumulative.totalOutputTokens += event.usage.outputTokens;
      context.cumulative.totalCacheCreationTokens += event.usage.cacheCreationTokens ?? 0;
      context.cumulative.totalCacheReadTokens += event.usage.cacheReadTokens ?? 0;

      return {
        ...event,
        cumulative: { ...context.cumulative },
      };
    }
    return event;
  }
}
