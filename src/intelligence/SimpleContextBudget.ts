import { ContextBudget, ContextEntry } from '../types/intelligence.js';
import { ContextBudgetExceededError } from './errors.js';

export class SimpleContextBudget implements ContextBudget {
  private limit: number = 0;

  setLimit(maxTokens: number): void {
    this.limit = maxTokens;
  }

  assemble(entries: ContextEntry[]): { assembled: ContextEntry[]; dropped: ContextEntry[]; totalTokens: number } {
    // Sort ascending by priority. Priority 0 is highest.
    const sorted = [...entries].sort((a, b) => a.priority - b.priority);

    const assembled: ContextEntry[] = [];
    const dropped: ContextEntry[] = [];
    let totalTokens = 0;

    for (const entry of sorted) {
      if (totalTokens + entry.tokenCount <= this.limit) {
        assembled.push(entry);
        totalTokens += entry.tokenCount;
      } else {
        if (entry.priority === 0) {
          throw new ContextBudgetExceededError(totalTokens + entry.tokenCount, this.limit);
        }
        dropped.push(entry);
      }
    }

    return { assembled, dropped, totalTokens };
  }
}
