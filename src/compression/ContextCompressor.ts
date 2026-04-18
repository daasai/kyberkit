import type { ChatMessage, ModelProvider } from '../types/model.js';
import type {
  CompactOptions,
  CompactResult,
  CompactionDecision,
  TokenBudget,
} from '../types/compression.js';
import { RoundGrouping } from './RoundGrouping.js';
import { SessionMemoryCompactor } from './SessionMemoryCompactor.js';
import { LLMSummaryCompactor } from './LLMSummaryCompactor.js';
import type { SessionMemory } from '../memory/SessionMemory.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';

export interface ContextCompressorDeps {
  model: ModelProvider;
  sessionMemory: SessionMemory;
  eventBus: TypedEventBus<KyberEvents>;
  mainModelName: string;
  compactModelName?: string;
}

function noopResult(messages: ChatMessage[]): CompactResult {
  const tokens = ContextCompressor.estimateTotal(messages);
  return {
    messages,
    summary: '',
    strategy: 'noop',
    tokensBefore: tokens,
    tokensAfter: tokens,
    success: true,
  };
}

export class ContextCompressor {
  private readonly llmCompactor: LLMSummaryCompactor;
  private readonly sessionCompactor: SessionMemoryCompactor;

  constructor(private readonly deps: ContextCompressorDeps) {
    this.llmCompactor = new LLMSummaryCompactor({
      model: deps.model,
      modelName: deps.compactModelName ?? deps.mainModelName,
      fallbackModelName: deps.mainModelName,
    });
    this.sessionCompactor = new SessionMemoryCompactor(deps.sessionMemory);
  }

  static estimateTotal(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => sum + RoundGrouping.estimateTokens(m), 0);
  }

  shouldCompact(messages: ChatMessage[], budget: TokenBudget): CompactionDecision {
    const currentTokens = ContextCompressor.estimateTotal(messages);
    if (currentTokens >= budget.hardThreshold) {
      return {
        shouldCompact: true,
        reason: 'hard_threshold',
        currentTokens,
        threshold: budget.hardThreshold,
      };
    }
    return {
      shouldCompact: false,
      reason: 'below_threshold',
      currentTokens,
      threshold: budget.hardThreshold,
    };
  }

  async compact(
    messages: ChatMessage[],
    budget: TokenBudget,
    options: CompactOptions,
  ): Promise<CompactResult> {
    const rounds = RoundGrouping.group(messages);
    const keepIdx = RoundGrouping.calculateKeepIndex(
      rounds,
      budget.targetAfterCompact,
      options.keepRecentRounds,
    );
    if (keepIdx <= 0) {
      return noopResult(messages);
    }

    const toCompress = messages.slice(0, keepIdx);
    const toKeep = messages.slice(keepIdx);

    if (options.preferSessionMemory) {
      try {
        const result = await this.sessionCompactor.compact(toCompress, toKeep, options);
        if (result.success) {
          this.emitCompacted(result);
          return result;
        }
      } catch {
        // fallback to LLM summary compactor
      }
    }

    const llmResult = await this.llmCompactor.compact(toCompress, toKeep, options);
    this.emitCompacted(llmResult);
    return llmResult;
  }

  private emitCompacted(result: CompactResult): void {
    this.deps.eventBus.emit('context.compacted', {
      strategy: result.strategy,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      saved: result.tokensBefore - result.tokensAfter,
    });
  }
}
