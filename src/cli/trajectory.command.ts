import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';
import { resolveTrajectoryDbPath } from './trajectoryPaths.js';

export interface TaskEventRow {
  id: number;
  task_id: string;
  task_type: string | null;
  event_type: string;
  stage: string | null;
  payload_json: string;
  ts: number;
}

function openTaskEventsDb(dbPath = resolveTrajectoryDbPath()): Database {
  if (!existsSync(dbPath)) {
    throw new Error(`Trajectory DB not found: ${dbPath}`);
  }
  return new Database(dbPath, { readonly: true });
}

export function fetchLatestTaskEvents(limit: number, dbPath?: string): TaskEventRow[] {
  const db = openTaskEventsDb(dbPath);
  try {
    const rows = db
      .prepare(
        `SELECT id, task_id, task_type, event_type, stage, payload_json, ts
         FROM task_events
         ORDER BY ts DESC
         LIMIT ?1`,
      )
      .all(limit) as TaskEventRow[];
    return rows.reverse();
  } finally {
    db.close();
  }
}

export function formatTaskEventRow(row: TaskEventRow): string {
  const iso = new Date(row.ts).toISOString();
  const type = row.task_type ?? 'task';
  const stage = row.stage ? ` · ${row.stage}` : '';
  return `${iso}  ${type}  ${row.task_id}  ${row.event_type}${stage}`;
}

export async function tailTaskEvents(opts: {
  last?: number;
  follow?: boolean;
  pollMs?: number;
  dbPath?: string;
  onLine?: (line: string) => void;
}): Promise<void> {
  const last = opts.last ?? 20;
  const follow = opts.follow !== false;
  const pollMs = opts.pollMs ?? 500;
  const dbPath = opts.dbPath ?? resolveTrajectoryDbPath();
  const write = opts.onLine ?? ((line: string) => console.log(line));

  let lastId = 0;
  const printBatch = (rows: TaskEventRow[]) => {
    for (const row of rows) {
      if (row.id <= lastId) continue;
      write(formatTaskEventRow(row));
      lastId = row.id;
    }
  };

  printBatch(fetchLatestTaskEvents(last, dbPath));

  if (!follow) return;

  while (true) {
    await Bun.sleep(pollMs);
    if (!existsSync(dbPath)) continue;
    const db = openTaskEventsDb(dbPath);
    try {
      const rows = db
        .prepare(
          `SELECT id, task_id, task_type, event_type, stage, payload_json, ts
           FROM task_events
           WHERE id > ?1
           ORDER BY id ASC
           LIMIT 200`,
        )
        .all(lastId) as TaskEventRow[];
      printBatch(rows);
    } finally {
      db.close();
    }
  }
}
