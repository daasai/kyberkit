// packages/kyberkit/src/cli/trajectory.command.test.ts
//
// Hotfix Sprint 2.5: the previous tests targeted an older store-based
// `tailTrajectory`/`exportTrajectory` API that was removed when this
// module was rewritten to read the Kevin task_events SQLite database
// (commit 88be877). These smoke tests cover the new public surface:
// fetchLatestTaskEvents / formatTaskEventRow / tailTaskEvents.

import { describe, it, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  fetchLatestTaskEvents,
  formatTaskEventRow,
  tailTaskEvents,
  type TaskEventRow,
} from './trajectory.command.js';

function makeFixtureDb(): { dbPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'kyberkit-trajectory-'));
  const dbPath = join(dir, 'task_events.sqlite');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE task_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      task_type TEXT,
      event_type TEXT NOT NULL,
      stage TEXT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      ts INTEGER NOT NULL
    );
  `);
  const insert = db.prepare(
    `INSERT INTO task_events (task_id, task_type, event_type, stage, payload_json, ts)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const base = Date.now();
  for (let i = 0; i < 5; i++) {
    insert.run(
      `task-${i}`,
      'first_encounter',
      i === 4 ? 'completed' : 'progress',
      i === 0 ? 'started' : null,
      JSON.stringify({ index: i }),
      base + i * 100,
    );
  }
  db.close();
  return { dbPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('trajectory.command (SQLite task_events)', () => {
  it('fetchLatestTaskEvents returns last N events in chronological order', () => {
    const { dbPath, cleanup } = makeFixtureDb();
    try {
      const rows = fetchLatestTaskEvents(3, dbPath);
      expect(rows).toHaveLength(3);
      // .reverse() in fetchLatestTaskEvents means oldest of selected first
      expect(rows[0].task_id).toBe('task-2');
      expect(rows[2].task_id).toBe('task-4');
      expect(rows[2].event_type).toBe('completed');
    } finally {
      cleanup();
    }
  });

  it('formatTaskEventRow renders ISO timestamp + task_type + task_id + event_type', () => {
    const row: TaskEventRow = {
      id: 1,
      task_id: 'task-0',
      task_type: 'first_encounter',
      event_type: 'started',
      stage: 'scan',
      payload_json: '{}',
      ts: 1747454400000, // 2025-05-17T03:20:00.000Z
    };
    const line = formatTaskEventRow(row);
    expect(line).toContain('first_encounter');
    expect(line).toContain('task-0');
    expect(line).toContain('started');
    expect(line).toContain('· scan');
  });

  it('tailTaskEvents with follow=false prints last N then returns', async () => {
    const { dbPath, cleanup } = makeFixtureDb();
    const lines: string[] = [];
    try {
      await tailTaskEvents({
        last: 2,
        follow: false,
        dbPath,
        onLine: (l) => lines.push(l),
      });
      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('task-4');
    } finally {
      cleanup();
    }
  });
});
