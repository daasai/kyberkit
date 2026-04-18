import { WorkingMemory } from './WorkingMemory.js';
import { SessionMemory } from './SessionMemory.js';
import { LongTermMemory } from './LongTermMemory.js';
import type { MemoryEntry, MemoryCategory, MemoryFlushTrigger } from '../types/memory.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { randomUUID } from 'crypto';

export interface MemoryStoreConfig {
  sessionFile: string;
  /** Directory for `.kyberkit/memories/<category>/*.md`. */
  memoriesDir: string;
  flushTrigger: MemoryFlushTrigger;
  eventBus: TypedEventBus<KyberEvents>;
}

/**
 * Sprint 4 — MemoryStore facade over three memory tiers.
 *
 * - L1 WorkingMemory: in-memory ring
 * - L2 SessionMemory: JSON notes + auto-extracted Markdown
 * - L3 LongTermMemory: Markdown files on disk
 *
 * Auto-writes to L3 are driven by `LongTermMemoryExtractor`; the legacy
 * `learn()` helper is kept only for backward compatibility with pre-Sprint-4
 * callers / tests.
 */
export class MemoryStore {
  private readonly l1: WorkingMemory;
  private readonly l2: SessionMemory;
  private readonly l3: LongTermMemory;

  constructor(config: MemoryStoreConfig) {
    this.l1 = new WorkingMemory(100);
    this.l2 = new SessionMemory(config.sessionFile, config.flushTrigger, config.eventBus);
    this.l3 = new LongTermMemory(config.memoriesDir, config.eventBus);
  }

  async init(): Promise<void> {
    await this.l2.restore();
  }

  /**
   * @deprecated Sprint 4 — prefer `LongTermMemoryExtractor` (auto) or
   * `/memory add` (manual). Retained for pre-Sprint-4 tests / scripts.
   */
  async learn(
    category: MemoryCategory,
    content: string,
    metadata?: Record<string, any>,
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      category,
      content,
      timestamp: Date.now(),
      metadata,
    };
    this.l1.add(entry);
    const title = (metadata?.title as string | undefined)
      ?? content.split('\n')[0].slice(0, 60)
      ?? 'memory';
    await this.l3.writeEntry({ ...entry, title, source: 'manual', tags: metadata?.tags });
    return entry;
  }

  /**
   * Recall by category across L1 + L3 (deduplicated by content).
   * L2 is excluded — it holds transient Markdown notes, not discrete entries.
   */
  async recallByCategory(category: MemoryCategory): Promise<MemoryEntry[]> {
    const l1Results = this.l1.getByCategory(category);
    const l3Results = await this.l3.findByCategory(category);

    const seen = new Set(l1Results.map((r) => r.content));
    const merged = [...l1Results];
    for (const r of l3Results) {
      if (!seen.has(r.content)) {
        merged.push(r);
        seen.add(r.content);
      }
    }
    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }

  recordToolCall(): void {
    this.l2.recordToolCall();
  }

  /** Structured session Markdown used as system-prompt context. */
  getContext(): string {
    return this.l2.buildContextTemplate();
  }

  getSessionMemory(): SessionMemory {
    return this.l2;
  }

  getLongTermMemory(): LongTermMemory {
    return this.l3;
  }

  async flush(): Promise<void> {
    await this.l2.flush();
  }

  async prune(maxAgeMs: number, maxL3Entries: number): Promise<void> {
    await this.l3.prune(maxAgeMs, maxL3Entries);
  }

  close(): void {
    this.l3.close();
  }
}
