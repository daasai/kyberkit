import { describe, it, expect } from 'bun:test';
import { truncate, formatTokens, estimateCost, formatCost, previewJson } from './format.js';
import type { CumulativeUsage } from '../../types/agent-events.js';

describe('truncate', () => {
  it('returns string unchanged when shorter than limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });
  it('truncates and appends ellipsis when longer than limit', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
  });
  it('returns empty string unchanged', () => {
    expect(truncate('', 5)).toBe('');
  });
});

describe('formatTokens', () => {
  it('returns plain number for values < 1000', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });
  it('formats values >= 1000 with k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(12345)).toBe('12.3k');
  });
});

describe('estimateCost', () => {
  const base: CumulativeUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    turnCount: 0,
  };

  it('returns 0 for zero usage', () => {
    expect(estimateCost(base)).toBe(0);
  });

  it('calculates cost from input and output tokens', () => {
    const usage: CumulativeUsage = { ...base, totalInputTokens: 1_000_000, totalOutputTokens: 1_000_000 };
    // 1M input @ $3 + 1M output @ $15 = $18
    expect(estimateCost(usage)).toBeCloseTo(18, 4);
  });

  it('handles partial token counts correctly', () => {
    // 100k input @ $3/M = $0.30
    const usage: CumulativeUsage = { ...base, totalInputTokens: 100_000 };
    expect(estimateCost(usage)).toBeCloseTo(0.3, 4);
  });
});

describe('formatCost', () => {
  it('formats cost as dollar string with 4 decimal places', () => {
    expect(formatCost(0)).toBe('$0.0000');
    expect(formatCost(1.2345)).toBe('$1.2345');
  });
});

describe('previewJson', () => {
  it('serializes a simple object', () => {
    expect(previewJson({ a: 1 })).toBe('{"a":1}');
  });
  it('truncates long JSON', () => {
    const result = previewJson({ key: 'a'.repeat(200) }, 20);
    expect(result.length).toBeLessThanOrEqual(21); // 20 chars + ellipsis
  });
});
