import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { mkdirSync } from 'fs';
import { MemoryEntry, MemoryCategory } from '../types/memory.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';

/**
 * [R1.4] LongTermMemory (L3) - Persistent SQLite-based cross-session store.
 * [CC-Aligned]: Stores structured knowledge with category indexing.
 * Uses bun:sqlite for native compatibility.
 */
export class LongTermMemory {
  private readonly db: Database;

  constructor(
    dbPath: string,
    private readonly eventBus: TypedEventBus<KyberEvents>
  ) {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        score REAL DEFAULT 1.0
      );
      CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp);
    `);
  }

  /** Persist a memory entry into L3. */
  save(entry: MemoryEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (id, category, content, timestamp, metadata, score)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.category,
      entry.content,
      entry.timestamp,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.score ?? 1.0
    );

    this.eventBus.emit('memory.written', { tierId: 'L3', entryId: entry.id });
  }

  /** Retrieve entries by category. */
  findByCategory(category: MemoryCategory, limit: number = 20): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE category = ? ORDER BY timestamp DESC LIMIT ?
    `);
    
    return (stmt.all(category, limit) as any[]).map(row => this.rowToEntry(row));
  }

  /** Search content (simple LIKE search for now, could be FTS5). */
  search(query: string, limit: number = 10): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories WHERE content LIKE ? ORDER BY score DESC, timestamp DESC LIMIT ?
    `);

    return (stmt.all(`%${query}%`, limit) as any[]).map(row => this.rowToEntry(row));
  }

  /** 
   * [R1.4] Eviction policy.
   * Prunes entries by age (TTL) or count (LRU).
   */
  prune(maxAgeMs: number, maxEntries: number): void {
    const now = Date.now();
    
    // Time-based eviction
    const ageResult = this.db.prepare('DELETE FROM memories WHERE timestamp < ?').run(now - maxAgeMs);
    
    // Count-based eviction
    const countResult = this.db.prepare(`
      DELETE FROM memories WHERE id IN (
        SELECT id FROM memories ORDER BY timestamp DESC OFFSET ?
      )
    `).run(maxEntries);

    const totalEvicted = (ageResult as any).changes + (countResult as any).changes;
    if (totalEvicted > 0) {
      this.eventBus.emit('memory.evicted', { 
        tierId: 'L3', 
        count: totalEvicted, 
        policy: 'composite_ttl_lru' 
      });
    }
  }

  private rowToEntry(row: any): MemoryEntry {
    return {
      id: row.id,
      category: row.category as MemoryCategory,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      score: row.score,
    };
  }

  close(): void {
    this.db.close();
  }
}
