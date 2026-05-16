// packages/kyberkit/src/eval/judges/LlmJudge.ts
import type { Judge, JudgeVerdict } from '../EvalRuntime.js';

/**
 * Phase 1 rule-based Judge.
 * Checks structural criteria (non-empty, required keywords) without LLM calls.
 * Replace with an LLM-backed implementation by passing a ModelProvider.
 */
export class RuleBasedJudge implements Judge {
  async evaluate(
    _prompt: string,
    output: string,
    criteria: string,
  ): Promise<JudgeVerdict> {
    if (!output.trim()) {
      return { passed: false, score: 0.0, reasoning: 'Output is empty.' };
    }

    const requiredMatch = criteria.match(/must contain (.+)/i);
    if (requiredMatch) {
      // Split by commas and whitespace; strip common English meta-descriptors
      // that appear at the end of criteria like "…solution fields" or "…key attributes"
      const STOP_WORDS = new Set(['fields', 'field', 'keys', 'key', 'attributes', 'attribute', 'properties', 'property', 'values', 'value', 'and', 'or', 'the', 'a', 'an']);
      const tokens = requiredMatch[1]
        .split(/[,\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => Boolean(t) && !STOP_WORDS.has(t));
      const lower = output.toLowerCase();
      const missing = tokens.filter((t) => !lower.includes(t));
      if (missing.length > 0) {
        return {
          passed: false,
          score: 1 - missing.length / tokens.length,
          reasoning: `Missing required content: ${missing.join(', ')}`,
        };
      }
    }

    return {
      passed: true,
      score: 1.0,
      reasoning: 'All structural criteria satisfied.',
    };
  }
}
