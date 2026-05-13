import { MarkdownMemoryStore, type MarkdownMemoryFile } from './MarkdownMemoryStore.js';
import type { MemoryEntry, MemoryCategory } from '../types/memory.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';

/**
 * Sprint 4 §5.4 — LongTermMemory (L3).
 *
 * Previously backed by `bun:sqlite` (Sprint 1). Now delegates to
 * `MarkdownMemoryStore` so each entry is a human-readable `.md` file under
 * `.kyberkit/memories/<category>/<slug>.md`. The manual `save()` entry
 * point is intentionally removed (D4 — extract-only write path).
 */
export class LongTermMemory {
  private readonly store: MarkdownMemoryStore;

  constructor(
    private readonly rootDir: string,
    eventBus: TypedEventBus<KyberEvents>,
  ) {
    this.store = new MarkdownMemoryStore(rootDir, eventBus);
  }

  /** Filesystem root for this long-term memory (for callers / tests). */
  getRootDir(): string {
    return this.rootDir;
  }

  /** Low-level accessor used by `LongTermMemoryExtractor` / `/memory` commands. */
  getStore(): MarkdownMemoryStore {
    return this.store;
  }

  /**
   * Persist a memory entry. Used by the extractor and by the `/memory add`
   * slash command. Manual write during natural-language turns is discouraged.
   */
  async writeEntry(
    entry: MemoryEntry & { title: string; source: 'auto' | 'manual'; tags?: string[] },
  ): Promise<void> {
    const ts = new Date(entry.timestamp).toISOString();
    await this.store.write({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      tags: entry.tags,
      createdAt: ts,
      updatedAt: ts,
      source: entry.source,
      score: entry.score,
      body: entry.content,
    });
  }

  async findByCategory(category: MemoryCategory, limit = 20): Promise<MemoryEntry[]> {
    const files = await this.store.findByCategory(category, limit);
    return files.map(toEntry);
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const files = await this.store.search(query, limit);
    return files.map(toEntry);
  }

  async list(): Promise<MemoryEntry[]> {
    const files = await this.store.list();
    return files.map(toEntry);
  }

  async remove(id: string): Promise<boolean> {
    return this.store.remove(id);
  }

  /**
   * Eviction: removes entries older than `maxAgeMs` (by `updatedAt`) and
   * trims to `maxEntries` most-recent overall.
   *
   * Kept async (was sync in Sprint 1) since filesystem access is inherent.
   */
  async prune(maxAgeMs: number, maxEntries: number): Promise<void> {
    await this.store.prune(maxAgeMs, maxEntries);
  }

  /** No persistent handle to close in Markdown mode. Kept for API parity. */
  close(): void {
    // no-op
  }
}

function toEntry(f: MarkdownMemoryFile): MemoryEntry {
  return {
    id: f.id,
    category: f.category,
    content: f.body,
    timestamp: Date.parse(f.updatedAt) || 0,
    metadata: {
      title: f.title,
      tags: f.tags,
      source: f.source,
      path: f.path,
    },
    score: f.score,
  };
}
