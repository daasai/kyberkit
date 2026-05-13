import type { AgentEvent } from '../../types/agent-events.js';
import type { ChatMessage } from '../../types/model.js';
import type { CompactOptions, TokenBudget } from '../../types/compression.js';
import type { DefaultAgentInstance } from '../AgentInstance.js';
import type { ContextCompressor } from '../../compression/ContextCompressor.js';
import type { MiddlewareContext, StreamMiddleware } from '../StreamMiddleware.js';

export class CompactionGuardMiddleware implements StreamMiddleware {
  readonly name = 'compaction_guard';

  constructor(
    private readonly compressor: ContextCompressor,
    private readonly budget: TokenBudget,
    private readonly options: CompactOptions,
  ) {}

  process(event: AgentEvent, _context: MiddlewareContext): AgentEvent | AgentEvent[] | null {
    return event;
  }

  async evaluateAndCompact(
    agent: DefaultAgentInstance,
  ): Promise<{ summary?: string; replacedMessages?: ChatMessage[] }> {
    const decision = this.compressor.shouldCompact(agent.messages as ChatMessage[], this.budget);
    if (!decision.shouldCompact) {
      return {};
    }
    const result = await this.compressor.compact(
      agent.messages as ChatMessage[],
      this.budget,
      this.options,
    );
    if (!result.success || result.strategy === 'noop') {
      return {};
    }
    return { summary: result.summary, replacedMessages: result.messages };
  }
}
