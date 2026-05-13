import { StreamEvent, StopReason } from '../types/model.js';
import { AgentEvent } from '../types/agent-events.js';

/**
 * StreamEventMapper — unified mapping from StreamEvent to AgentEvent.
 *
 * Consolidates tool_use block tracking and input JSON accumulation into
 * a single stateful mapper. Eliminates the scattered enrichment logic
 * that was previously split across mapStreamEventToAgentEvent() and
 * the agentLoop body (D3 fix).
 */
export class StreamEventMapper {
  private toolUseBlocks = new Map<string, { name: string; inputJson: string }>();

  /**
   * Map a StreamEvent to an AgentEvent.
   * Returns null for events that are handled separately (e.g., message_stop).
   */
  mapEvent(streamEvent: StreamEvent): AgentEvent | null {
    switch (streamEvent.type) {
      case 'text_delta':
        return { type: 'text_delta', text: streamEvent.text };

      case 'thinking_delta':
        return { type: 'thinking_delta', text: streamEvent.text };

      case 'tool_use_start':
        this.toolUseBlocks.set(streamEvent.id, { name: streamEvent.name, inputJson: '' });
        return { type: 'tool_use_start', toolUseId: streamEvent.id, toolName: streamEvent.name };

      case 'tool_use_input': {
        const block = this.toolUseBlocks.get(streamEvent.id);
        if (block) block.inputJson += streamEvent.inputFragment;
        return { type: 'tool_use_input', toolUseId: streamEvent.id, fragment: streamEvent.inputFragment };
      }

      case 'tool_use_stop': {
        const block = this.toolUseBlocks.get(streamEvent.id);
        let parsedInput: unknown = {};
        if (block) {
          try {
            parsedInput = block.inputJson ? JSON.parse(block.inputJson) : {};
          } catch {
            parsedInput = {};
          }
        }
        return {
          type: 'tool_use_complete',
          toolUseId: streamEvent.id,
          toolName: block?.name ?? '',
          input: parsedInput,
        };
      }

      case 'usage':
        return {
          type: 'usage',
          usage: streamEvent.usage,
          cumulative: {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalCacheCreationTokens: 0,
            totalCacheReadTokens: 0,
            turnCount: 0,
          },
        };

      case 'message_stop':
        // Handled separately by the loop for stop reason extraction
        return null;

      default:
        return null;
    }
  }

  /** Reset state between turns. */
  reset(): void {
    this.toolUseBlocks.clear();
  }
}
