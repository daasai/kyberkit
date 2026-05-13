import type { ChatMessage } from './model.js';

export interface TokenBudget {
  contextWindow: number;
  hardThreshold: number;
  softThreshold: number;
  targetAfterCompact: number;
}

export interface CompactOptions {
  preferSessionMemory: boolean;
  keepRecentRounds: number;
  compactModel?: string;
  maxSummaryTokens?: number;
}

export type CompactStrategy = 'session_memory' | 'llm_summary' | 'noop';

export interface CompactResult {
  messages: ChatMessage[];
  summary: string;
  strategy: CompactStrategy;
  tokensBefore: number;
  tokensAfter: number;
  success: boolean;
  error?: string;
}

export interface CompactionDecision {
  shouldCompact: boolean;
  reason: 'hard_threshold' | 'manual' | 'below_threshold';
  currentTokens: number;
  threshold: number;
}
