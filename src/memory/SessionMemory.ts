import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { MemoryEntry, MemorySection, MemoryFlushTrigger, MemoryCategory } from '../types/memory.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';

interface SessionMetadata {
  tokenCount: number;
  toolCallCount: number;
}

/**
 * [R1.3] SessionMemory (L2) - Persistent, mission-critical session store.
 * [C1]: Replaces debounced flush with token/tool-call thresholds.
 * [I1]: Generates structured context using 8 fixed sections.
 */
export class SessionMemory {
  private entries: MemoryEntry[] = [];
  private metadata: SessionMetadata = { tokenCount: 0, toolCallCount: 0 };
  private pendingCount: number = 0;
  private readonly filePath: string;
  private readonly trigger: MemoryFlushTrigger;
  private flushTimer: NodeJS.Timeout | null = null;
  private isDirty: boolean = false;

  constructor(
    filePath: string,
    trigger: MemoryFlushTrigger,
    private readonly eventBus: TypedEventBus<KyberEvents>
  ) {
    this.filePath = filePath;
    this.trigger = trigger;
  }

  /** Add an entry to session memory and evaluate flush triggers. */
  async push(entry: MemoryEntry): Promise<void> {
    this.entries.push(entry);
    this.pendingCount++;
    this.metadata.tokenCount += this.estimateTokenCount(entry.content);
    this.isDirty = true;
    await this.evaluateTriggers();
  }

  recordToolCall(): void {
    this.metadata.toolCallCount++;
    this.evaluateTriggers().catch(console.error);
  }

  /** [C1] Evaluate if we should persist to disk. */
  private async evaluateTriggers(): Promise<void> {
    const shouldFlush = 
      this.metadata.tokenCount >= this.trigger.tokenThreshold ||
      this.metadata.toolCallCount >= this.trigger.toolCallThreshold;

    if (shouldFlush) {
      await this.flush();
    } else {
      this.scheduleDebouncedFlush();
    }
  }

  private scheduleDebouncedFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flush().catch(console.error);
    }, this.trigger.debounceMs);
  }

  /**
   * [R1.3] Persistence loop. 
   * [C1] Emits 'memory.session_flushed' on success.
   */
  async flush(): Promise<void> {
    if (!this.isDirty) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);

    try {
      await mkdir(dirname(this.filePath), { recursive: true });
      // Serialize with indentation for readability
      const data = JSON.stringify({
        entries: this.entries,
        metadata: this.metadata,
        timestamp: Date.now(),
      }, null, 2);

      // Simple persistence — (Atomic write-rename will be in CheckpointManager R2)
      await writeFile(this.filePath, data, 'utf-8');
      
      this.isDirty = false;
      this.pendingCount = 0;
      this.eventBus.emit('memory.session_flushed', {
        tokenCount: this.metadata.tokenCount,
        toolCallCount: this.metadata.toolCallCount,
      });
    } catch (error) {
      console.error('SessionMemory flush failed:', error);
    }
  }

  /**
   * [I1] Structured context builder.
   * Compiles memories into 8 deterministic Markdown sections.
   */
  buildContextTemplate(): string {
    const sections: Record<MemorySection, string[]> = {
      [MemorySection.CURRENT_TASK]: [],
      [MemorySection.USER_PREFERENCES]: [],
      [MemorySection.PROJECT_CONTEXT]: [],
      [MemorySection.TECHNICAL_CONSTRAINTS]: [],
      [MemorySection.PAST_INTERACTIONS]: [],
      [MemorySection.ERRORS_AND_LEARNINGS]: [],
      [MemorySection.PENDING_QUESTIONS]: [],
      [MemorySection.RELIABILITY_STATUS]: [],
    };

    // Map categories/metadata to sections (simplified heuristic)
    for (const entry of this.entries) {
      const section = this.mapEntryToSection(entry);
      sections[section].push(`- ${entry.content}`);
    }

    return Object.entries(sections)
      .map(([name, items]) => items.length > 0 ? `## ${name}\n\n${items.join('\n')}` : '')
      .filter(Boolean)
      .join('\n\n');
  }

  /** Heuristic mapping (CC-like). */
  private mapEntryToSection(entry: MemoryEntry): MemorySection {
    if (entry.category === 'user') return MemorySection.USER_PREFERENCES;
    if (entry.category === 'project') return MemorySection.PROJECT_CONTEXT;
    if (entry.category === 'feedback') return MemorySection.PAST_INTERACTIONS;
    return MemorySection.CURRENT_TASK; // Default
  }

  private estimateTokenCount(text: string): number {
    // Simple 4-char per token heuristic
    return Math.ceil(text.length / 4);
  }

  async restore(): Promise<void> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(content);
      this.entries = data.entries || [];
      this.metadata = data.metadata || { tokenCount: 0, toolCallCount: 0 };
      this.isDirty = false;
    } catch (e) {
      // File missing or corrupt — start fresh
    }
  }

  clear(): void {
    this.entries = [];
    this.metadata = { tokenCount: 0, toolCallCount: 0 };
    this.isDirty = true;
  }
}
