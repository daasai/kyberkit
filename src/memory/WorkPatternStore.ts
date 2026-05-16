import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import type { FeedbackSignal } from '../skills/FeedbackSignal.js';
import type { PatternRecord } from '../skills/WorkContext.js';

export interface SignalScope {
  session_id: string;
  /** Generic output/artifact ID. The calling layer maps its domain IDs to this. */
  output_id?: string;
  work_type: string;
}

export interface StoredSignalEntry {
  signal: FeedbackSignal;
  scope: SignalScope;
  stored_at: number;
}

interface PersistentStore {
  entries: StoredSignalEntry[];
}

export interface WorkPatternStore {
  appendSignal(signal: FeedbackSignal, scope: SignalScope): Promise<void>;
  getTaskSignals(outputId: string): Promise<FeedbackSignal[]>;
  getWorkspacePatterns(workType: string): Promise<PatternRecord[]>;
  promoteSessionSignals(sessionId: string): Promise<void>;
  scorePatternConfidence(pattern: PatternRecord): Promise<number>;
}

/**
 * JSON-file-backed WorkPatternStore for Phase 1.
 * Signals persist across process restarts.
 * Production: replace with SQLite at ~/.kevin/work-patterns/<space_id>/signals.sqlite
 */
export class JsonWorkPatternStore implements WorkPatternStore {
  private data: PersistentStore = { entries: [] };
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (existsSync(this.filePath)) {
      try {
        const raw = await readFile(this.filePath, 'utf-8');
        this.data = JSON.parse(raw) as PersistentStore;
      } catch {
        this.data = { entries: [] };
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  async appendSignal(signal: FeedbackSignal, scope: SignalScope): Promise<void> {
    await this.load();
    this.data.entries.push({ signal, scope, stored_at: Date.now() });
    await this.persist();
  }

  async getTaskSignals(outputId: string): Promise<FeedbackSignal[]> {
    await this.load();
    return this.data.entries
      .filter((e) => e.scope.output_id === outputId)
      .map((e) => e.signal);
  }

  async getWorkspacePatterns(workType: string): Promise<PatternRecord[]> {
    await this.load();
    const relevant = this.data.entries.filter((e) => e.scope.work_type === workType);

    // Group by simplified context key (first 5 words)
    const contextGroups = new Map<string, StoredSignalEntry[]>();
    for (const entry of relevant) {
      const key = entry.signal.signal_context
        .toLowerCase()
        .split(/\s+/)
        .slice(0, 5)
        .join(' ');
      const existing = contextGroups.get(key) ?? [];
      existing.push(entry);
      contextGroups.set(key, existing);
    }

    const patterns: PatternRecord[] = [];
    for (const [key, entries] of contextGroups) {
      const uniqueArtifacts = new Set(entries.map((e) => e.scope.output_id).filter(Boolean));
      const avgStrength = entries.reduce((sum, e) => sum + e.signal.strength, 0) / entries.length;
      // Confidence: artifact diversity × avg strength
      // 3 distinct artifacts × avg 0.85 strength → 0.85 > 0.7 threshold
      const confidence = Math.min(1.0, (uniqueArtifacts.size / 3) * avgStrength);

      patterns.push({
        pattern_id: `pattern_${key.replace(/\s+/g, '_').slice(0, 20)}`,
        work_type: workType,
        description: key,
        confidence,
        signal_count: entries.length,
        last_seen_at: Math.max(...entries.map((e) => e.stored_at)),
      });
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }

  async promoteSessionSignals(_sessionId: string): Promise<void> {
    // Signals are already persisted on append — no explicit promotion needed for JSON store.
    await this.load();
  }

  async scorePatternConfidence(pattern: PatternRecord): Promise<number> {
    return pattern.confidence;
  }
}
