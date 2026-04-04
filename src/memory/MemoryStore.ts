import { WorkingMemory } from './WorkingMemory.js';
import { SessionMemory } from './SessionMemory.js';
import { LongTermMemory } from './LongTermMemory.js';
import { MemoryEntry, MemoryCategory, MemoryFlushTrigger } from '../types/memory.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { randomUUID } from 'crypto';

export interface MemoryStoreConfig {
  sessionFile: string;
  dbFile: string;
  flushTrigger: MemoryFlushTrigger;
  eventBus: TypedEventBus<KyberEvents>;
}

/**
 * [R1.5] MemoryStore - Unified facade for tiered memory management.
 * [CC-Aligned]: Coordinates L1 (Working), L2 (Session), and L3 (Long-Term).
 */
export class MemoryStore {
  private readonly l1: WorkingMemory;
  private readonly l2: SessionMemory;
  private readonly l3: LongTermMemory;

  constructor(config: MemoryStoreConfig) {
    this.l1 = new WorkingMemory(100);
    this.l2 = new SessionMemory(config.sessionFile, config.flushTrigger, config.eventBus);
    this.l3 = new LongTermMemory(config.dbFile, config.eventBus);
  }

  /** Initialize persistent stores. */
  async init(): Promise<void> {
    await this.l2.restore();
  }

  /** 
   * [R1.5] Learn: Route a new observation to all appropriate tiers.
   * [C2]: Enforces MemoryCategory restriction.
   */
  async learn(category: MemoryCategory, content: string, metadata?: Record<string, any>): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: randomUUID(),
      category,
      content,
      timestamp: Date.now(),
      metadata,
    };

    // Route to all tiers
    this.l1.add(entry);
    await this.l2.push(entry);
    this.l3.save(entry);

    return entry;
  }

  /**
   * [R1.5] Recall by category across all tiers (deduplicated).
   */
  recallByCategory(category: MemoryCategory): MemoryEntry[] {
    const l1Results = this.l1.getByCategory(category);
    const l3Results = this.l3.findByCategory(category);
    
    // Simple deduplication by content (can be improved)
    const seen = new Set(l1Results.map(r => r.content));
    const merged = [...l1Results];
    
    for (const r of l3Results) {
      if (!seen.has(r.content)) {
        merged.push(r);
        seen.add(r.content);
      }
    }

    return merged.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Record a tool call to update session flush metadata.
   * [C1]: Triggers SessionMemory evaluation.
   */
  recordToolCall(): void {
    this.l2.recordToolCall();
  }

  /** 
   * [I1]: Generates the structured Markdown context string 
   * for inclusion in the model's system prompt.
   */
  getContext(): string {
    return this.l2.buildContextTemplate();
  }

  /** Flush SessionMemory manually. */
  async flush(): Promise<void> {
    await this.l2.flush();
  }

  prune(maxAgeMs: number, maxL3Entries: number): void {
    this.l3.prune(maxAgeMs, maxL3Entries);
  }

  close(): void {
    this.l3.close();
  }
}
