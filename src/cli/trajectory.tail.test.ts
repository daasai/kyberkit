import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { fetchLatestTaskEvents, formatTaskEventRow } from './trajectory.command.js';

describe('trajectory tail helpers', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kyber-traj-'));
    dbPath = join(dir, 'traces.db');
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        task_type TEXT,
        event_type TEXT NOT NULL,
        stage TEXT,
        payload_json TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
    `);
    db.prepare(
      `INSERT INTO task_events (task_id, task_type, event_type, stage, payload_json, ts)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).run('tid-1', 'first_encounter', 'task.progress', 'scanning', '{}', 1_700_000_000_000);
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('fetchLatestTaskEvents returns rows in chronological order', () => {
    const rows = fetchLatestTaskEvents(5, dbPath);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event_type).toBe('task.progress');
    expect(formatTaskEventRow(rows[0]!)).toContain('first_encounter');
    expect(formatTaskEventRow(rows[0]!)).toContain('scanning');
  });
});
