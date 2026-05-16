import { describe, it, expect } from 'bun:test';
import type { SkillEngine } from './SkillEngine.js';
import type { WorkContext } from './WorkContext.js';
import { NoopSkillEngine } from './SkillEngine.js';

describe('SkillEngine interface', () => {
  it('NoopSkillEngine satisfies the interface', async () => {
    const engine: SkillEngine = new NoopSkillEngine();

    const ctx: WorkContext = {
      session: { signals: [], turns: 0 },
      workspace: { work_type: 'test', accepted_patterns: [], candidate_patterns: [], artifact_history_count: 0 },
    };

    const effect = await engine.execute('nonexistent_skill', ctx);
    expect(effect.applied).toBe(false);

    await expect(engine.ingestFeedback({ signal_type: 'accepted', signal_context: 'ok', strength: 0.5 })).resolves.toBeUndefined();

    const drafts = await engine.suggestFromPatterns(ctx);
    expect(Array.isArray(drafts)).toBe(true);
    expect(drafts).toHaveLength(0);
  });

  it('ingestFeedback accepts generic FeedbackSignal only', async () => {
    const engine = new NoopSkillEngine();
    const signal = { signal_type: 'modified' as const, signal_context: 'ctx', strength: 0.9 };
    await expect(engine.ingestFeedback(signal)).resolves.toBeUndefined();
  });
});
