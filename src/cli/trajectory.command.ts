// packages/kyberkit/src/cli/trajectory.command.ts
import { TrajectoryEvent } from '../types/observability.js';

type TrajectoryStoreLike = {
  queryRecentEvents(timeWindowMs: number): Promise<TrajectoryEvent[]>;
};

export type { TrajectoryEvent };

/**
 * Return the last N events from the store.
 * Uses a large time window to fetch all available events, then slices.
 */
export async function tailTrajectory(
  store: TrajectoryStoreLike,
  n: number,
): Promise<TrajectoryEvent[]> {
  const events = await store.queryRecentEvents(Number.MAX_SAFE_INTEGER);
  return events.slice(-n);
}

/**
 * Export events since `opts.sinceMs` milliseconds ago as a JSONL string.
 */
export async function exportTrajectory(
  store: TrajectoryStoreLike,
  opts: { sinceMs: number; format: 'jsonl' },
): Promise<string> {
  const events = await store.queryRecentEvents(opts.sinceMs);
  return events.map((e) => JSON.stringify(e)).join('\n');
}
