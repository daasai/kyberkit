import type { FeedbackSignal } from './FeedbackSignal.js';

export interface PatternRecord {
  pattern_id: string;
  work_type: string;
  description: string;
  confidence: number;   // 0.0–1.0
  signal_count: number;
  last_seen_at: number;
}

/**
 * Three-level cross-session context for suggestFromPatterns.
 * Level 1 (session) → freshest, highest immediate weight.
 * Level 2 (task)    → cross-session view of a single artifact/output.
 * Level 3 (workspace) → stable long-term preferences, highest confidence.
 */
export interface WorkContext {
  session: {
    signals: FeedbackSignal[];
    turns: number;
    work_type?: string;
  };
  task?: {
    output_id: string;
    accumulated_signals: FeedbackSignal[];
    sessions_count: number;
    work_type: string;
  };
  workspace: {
    work_type: string;
    accepted_patterns: PatternRecord[];
    candidate_patterns: PatternRecord[];
    artifact_history_count: number;
  };
}
