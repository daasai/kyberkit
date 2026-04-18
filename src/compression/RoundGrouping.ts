import type { ChatMessage, MessageContent } from '../types/model.js';

export interface ApiRound {
  indices: number[];
  messages: ChatMessage[];
  hasToolUse: boolean;
  estimatedTokens: number;
}

function hasToolUseContent(message: ChatMessage): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((c) => c.type === 'tool_use');
}

function hasToolResultContent(message: ChatMessage): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((c) => c.type === 'tool_result');
}

function estimateContentTokens(content: string | MessageContent[]): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  let total = 0;
  for (const block of content) {
    if (block.type === 'text') {
      total += Math.ceil(block.text.length / 4);
      continue;
    }
    if (block.type === 'tool_use') {
      total += Math.ceil(JSON.stringify(block.input ?? {}).length / 4) + 12;
      continue;
    }
    if (block.type === 'tool_result') {
      total += Math.ceil(
        (typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content ?? [])).length / 4,
      ) + 12;
      continue;
    }
    if (block.type === 'image') {
      total += 256;
    }
  }
  return total;
}

export class RoundGrouping {
  static estimateTokens(message: ChatMessage): number {
    return estimateContentTokens(message.content);
  }

  static group(messages: ChatMessage[]): ApiRound[] {
    const rounds: ApiRound[] = [];
    let pending: Array<{ index: number; message: ChatMessage }> = [];
    let waitingToolResult = false;

    const flushRound = () => {
      if (pending.length === 0) return;
      const msgs = pending.map((x) => x.message);
      const idxs = pending.map((x) => x.index);
      rounds.push({
        indices: idxs,
        messages: msgs,
        hasToolUse: waitingToolResult || msgs.some(hasToolUseContent),
        estimatedTokens: msgs.reduce((n, m) => n + RoundGrouping.estimateTokens(m), 0),
      });
      pending = [];
      waitingToolResult = false;
    };

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'system') continue;

      pending.push({ index: i, message: msg });

      if (msg.role === 'assistant' && hasToolUseContent(msg)) {
        waitingToolResult = true;
        continue;
      }

      if (waitingToolResult) {
        if (msg.role === 'user' && hasToolResultContent(msg)) {
          flushRound();
        }
        continue;
      }

      flushRound();
    }

    flushRound();
    return rounds;
  }

  static calculateKeepIndex(
    rounds: ApiRound[],
    targetTokens: number,
    keepRecentRounds: number,
  ): number {
    if (rounds.length <= keepRecentRounds) {
      return 0;
    }

    let tokens = 0;
    let kept = 0;

    for (let i = rounds.length - 1; i >= 0; i--) {
      const next = rounds[i];
      const wouldExceed = tokens + next.estimatedTokens > targetTokens;
      if (kept >= keepRecentRounds && wouldExceed) {
        const nextRound = rounds[i + 1];
        return nextRound ? nextRound.indices[0] : 0;
      }
      tokens += next.estimatedTokens;
      kept++;
    }

    return 0;
  }
}
