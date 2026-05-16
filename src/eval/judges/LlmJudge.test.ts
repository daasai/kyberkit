// packages/kyberkit/src/eval/judges/LlmJudge.test.ts
import { describe, it, expect } from 'bun:test';
import { RuleBasedJudge } from './LlmJudge.js';

describe('RuleBasedJudge (Phase 1 minimal)', () => {
  it('passes when output contains required fields', async () => {
    const judge = new RuleBasedJudge();
    const verdict = await judge.evaluate(
      'Generate a PRD',
      JSON.stringify({ problem: 'real problem', users: ['PM'], solution: 'build it' }),
      'must contain problem, users, solution fields',
    );
    expect(verdict.passed).toBe(true);
    expect(verdict.score).toBeGreaterThan(0.5);
  });

  it('fails when output is empty', async () => {
    const judge = new RuleBasedJudge();
    const verdict = await judge.evaluate('Generate', '', 'must be non-empty');
    expect(verdict.passed).toBe(false);
    expect(verdict.score).toBeLessThan(0.5);
  });

  it('can be replaced with a custom judge without changing EvalRuntime', async () => {
    const { DefaultEvalRuntime } = await import('../EvalRuntime.js');
    const customJudge = {
      evaluate: async () => ({ passed: true, score: 1.0, reasoning: 'custom' }),
    };
    const runtime = new DefaultEvalRuntime();
    expect(() => runtime.setJudge(customJudge)).not.toThrow();
  });
});
