import { Database } from 'bun:sqlite';
import { TrajectoryStore, TrajectoryEvent } from '../types/observability.js';

/**
 * SQLite-backed trajectory store using bun:sqlite for native compatibility.
 */
export class SqliteTrajectoryStore implements TrajectoryStore {
  private readonly db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trajectories (
        id TEXT PRIMARY KEY,
        traceId TEXT NOT NULL,
        spanId TEXT NOT NULL,
        parentSpanId TEXT,
        kind TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        durationMs INTEGER,
        payload TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_traj_traceId ON trajectories(traceId);
      CREATE INDEX IF NOT EXISTS idx_traj_timestamp ON trajectories(timestamp);
    `);
  }

  async saveBatch(events: TrajectoryEvent[]): Promise<void> {
    if (events.length === 0) return;
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trajectories (id, traceId, spanId, parentSpanId, kind, timestamp, durationMs, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((evts: TrajectoryEvent[]) => {
      for (const e of evts) {
        stmt.run(
          e.id, 
          e.traceId, 
          e.spanId, 
          e.parentSpanId || null, 
          e.kind, 
          e.timestamp, 
          e.durationMs || null, 
          JSON.stringify(e.payload)
        );
      }
    });

    transaction(events);
  }

  async getTrace(traceId: string): Promise<TrajectoryEvent[]> {
    const stmt = this.db.prepare('SELECT * FROM trajectories WHERE traceId = ? ORDER BY timestamp ASC');
    const rows = stmt.all(traceId) as any[];
    return rows.map(this.rowToEvent);
  }

  async queryRecentEvents(timeWindowMs: number): Promise<TrajectoryEvent[]> {
    const after = Date.now() - timeWindowMs;
    const stmt = this.db.prepare('SELECT * FROM trajectories WHERE timestamp >= ? ORDER BY timestamp ASC');
    const rows = stmt.all(after) as any[];
    return rows.map(this.rowToEvent);
  }

  async prune(retentionMs: number): Promise<number> {
    const cutoff = Date.now() - retentionMs;
    const result = this.db.prepare('DELETE FROM trajectories WHERE timestamp < ?').run(cutoff);
    return (result as any).changes;
  }

  private rowToEvent(row: any): TrajectoryEvent {
    return {
      id: row.id,
      traceId: row.traceId,
      spanId: row.spanId,
      parentSpanId: row.parentSpanId,
      kind: row.kind,
      timestamp: row.timestamp,
      durationMs: row.durationMs,
      payload: JSON.parse(row.payload)
    };
  }

  close(): void {
    this.db.close();
  }
}
