import type { ChatMessage, ModelProvider } from '../types/model.js';
import type { CompactOptions, CompactResult } from '../types/compression.js';
import { RoundGrouping } from './RoundGrouping.js';

interface LLMSummaryCompactorDeps {
  model: ModelProvider;
  modelName: string;
  fallbackModelName: string;
}

const COMPACT_SYSTEM_PROMPT = `You summarize earlier conversation turns while preserving task continuity.
Keep goals, decisions, constraints, file paths, tool outcomes, and unresolved issues.
Remove filler and repetition.
Return plain text only.`;

function estimateTotal(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + RoundGrouping.estimateTokens(m), 0);
}

export class LLMSummaryCompactor {
  constructor(private readonly deps: LLMSummaryCompactorDeps) {}

  async compact(
    toCompress: ChatMessage[],
    toKeep: ChatMessage[],
    options: CompactOptions,
  ): Promise<CompactResult> {
    const before = estimateTotal([...toCompress, ...toKeep]);
    if (toCompress.length === 0) {
      return {
        messages: toKeep,
        summary: '',
        strategy: 'noop',
        tokensBefore: before,
        tokensAfter: estimateTotal(toKeep),
        success: true,
      };
    }

    const summary = await this.summarize(toCompress, options);
    const compacted: ChatMessage[] = [
      {
        role: 'user',
        content: `<conversation-summary>\n${summary}\n</conversation-summary>`,
      },
      ...toKeep,
    ];
    return {
      messages: compacted,
      summary,
      strategy: 'llm_summary',
      tokensBefore: before,
      tokensAfter: estimateTotal(compacted),
      success: true,
    };
  }

  private async summarize(messages: ChatMessage[], options: CompactOptions): Promise<string> {
    const model = options.compactModel ?? this.deps.modelName;
    const maxTokens = options.maxSummaryTokens ?? 1024;
    let chunks: string[] = [];

    try {
      for await (const ev of this.deps.model.chatStream({
        model,
        systemPrompt: COMPACT_SYSTEM_PROMPT,
        messages,
        tools: [],
        maxTokens,
      })) {
        if (ev.type === 'text_delta') chunks.push(ev.text);
      }
    } catch (error) {
      if (model === this.deps.fallbackModelName) {
        throw error;
      }
      chunks = [];
      for await (const ev of this.deps.model.chatStream({
        model: this.deps.fallbackModelName,
        systemPrompt: COMPACT_SYSTEM_PROMPT,
        messages,
        tools: [],
        maxTokens,
      })) {
        if (ev.type === 'text_delta') chunks.push(ev.text);
      }
    }

    return chunks.join('').trim();
  }
}
