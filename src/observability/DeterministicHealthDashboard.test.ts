import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeterministicHealthDashboard } from './DeterministicHealthDashboard.js';
import { TrajectoryStore, TrajectoryEvent } from '../types/observability.js';

describe('DeterministicHealthDashboard (Red Phase)', () => {
  let mockStore: TrajectoryStore;
  let dashboard: DeterministicHealthDashboard;

  beforeEach(() => {
    mockStore = {
      saveBatch: vi.fn(),
      getTrace: vi.fn(),
      prune: vi.fn()
    };
    // inject a raw query method for health dashboard if we need it,
    // or assume HealthDashboard has access to SQLite directly. 
    // In our spec, TrajectoryStore is mainly for trace fetching.
    // We should mock whatever interface DeterministicHealthDashboard uses.
    // For TDD, let's inject a data provider dependency or use the Store directly.
    dashboard = new DeterministicHealthDashboard(mockStore);
  });

  it('should compute health snapshot successfully', async () => {
    // Mock the store to return some hardcoded events to simulate calculation
    // Since our TrajectoryStore interface currently only has getTrace and saveBatch, 
    // the dashboard needs to either query SQLite directly or the Store needs a `queryEvents` method.
    // Let's add a `queryEvents` mock to the store to simulate fetching recent events.
    (mockStore as any).queryRecentEvents = vi.fn().mockResolvedValue([
      { kind: 'agent.turn_start', payload: { tokens: 100 } },
      { kind: 'tool.result', durationMs: 200, payload: { success: true } },
      { kind: 'tool.result', durationMs: 300, payload: { success: false } },
      { kind: 'exception.tripped', payload: {} }
    ]);

    const snapshot = await dashboard.computeSnapshot(60000); // last 60s
    expect(snapshot).toBeDefined();
    
    // Total tokens 100
    expect(snapshot.totalTokensConsumed).toBe(100);
    // Avg tool duration = (200 + 300) / 2 = 250
    expect(snapshot.avgToolDurationMs).toBe(250);
    // Errors / Total tools (1 error out of 2 tool results) = 0.5
    expect(snapshot.errorRate).toBe(0.5);
    // Tripped CBs = 1
    expect(snapshot.circuitBreakerTrips).toBe(1);
  });
});
