import { Database } from 'bun:sqlite';
import { createHash, randomUUID } from 'crypto';

/**
 * Local SQLite analytics: turns, tool steps, and raw agent events (see plan §Phase B).
 */
export class KyberAnalyticsDb {
  private readonly db: Database;

  constructor(readonly dbPath: string) {
    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS turns (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        user_text_hash TEXT NOT NULL,
        user_text_len INTEGER NOT NULL,
        user_text_preview TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        stop_reason TEXT,
        tool_calls INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        interrupted INTEGER DEFAULT 0,
        in_tokens INTEGER DEFAULT 0,
        out_tokens INTEGER DEFAULT 0,
        usd_cost REAL,
        narration_title TEXT,
        correction_flag INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        tool_use_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_hash TEXT,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        duration_ms INTEGER,
        ok INTEGER,
        error_category TEXT,
        in_tokens INTEGER,
        out_tokens INTEGER
      );
      CREATE TABLE IF NOT EXISTS trace_events (
        id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        step_id TEXT,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fs_events (
        id TEXT PRIMARY KEY,
        turn_id TEXT NOT NULL,
        task_id TEXT,
        tool_use_id TEXT,
        tool_name TEXT,
        path TEXT NOT NULL,
        kind TEXT NOT NULL,
        size_bytes INTEGER,
        preview TEXT,
        at_ms INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_turns_agent ON turns(agent_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_events_turn ON trace_events(turn_id, ts);
      CREATE INDEX IF NOT EXISTS idx_fs_turn ON fs_events(turn_id, at_ms);
      CREATE INDEX IF NOT EXISTS idx_fs_task ON fs_events(task_id, at_ms);
    `);
  }

  insertTurn(row: {
    id: string;
    agent_id: string;
    user_text_hash: string;
    user_text_len: number;
    user_text_preview: string | null;
    started_at: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO turns (id, agent_id, user_text_hash, user_text_len, user_text_preview, started_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        row.id,
        row.agent_id,
        row.user_text_hash,
        row.user_text_len,
        row.user_text_preview,
        row.started_at,
      );
  }

  markCorrectionOnTurn(turnId: string): void {
    this.db.prepare(`UPDATE turns SET correction_flag = 1 WHERE id = ?`).run(turnId);
  }

  appendEvent(row: {
    id: string;
    turn_id: string;
    step_id: string | null;
    ts: number;
    type: string;
    payload_json: string;
  }): void {
    this.db
      .prepare(
        `INSERT INTO trace_events (id, turn_id, step_id, ts, type, payload_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(row.id, row.turn_id, row.step_id, row.ts, row.type, row.payload_json);
  }

  /** Single row per tool invocation (written when the tool result is known). */
  recordToolStep(row: {
    turn_id: string;
    tool_use_id: string;
    tool_name: string;
    input_hash: string | null;
    started_at: number;
    ended_at: number;
    duration_ms: number;
    ok: boolean;
    error_category: string | null;
  }): void {
    const id = `${row.turn_id}_${row.tool_use_id}`;
    this.db
      .prepare(
        `INSERT OR REPLACE INTO steps (id, turn_id, tool_use_id, tool_name, input_hash, started_at, ended_at, duration_ms, ok, error_category)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        row.turn_id,
        row.tool_use_id,
        row.tool_name,
        row.input_hash,
        row.started_at,
        row.ended_at,
        row.duration_ms,
        row.ok ? 1 : 0,
        row.error_category,
      );
  }

  /**
   * Records a filesystem effect observed during a turn.
   * The source is tool input/output (e.g. `write_file`, `edit_file`), not direct fs watchers.
   * See `FsTelemetryTap` in TrajectoryRecorder for the detection rules.
   * Sprint 3.5 §5 — the deliverables dashboard reads from this table.
   */
  recordFsEvent(row: {
    turn_id: string;
    task_id: string | null;
    tool_use_id: string | null;
    tool_name: string | null;
    path: string;
    kind: 'create' | 'modify' | 'delete';
    size_bytes: number | null;
    preview: string | null;
    at_ms: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO fs_events (id, turn_id, task_id, tool_use_id, tool_name, path, kind, size_bytes, preview, at_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        row.turn_id,
        row.task_id,
        row.tool_use_id,
        row.tool_name,
        row.path,
        row.kind,
        row.size_bytes,
        row.preview,
        row.at_ms,
      );
  }

  /** Returns deliverables rolled up per path (latest kind wins). */
  queryFsEventsByTurn(turnId: string): Array<{
    path: string;
    kind: 'create' | 'modify' | 'delete';
    tool_name: string | null;
    size_bytes: number | null;
    preview: string | null;
    at_ms: number;
  }> {
    return this.db
      .prepare(
        `SELECT path, kind, tool_name, size_bytes, preview, at_ms FROM fs_events
         WHERE turn_id = ? ORDER BY at_ms ASC`,
      )
      .all(turnId) as any[];
  }

  queryFsEventsByTask(taskId: string): Array<{
    path: string;
    kind: 'create' | 'modify' | 'delete';
    tool_name: string | null;
    size_bytes: number | null;
    preview: string | null;
    at_ms: number;
  }> {
    return this.db
      .prepare(
        `SELECT path, kind, tool_name, size_bytes, preview, at_ms FROM fs_events
         WHERE task_id = ? ORDER BY at_ms ASC`,
      )
      .all(taskId) as any[];
  }

  /** Token totals persisted when {@link TrajectoryRecorder.finalizeTurn} runs (for TUI fallback). */
  getTurnTokenTotals(turnId: string): {
    in_tokens: number;
    out_tokens: number;
    tool_calls: number;
    usd_cost: number | null;
  } | null {
    const row = this.db
      .prepare(
        `SELECT in_tokens, out_tokens, tool_calls, usd_cost FROM turns WHERE id = ?`,
      )
      .get(turnId) as
      | {
          in_tokens: number;
          out_tokens: number;
          tool_calls: number;
          usd_cost: number | null;
        }
      | undefined;
    if (!row) return null;
    return {
      in_tokens: Number(row.in_tokens ?? 0) || 0,
      out_tokens: Number(row.out_tokens ?? 0) || 0,
      tool_calls: Number(row.tool_calls ?? 0) || 0,
      usd_cost: row.usd_cost == null ? null : Number(row.usd_cost),
    };
  }

  finalizeTurn(
    turnId: string,
    patch: {
      ended_at: number;
      stop_reason: string | null;
      tool_calls: number;
      errors: number;
      interrupted: boolean;
      in_tokens: number;
      out_tokens: number;
      usd_cost: number | null;
      narration_title: string | null;
    },
  ): void {
    this.db
      .prepare(
        `UPDATE turns SET
          ended_at = ?,
          stop_reason = ?,
          tool_calls = ?,
          errors = ?,
          interrupted = ?,
          in_tokens = ?,
          out_tokens = ?,
          usd_cost = COALESCE(?, usd_cost),
          narration_title = COALESCE(?, narration_title)
        WHERE id = ?`,
      )
      .run(
        patch.ended_at,
        patch.stop_reason,
        patch.tool_calls,
        patch.errors,
        patch.interrupted ? 1 : 0,
        patch.in_tokens,
        patch.out_tokens,
        patch.usd_cost,
        patch.narration_title,
        turnId,
      );
  }

  queryTurnStats(agentId: string, sinceMs: number): {
    turnCount: number;
    avgDurationMs: number;
    avgToolCalls: number;
    correctionRate: number;
    interruptRate: number;
  } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) AS c,
           AVG(COALESCE(ended_at, started_at) - started_at) AS avgdur,
           AVG(tool_calls) AS avgtools,
           AVG(correction_flag) AS corr,
           AVG(interrupted) AS intr
         FROM turns
         WHERE agent_id = ? AND started_at >= ?`,
      )
      .get(agentId, Date.now() - sinceMs) as any;
    const c = Number(row?.c ?? 0) || 0;
    return {
      turnCount: c,
      avgDurationMs: c ? Number(row.avgdur ?? 0) : 0,
      avgToolCalls: c ? Number(row.avgtools ?? 0) : 0,
      correctionRate: c ? Number(row.corr ?? 0) : 0,
      interruptRate: c ? Number(row.intr ?? 0) : 0,
    };
  }

  queryToolErrors(agentId: string, sinceMs: number, limit: number): Array<{ tool_name: string; fails: number; runs: number }> {
    const since = Date.now() - sinceMs;
    return this.db
      .prepare(
        `SELECT s.tool_name AS tool_name,
                SUM(CASE WHEN s.ok = 0 THEN 1 ELSE 0 END) AS fails,
                COUNT(*) AS runs
         FROM steps s
         JOIN turns t ON t.id = s.turn_id
         WHERE t.agent_id = ? AND s.started_at >= ?
         GROUP BY s.tool_name
         ORDER BY fails DESC
         LIMIT ?`,
      )
      .all(agentId, since, limit) as any[];
  }

  exportEventsJsonlSince(sinceMs: number): Iterable<{ line: string }> {
    const since = Date.now() - sinceMs;
    const rows = this.db
      .prepare(`SELECT payload_json FROM trace_events WHERE ts >= ? ORDER BY ts ASC`)
      .all(since) as { payload_json: string }[];
    return rows.map((r) => ({ line: r.payload_json }));
  }

  close(): void {
    this.db.close();
  }
}

export function hashUserText(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 24);
}

export function previewUserText(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export function categorizeToolError(result: string, isError: boolean): string | null {
  if (!isError) return null;
  const r = result.toLowerCase();
  if (r.includes('unknown tool')) return 'tool_not_found';
  if (r.includes('validation failed') || r.includes('invalid')) return 'schema_mismatch';
  if (r.includes('timed out') || r.includes('timeout')) return 'timeout';
  if (r.includes('permission denied') || r.includes('denied')) return 'permission';
  if (r.includes('aborted')) return 'runtime';
  return 'other';
}

export function newEventId(): string {
  return randomUUID();
}
