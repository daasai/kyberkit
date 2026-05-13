import { Database } from 'bun:sqlite';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';

export type GrowthKind = 'memory' | 'skill' | 'permit';

/**
 * Workspace-scoped, cross-session counters for Track B `AssetGrowthBanner`.
 * Lives under `<user>/.kyberkit/growth.sqlite` (not per-agent trajectory DB).
 */
export class WorkspaceGrowthStore {
  private readonly db: Database;

  constructor(readonly dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS growth_events (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        delta INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_growth_ts ON growth_events(ts);
      CREATE INDEX IF NOT EXISTS idx_growth_kind_ts ON growth_events(kind, ts);
    `);
  }

  /** Idempotent install — ensures parent dir exists. */
  static async ensurePath(dbPath: string): Promise<void> {
    await mkdir(dirname(dbPath), { recursive: true });
  }

  record(kind: GrowthKind, delta: number = 1): void {
    const id = crypto.randomUUID();
    this.db
      .prepare(`INSERT INTO growth_events (id, ts, kind, delta) VALUES (?, ?, ?, ?)`)
      .run(id, Date.now(), kind, delta);
  }

  /** Sum of deltas per kind since `sinceMs` (inclusive). */
  aggregateSince(sinceMs: number): { memories: number; skills: number; permits: number } {
    const row = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN kind = 'memory' THEN delta ELSE 0 END) AS m,
           SUM(CASE WHEN kind = 'skill' THEN delta ELSE 0 END) AS s,
           SUM(CASE WHEN kind = 'permit' THEN delta ELSE 0 END) AS p
         FROM growth_events WHERE ts >= ?`,
      )
      .get(sinceMs) as { m: number | null; s: number | null; p: number | null };
    return {
      memories: Number(row?.m ?? 0) || 0,
      skills: Number(row?.s ?? 0) || 0,
      permits: Number(row?.p ?? 0) || 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
