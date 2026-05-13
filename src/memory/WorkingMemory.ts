import { MemoryEntry, MemoryCategory } from '../types/memory';

/**
 * [R1.2] WorkingMemory (L1) - Fast, in-memory ephemeral store.
 * Used for short-term context during a single agent session.
 * Features:
 * - Simple priority/recency ranking
 * - LRU-style eviction if maxEntries exceeded
 */
export class WorkingMemory {
  private entries: Map<string, MemoryEntry> = new Map();
  private readonly maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  /** Register a new memory entry into working memory. */
  add(entry: MemoryEntry): void {
    if (this.entries.size >= this.maxEntries) {
      // Basic LRU: Remove oldest entry (first key in insertion-ordered Map)
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey) this.entries.delete(oldestKey);
    }
    this.entries.set(entry.id, entry);
  }

  /** Retrieve all entries in working memory. */
  list(): MemoryEntry[] {
    return Array.from(this.entries.values());
  }

  /** Filter entries by category. */
  getByCategory(category: MemoryCategory): MemoryEntry[] {
    return this.list().filter(e => e.category === category);
  }

  /** Clear all working memory. */
  clear(): void {
    this.entries.clear();
  }

  /** Remove specific entry. */
  remove(id: string): boolean {
    return this.entries.delete(id);
  }

  size(): number {
    return this.entries.size;
  }
}
