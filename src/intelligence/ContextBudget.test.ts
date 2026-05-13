import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleContextBudget } from './SimpleContextBudget.js';
import { ContextEntry } from '../types/intelligence.js';
import { ContextBudgetExceededError } from './errors.js';

describe('SimpleContextBudget (Red Phase)', () => {
  let budget: SimpleContextBudget;

  beforeEach(() => {
    budget = new SimpleContextBudget();
  });

  it('should assemble entries within budget sorted by priority', () => {
    budget.setLimit(1000);
    const entries: ContextEntry[] = [
      { id: '3', source: 'dynamic', content: 'c3', tokenCount: 500, priority: 2 },
      { id: '1', source: 'static', content: 'c1', tokenCount: 400, priority: 0 },
      { id: '2', source: 'static', content: 'c2', tokenCount: 200, priority: 1 },
    ];

    const result = budget.assemble(entries);
    
    // Total required is 1100. Budget is 1000.
    // P0 (400) + P1 (200) = 600.
    // P2 (500) will be dropped because 600 + 500 = 1100 > 1000.
    expect(result.assembled.length).toBe(2);
    expect(result.dropped.length).toBe(1);
    expect(result.dropped[0].id).toBe('3');
    expect(result.totalTokens).toBe(600);
  });

  it('should throw ContextBudgetExceededError if P0 exceeds limit', () => {
    budget.setLimit(100);
    const entries: ContextEntry[] = [
      { id: '1', source: 'static', content: 'c1', tokenCount: 150, priority: 0 },
    ];

    expect(() => budget.assemble(entries)).toThrow(ContextBudgetExceededError);
  });
});
