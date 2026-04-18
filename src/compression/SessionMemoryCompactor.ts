import type { ChatMessage } from '../types/model.js';
import type { CompactOptions, CompactResult } from '../types/compression.js';
import type { SessionMemory } from '../memory/SessionMemory.js';
import { RoundGrouping } from './RoundGrouping.js';

function totalTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + RoundGrouping.estimateTokens(m), 0);
}

export class SessionMemoryCompactor {
  constructor(private readonly sessionMemory: SessionMemory) {}

  async compact(
    toCompress: ChatMessage[],
    toKeep: ChatMessage[],
    _options: CompactOptions,
  ): Promise<CompactResult> {
    const notes = this.sessionMemory.buildContextTemplate().trim();
    const before = totalTokens([...toCompress, ...toKeep]);

    if (notes.length < 50) {
      return {
        messages: [...toCompress, ...toKeep],
        summary: '',
        strategy: 'noop',
        tokensBefore: before,
        tokensAfter: before,
        success: false,
        error: 'session memory is too small for compaction',
      };
    }

    const compacted: ChatMessage[] = [
      {
        role: 'user',
        content: `<session-notes-summary>\n${notes}\n</session-notes-summary>`,
      },
      ...toKeep,
    ];

    return {
      messages: compacted,
      summary: notes,
      strategy: 'session_memory',
      tokensBefore: before,
      tokensAfter: totalTokens(compacted),
      success: true,
    };
  }
}
