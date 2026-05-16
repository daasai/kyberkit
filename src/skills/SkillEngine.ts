import type { FeedbackSignal } from './FeedbackSignal.js';
import type { WorkContext } from './WorkContext.js';

export interface SkillEffect {
  applied: boolean;
  summary?: string;
}

export interface SkillDraft {
  draft_id: string;
  title: string;
  description: string;
  proposed_content: string;
  confidence: number;
  source_signal_count: number;
}

/**
 * Unified interface for the Skill subsystem.
 * Consolidates execute, ingestFeedback, and suggestFromPatterns
 * into a single entry point.
 *
 * Kevin Product layer creates a concrete implementation that wires
 * existing SkillRegistry, LearningLoopMiddleware, and WorkPatternStore.
 */
export interface SkillEngine {
  execute(skillId: string, context: WorkContext): Promise<SkillEffect>;
  ingestFeedback(signal: FeedbackSignal): Promise<void>;
  suggestFromPatterns(context: WorkContext): Promise<SkillDraft[]>;
}

/**
 * No-operation implementation for tests and headless contexts.
 */
export class NoopSkillEngine implements SkillEngine {
  async execute(_skillId: string, _context: WorkContext): Promise<SkillEffect> {
    return { applied: false, summary: 'noop' };
  }

  async ingestFeedback(_signal: FeedbackSignal): Promise<void> {}

  async suggestFromPatterns(_context: WorkContext): Promise<SkillDraft[]> {
    return [];
  }
}
