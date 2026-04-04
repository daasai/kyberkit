import { HealthDashboard, TrajectoryStore, HealthMetricsSnapshot } from '../types/observability.js';

export class DeterministicHealthDashboard implements HealthDashboard {
  constructor(private readonly store: TrajectoryStore) {}

  async computeSnapshot(timeWindowMs: number): Promise<HealthMetricsSnapshot> {
    if (!this.store.queryRecentEvents) {
      throw new Error('TrajectoryStore must implement queryRecentEvents for HealthDashboard.');
    }

    const events = await this.store.queryRecentEvents(timeWindowMs);
    const now = Date.now();

    const snapshot: HealthMetricsSnapshot = {
      windowStart: now - timeWindowMs,
      windowEnd: now,
      activeAgents: 0,
      totalTokensConsumed: 0,
      avgToolDurationMs: 0,
      errorRate: 0,
      circuitBreakerTrips: 0
    };

    let toolCount = 0;
    let toolErrors = 0;
    let toolDurationSum = 0;

    const agentTraces = new Set<string>();

    for (const e of events) {
      if (e.kind === 'agent.turn_start') {
        agentTraces.add(e.traceId);
        if (e.payload?.tokens) {
          snapshot.totalTokensConsumed += e.payload.tokens;
        }
      } else if (e.kind === 'tool.result') {
        toolCount++;
        if (e.durationMs) toolDurationSum += e.durationMs;
        if (e.payload?.success === false || e.payload?.status === 'error') {
          toolErrors++;
        }
      } else if (e.kind === 'exception.tripped') {
        snapshot.circuitBreakerTrips++;
      }
    }

    snapshot.activeAgents = agentTraces.size;
    snapshot.avgToolDurationMs = toolCount > 0 ? (toolDurationSum / toolCount) : 0;
    snapshot.errorRate = toolCount > 0 ? (toolErrors / toolCount) : 0;

    return snapshot;
  }
}
