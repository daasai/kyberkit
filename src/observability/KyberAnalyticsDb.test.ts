import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { KyberAnalyticsDb } from './KyberAnalyticsDb.js';

describe('KyberAnalyticsDb — fs_events', () => {
  let dir: string;
  let db: KyberAnalyticsDb;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kyber-analytics-'));
    db = new KyberAnalyticsDb(join(dir, 'x.sqlite'));
  });

  afterEach(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('records and reads fs_events by turn_id', () => {
    const now = Date.now();
    db.recordFsEvent({
      turn_id: 't1',
      task_id: 'task-1',
      tool_use_id: 'tu1',
      tool_name: 'write_file',
      path: 'src/foo.ts',
      kind: 'create',
      size_bytes: 120,
      preview: 'export const x = 1;',
      at_ms: now,
    });
    db.recordFsEvent({
      turn_id: 't1',
      task_id: 'task-1',
      tool_use_id: 'tu2',
      tool_name: 'edit_file',
      path: 'src/bar.ts',
      kind: 'modify',
      size_bytes: 50,
      preview: null,
      at_ms: now + 10,
    });

    const rows = db.queryFsEventsByTurn('t1');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.path).toBe('src/foo.ts');
    expect(rows[0]!.kind).toBe('create');
    expect(rows[1]!.kind).toBe('modify');
  });

  it('records and reads fs_events by task_id', () => {
    db.recordFsEvent({
      turn_id: 't1',
      task_id: 'task-A',
      tool_use_id: null,
      tool_name: 'write_file',
      path: 'a.md',
      kind: 'create',
      size_bytes: 10,
      preview: null,
      at_ms: 1,
    });
    db.recordFsEvent({
      turn_id: 't2',
      task_id: 'task-A',
      tool_use_id: null,
      tool_name: 'edit_file',
      path: 'b.md',
      kind: 'modify',
      size_bytes: 20,
      preview: null,
      at_ms: 2,
    });
    db.recordFsEvent({
      turn_id: 't3',
      task_id: 'task-B',
      tool_use_id: null,
      tool_name: 'write_file',
      path: 'other.md',
      kind: 'create',
      size_bytes: 30,
      preview: null,
      at_ms: 3,
    });

    const taskA = db.queryFsEventsByTask('task-A');
    expect(taskA).toHaveLength(2);
    const taskB = db.queryFsEventsByTask('task-B');
    expect(taskB).toHaveLength(1);
    expect(taskB[0]!.path).toBe('other.md');
  });

  it('tolerates null task_id on fs_events inserts', () => {
    db.recordFsEvent({
      turn_id: 't1',
      task_id: null,
      tool_use_id: null,
      tool_name: null,
      path: 'orphan.md',
      kind: 'create',
      size_bytes: null,
      preview: null,
      at_ms: 1,
    });
    const rows = db.queryFsEventsByTurn('t1');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.path).toBe('orphan.md');
  });
});
