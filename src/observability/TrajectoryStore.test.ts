import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteTrajectoryStore } from './SqliteTrajectoryStore.js';
import { TrajectoryEvent } from '../types/observability.js';
import Database from 'better-sqlite3';
import { join } from 'path';
import { rmSync, mkdirSync } from 'fs';

describe('SqliteTrajectoryStore (Red Phase)', () => {
  const testDir = './test-observability-data';
  const dbPath = join(testDir, 'trajectory.db');
  let store: SqliteTrajectoryStore;

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
    store = new SqliteTrajectoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should initialize and define schema correctly', () => {
    // Implicit: instantiate doesn't throw
    expect(store).toBeDefined();
  });

  it('should save trajectory events batch and retrieve trace', async () => {
    const traceId = 'trace-123';
    const event1: TrajectoryEvent = {
      id: 'e1', traceId, spanId: 's1',
      kind: 'agent.turn_start', timestamp: Date.now(),
      payload: { systemPrompt: 'hello' }
    };
    const event2: TrajectoryEvent = {
      id: 'e2', traceId, spanId: 's2', parentSpanId: 's1',
      kind: 'tool.call', timestamp: Date.now() + 10, durationMs: 50,
      payload: { tool: 'bash' }
    };

    await store.saveBatch([event1, event2]);

    const trace = await store.getTrace(traceId);
    expect(trace).toHaveLength(2);
    // order might be by insertion or timestamp
    const foundE2 = trace.find(e => e.id === 'e2');
    expect(foundE2).toBeDefined();
    expect(foundE2?.payload.tool).toBe('bash');
  });

  it('should prune old events based on retention', async () => {
    const traceId = 'trace-old';
    const oldEvent: TrajectoryEvent = {
      id: 'old1', traceId, spanId: 's1',
      kind: 'model.request', timestamp: Date.now() - 10000, // 10s old
      payload: {}
    };
    await store.saveBatch([oldEvent]);

    const prunedCount = await store.prune(5000); // retain 5s
    expect(prunedCount).toBeGreaterThan(0);

    const trace = await store.getTrace(traceId);
    expect(trace).toHaveLength(0);
  });
});
