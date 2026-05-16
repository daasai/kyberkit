// packages/kyberkit/src/cli/trajectory.command.test.ts
import { describe, it, expect } from 'bun:test';
import { tailTrajectory, exportTrajectory } from './trajectory.command.js';
import type { TrajectoryEvent } from '../types/observability.js';

const makeEvent = (i: number): TrajectoryEvent => ({
  id: `evt-${i}`,
  traceId: 'trace-1',
  spanId: `span-${i}`,
  kind: 'tool.call',
  timestamp: Date.now() - (10 - i) * 1000,
  payload: { tool: 'read_file', index: i },
});

describe('trajectory tail/export', () => {
  it('tailTrajectory returns last N events', async () => {
    const fakeEvents = Array.from({ length: 10 }, (_, i) => makeEvent(i));
    const fakeStore = {
      queryRecentEvents: async (_timeWindowMs: number) => fakeEvents,
    };

    const events = await tailTrajectory(fakeStore as any, 5);
    expect(events).toHaveLength(5);
    expect(events[0]).toHaveProperty('kind');
    expect(events[0]).toHaveProperty('payload');
  });

  it('exportTrajectory produces valid JSONL', async () => {
    const fakeEvents: TrajectoryEvent[] = [
      {
        id: 'e1',
        traceId: 'trace-1',
        spanId: 'span-1',
        kind: 'agent.turn_start',
        timestamp: 1000,
        payload: {},
      },
      {
        id: 'e2',
        traceId: 'trace-1',
        spanId: 'span-2',
        kind: 'tool.call',
        timestamp: 2000,
        payload: { tool: 'bash' },
      },
    ];
    const fakeStore = {
      queryRecentEvents: async (_timeWindowMs: number) => fakeEvents,
    };

    const jsonl = await exportTrajectory(fakeStore as any, { sinceMs: 0, format: 'jsonl' });
    const lines = jsonl.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const parsed = JSON.parse(lines[0]);
    expect(parsed).toHaveProperty('kind');
    expect(parsed).toHaveProperty('payload');
  });
});
