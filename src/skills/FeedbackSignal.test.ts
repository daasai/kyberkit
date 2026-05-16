import { describe, it, expect } from 'bun:test';
import type { FeedbackSignal } from './FeedbackSignal.js';
import type { WorkContext } from './WorkContext.js';

describe('FeedbackSignal', () => {
  it('has no Kevin product types — only generic signal fields', () => {
    const signal: FeedbackSignal = {
      signal_type: 'accepted',
      signal_context: 'User accepted the generated outline',
      strength: 0.8,
    };
    expect(signal.signal_type).toBe('accepted');
    expect(signal.strength).toBeGreaterThanOrEqual(0);
    expect(signal.strength).toBeLessThanOrEqual(1);
  });

  it('WorkContext has three levels', () => {
    const ctx: WorkContext = {
      session: {
        signals: [],
        turns: 3,
        work_type: 'prd_generation',
      },
      workspace: {
        work_type: 'product_project_work',
        accepted_patterns: [],
        candidate_patterns: [],
        artifact_history_count: 5,
      },
    };
    expect(ctx.session.turns).toBe(3);
    expect(ctx.workspace.artifact_history_count).toBe(5);
    expect(ctx.task).toBeUndefined();
  });
});
