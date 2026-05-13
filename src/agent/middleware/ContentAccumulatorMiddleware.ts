import { AgentEvent } from '../../types/agent-events.js';
import { MessageContent } from '../../types/model.js';
import { StreamMiddleware, MiddlewareContext } from '../StreamMiddleware.js';

/**
 * Accumulates streaming deltas into complete content blocks for message history.
 *
 * Passes through all delta events for real-time display, while simultaneously
 * building the accumulated content needed to append to agent message history.
 *
 * Accumulation is consumed via context.accumulatedContent and context.pendingToolUses
 * after the stream completes each turn.
 */
export class ContentAccumulatorMiddleware implements StreamMiddleware {
  readonly name = 'content-accumulator';

  private textBuffer = '';
  private thinkingBuffer = '';
  private toolUseBuffers = new Map<string, { name: string; input: string }>();

  process(event: AgentEvent, context: MiddlewareContext): AgentEvent | AgentEvent[] {
    switch (event.type) {
      case 'text_delta':
        this.textBuffer += event.text;
        return event;

      case 'thinking_delta':
        this.thinkingBuffer += event.text;
        return event;

      case 'tool_use_start':
        this.toolUseBuffers.set(event.toolUseId, { name: event.toolName, input: '' });
        return event;

      case 'tool_use_input':
        const buf = this.toolUseBuffers.get(event.toolUseId);
        if (buf) buf.input += event.fragment;
        return event;

      case 'tool_use_complete':
        context.pendingToolUses.push({
          id: event.toolUseId,
          name: event.toolName,
          input: event.input,
        });
        return event;

      case 'turn_complete': {
        // Build accumulated MessageContent[] from buffers
        const content: MessageContent[] = [];

        // D1 fix: Include thinking content wrapped in <thinking> tags
        if (this.thinkingBuffer) {
          content.push({ type: 'text', text: `<thinking>${this.thinkingBuffer}</thinking>` });
        }

        if (this.textBuffer) {
          content.push({ type: 'text', text: this.textBuffer });
        }

        // D2 fix: Use context.pendingToolUses (already parsed by tool_use_complete handler)
        // instead of re-parsing from toolUseBuffers to avoid double-parse inconsistency
        for (const pending of context.pendingToolUses) {
          content.push({
            type: 'tool_use',
            id: pending.id,
            name: pending.name,
            input: pending.input,
          });
        }

        context.accumulatedContent = content;
        this.reset();

        return event;
      }

      default:
        return event;
    }
  }

  /** Reset buffers for the next turn. */
  reset(): void {
    this.textBuffer = '';
    this.thinkingBuffer = '';
    this.toolUseBuffers.clear();
  }
}
