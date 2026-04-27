import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import { WorkspaceGrowthStore } from './WorkspaceGrowthStore.js';

describe('WorkspaceGrowthStore', () => {
  let dir: string;
  let db: WorkspaceGrowthStore;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'kk-growth-'));
    const path = join(dir, 'g.db');
    db = new WorkspaceGrowthStore(path);
  });

  afterAll(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it('aggregates by kind over time window', () => {
    db.record('memory', 2);
    db.record('skill', 1);
    const all = db.aggregateSince(0);
    expect(all.memories).toBe(2);
    expect(all.skills).toBe(1);
    const future = db.aggregateSince(Date.now() + 9_000_000_000);
    expect(future.memories).toBe(0);
  });
});
