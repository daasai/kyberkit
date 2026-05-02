/**
 * Contract Scheduler tests — 3.0 P1
 *
 * Covers: CronParser, DriftDetector, ContractRegistry, RecurringScheduler, TriggeredScheduler
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { parseCron, cronMatches, nextRunAfter } from './CronParser.js';
import { DriftDetector } from './DriftDetector.js';
import { ContractRegistry } from './ContractRegistry.js';
import { RecurringScheduler } from './RecurringScheduler.js';
import { TriggeredScheduler, parseBackoffMs } from './TriggeredScheduler.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { TaskPermissionContract } from '../permission/TaskPermissionContract.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeContract(
  overrides: Partial<TaskPermissionContract> & { taskId: string },
): TaskPermissionContract {
  return {
    actorUserId: 'test-user',
    agentSessionId: undefined,
    contractType: 'recurring',
    status: 'active',
    policyPack: 'development',
    denyListVersion: 'v1',
    requestedTools: [],
    requestedContext: [],
    effectivePermissionRule: 'user_permission ∩ task_permission ∩ policy_constraint',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeTestBus() {
  return new TypedEventBus<KyberEvents>();
}

// ─── CronParser ───────────────────────────────────────────────────────────────

describe('CronParser', () => {
  describe('parseCron', () => {
    it('parses wildcard expression', () => {
      const cron = parseCron('* * * * *');
      expect(cron.minute.type).toBe('any');
      expect(cron.hour.type).toBe('any');
    });

    it('parses fixed values', () => {
      const cron = parseCron('0 1 * * *');
      expect(cron.minute).toEqual({ type: 'value', value: 0 });
      expect(cron.hour).toEqual({ type: 'value', value: 1 });
    });

    it('parses step expression', () => {
      const cron = parseCron('*/30 * * * *');
      expect(cron.minute).toEqual({ type: 'step', step: 30 });
    });

    it('parses range', () => {
      const cron = parseCron('0 9 * * 1-5');
      expect(cron.dayOfWeek).toEqual({ type: 'range', min: 1, max: 5 });
    });

    it('parses comma list', () => {
      const cron = parseCron('0 9,18 * * *');
      expect(cron.hour).toEqual({ type: 'list', values: [9, 18] });
    });

    it('throws on wrong field count', () => {
      expect(() => parseCron('0 1 * *')).toThrow('Invalid cron expression');
    });
  });

  describe('cronMatches', () => {
    it('matches daily at 1:00', () => {
      const cron = parseCron('0 1 * * *');
      const match = new Date('2026-05-02T01:00:00');
      const noMatch = new Date('2026-05-02T01:01:00');
      expect(cronMatches(cron, match)).toBe(true);
      expect(cronMatches(cron, noMatch)).toBe(false);
    });

    it('matches every 30 minutes', () => {
      const cron = parseCron('*/30 * * * *');
      expect(cronMatches(cron, new Date('2026-05-02T10:00:00'))).toBe(true);
      expect(cronMatches(cron, new Date('2026-05-02T10:30:00'))).toBe(true);
      expect(cronMatches(cron, new Date('2026-05-02T10:15:00'))).toBe(false);
    });

    it('matches weekday range Mon-Fri', () => {
      const cron = parseCron('0 9 * * 1-5');
      // 2026-05-04 is Monday (day 1)
      expect(cronMatches(cron, new Date('2026-05-04T09:00:00'))).toBe(true);
      // 2026-05-03 is Sunday (day 0)
      expect(cronMatches(cron, new Date('2026-05-03T09:00:00'))).toBe(false);
    });

    it('matches comma list hours', () => {
      const cron = parseCron('0 9,18 * * *');
      expect(cronMatches(cron, new Date('2026-05-02T09:00:00'))).toBe(true);
      expect(cronMatches(cron, new Date('2026-05-02T18:00:00'))).toBe(true);
      expect(cronMatches(cron, new Date('2026-05-02T12:00:00'))).toBe(false);
    });
  });

  describe('nextRunAfter', () => {
    it('finds next daily run', () => {
      const cron = parseCron('0 1 * * *');
      const after = new Date('2026-05-02T01:30:00');
      const next = nextRunAfter(cron, after);
      expect(next.getHours()).toBe(1);
      expect(next.getMinutes()).toBe(0);
      expect(next.getDate()).toBe(3); // next day
    });
  });
});

// ─── DriftDetector ───────────────────────────────────────────────────────────

describe('DriftDetector', () => {
  it('returns no drift when no history', () => {
    const d = new DriftDetector();
    expect(d.checkDrift('c1', { failureStreak: 3 }).drifted).toBe(false);
  });

  it('detects failure streak', () => {
    const d = new DriftDetector();
    d.recordRun('c1', { success: false });
    d.recordRun('c1', { success: false });
    d.recordRun('c1', { success: false });
    const result = d.checkDrift('c1', { failureStreak: 3 });
    expect(result.drifted).toBe(true);
    expect(result.metric).toBe('failure_streak');
    expect(result.value).toBe(3);
  });

  it('resets failure streak after success', () => {
    const d = new DriftDetector();
    d.recordRun('c1', { success: false });
    d.recordRun('c1', { success: false });
    d.recordRun('c1', { success: true }); // resets streak
    d.recordRun('c1', { success: false });
    expect(d.checkDrift('c1', { failureStreak: 3 }).drifted).toBe(false);
  });

  it('detects daily token budget exceeded', () => {
    const d = new DriftDetector();
    d.recordRun('c2', { success: true, tokensUsed: 4000 });
    d.recordRun('c2', { success: true, tokensUsed: 4000 });
    d.recordRun('c2', { success: true, tokensUsed: 4000 });
    const result = d.checkDrift('c2', { dailyTokenBudget: 10000 });
    expect(result.drifted).toBe(true);
    expect(result.metric).toBe('daily_token_budget');
    expect(result.value).toBe(12000);
  });

  it('no drift when tokens are under budget', () => {
    const d = new DriftDetector();
    d.recordRun('c3', { success: true, tokensUsed: 2000 });
    expect(d.checkDrift('c3', { dailyTokenBudget: 10000 }).drifted).toBe(false);
  });

  it('clears history on clear()', () => {
    const d = new DriftDetector();
    d.recordRun('c4', { success: false });
    d.recordRun('c4', { success: false });
    d.recordRun('c4', { success: false });
    d.clear('c4');
    expect(d.checkDrift('c4', { failureStreak: 3 }).drifted).toBe(false);
  });
});

// ─── ContractRegistry ────────────────────────────────────────────────────────

describe('ContractRegistry', () => {
  let registry: ContractRegistry;
  let bus: TypedEventBus<KyberEvents>;

  beforeEach(async () => {
    bus = makeTestBus();
    registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-registry.json',
      eventBus: bus,
    });
    // Don't call load() — start fresh in-memory
  });

  it('activates a contract and emits event', () => {
    const events: unknown[] = [];
    bus.on('contract.activated', (e) => events.push(e));

    const c = makeContract({ taskId: 'r1', contractType: 'recurring' });
    registry.activate(c);

    expect(registry.get('r1')?.status).toBe('active');
    expect(events).toHaveLength(1);
  });

  it('pauses an active contract', () => {
    const paused: unknown[] = [];
    bus.on('contract.paused', (e) => paused.push(e));

    registry.activate(makeContract({ taskId: 'r2', contractType: 'recurring' }));
    registry.pause('r2', 'test reason');

    expect(registry.get('r2')?.status).toBe('paused');
    expect(paused).toHaveLength(1);
  });

  it('cannot pause non-active contract', () => {
    const paused: unknown[] = [];
    bus.on('contract.paused', (e) => paused.push(e));

    registry.activate(makeContract({ taskId: 'r3', contractType: 'recurring' }));
    registry.revoke('r3');
    registry.pause('r3', 'should not work');

    expect(paused).toHaveLength(0);
  });

  it('revokes a contract', () => {
    const revoked: unknown[] = [];
    bus.on('contract.revoked', (e) => revoked.push(e));

    registry.activate(makeContract({ taskId: 'r4', contractType: 'ad_hoc' }));
    registry.revoke('r4');

    expect(registry.get('r4')?.status).toBe('revoked');
    expect(revoked).toHaveLength(1);
  });

  it('expires a contract', () => {
    const expired: unknown[] = [];
    bus.on('contract.expired', (e) => expired.push(e));

    registry.activate(makeContract({ taskId: 'r5', contractType: 'recurring' }));
    registry.expire('r5');

    expect(registry.get('r5')?.status).toBe('expired');
    expect(expired).toHaveLength(1);
  });

  it('filters by status and type', () => {
    registry.activate(makeContract({ taskId: 'r6', contractType: 'recurring' }));
    registry.activate(makeContract({ taskId: 'r7', contractType: 'triggered' }));
    registry.pause('r7', 'x');

    const active = registry.list({ status: 'active' });
    expect(active.map((c) => c.taskId)).toEqual(['r6']);

    const recurring = registry.list({ contractType: 'recurring' });
    expect(recurring.map((c) => c.taskId)).toEqual(['r6']);
  });
});

// ─── RecurringScheduler ───────────────────────────────────────────────────────

describe('RecurringScheduler', () => {
  it('emits contract.run.due when cron matches', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-rec.json',
      eventBus: bus,
    });
    const driftDetector = new DriftDetector();

    // Cron that matches 2026-05-02 at 01:00
    const contract = makeContract({
      taskId: 'sched1',
      contractType: 'recurring',
      recurring: { schedule: '0 1 * * *' },
    });
    registry.activate(contract);

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new RecurringScheduler({
      registry,
      driftDetector,
      eventBus: bus,
      nowFn: () => new Date('2026-05-02T01:00:00'),
    });
    scheduler.tick();

    expect(fired).toHaveLength(1);
    expect((fired[0] as { contractId: string }).contractId).toBe('sched1');
    expect((fired[0] as { triggeredBy: string }).triggeredBy).toBe('schedule');
  });

  it('does not fire when cron does not match', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-rec2.json',
      eventBus: bus,
    });
    const driftDetector = new DriftDetector();

    registry.activate(makeContract({
      taskId: 'sched2',
      contractType: 'recurring',
      recurring: { schedule: '0 1 * * *' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new RecurringScheduler({
      registry,
      driftDetector,
      eventBus: bus,
      nowFn: () => new Date('2026-05-02T02:00:00'), // not 1:00
    });
    scheduler.tick();

    expect(fired).toHaveLength(0);
  });

  it('does not fire twice for the same minute', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-rec3.json',
      eventBus: bus,
    });
    const driftDetector = new DriftDetector();

    registry.activate(makeContract({
      taskId: 'sched3',
      contractType: 'recurring',
      recurring: { schedule: '0 1 * * *' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new RecurringScheduler({
      registry,
      driftDetector,
      eventBus: bus,
      nowFn: () => new Date('2026-05-02T01:00:00'),
    });
    scheduler.tick();
    scheduler.tick(); // same minute

    expect(fired).toHaveLength(1);
  });

  it('pauses contract on drift and emits contract.drift.detected', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-rec4.json',
      eventBus: bus,
    });
    const driftDetector = new DriftDetector();

    registry.activate(makeContract({
      taskId: 'sched4',
      contractType: 'recurring',
      recurring: {
        schedule: '0 1 * * *',
        scopeDriftLimit: { failureStreak: 3 },
      },
    }));

    // Simulate 3 consecutive failures
    driftDetector.recordRun('sched4', { success: false });
    driftDetector.recordRun('sched4', { success: false });
    driftDetector.recordRun('sched4', { success: false });

    const driftEvents: unknown[] = [];
    const runEvents: unknown[] = [];
    bus.on('contract.drift.detected', (e) => driftEvents.push(e));
    bus.on('contract.run.due', (e) => runEvents.push(e));

    const scheduler = new RecurringScheduler({
      registry,
      driftDetector,
      eventBus: bus,
      nowFn: () => new Date('2026-05-02T01:00:00'),
    });
    scheduler.tick();

    expect(runEvents).toHaveLength(0); // blocked by drift
    expect(driftEvents).toHaveLength(1);
    expect(registry.get('sched4')?.status).toBe('paused');
  });

  it('expires contract that has passed expiresAt', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-rec5.json',
      eventBus: bus,
    });
    const driftDetector = new DriftDetector();

    registry.activate(makeContract({
      taskId: 'sched5',
      contractType: 'recurring',
      recurring: {
        schedule: '0 1 * * *',
        expiresAt: '2026-04-01T00:00:00', // already expired
      },
    }));

    const expired: unknown[] = [];
    const fired: unknown[] = [];
    bus.on('contract.expired', (e) => expired.push(e));
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new RecurringScheduler({
      registry,
      driftDetector,
      eventBus: bus,
      nowFn: () => new Date('2026-05-02T01:00:00'),
    });
    scheduler.tick();

    expect(expired).toHaveLength(1);
    expect(fired).toHaveLength(0);
  });
});

// ─── TriggeredScheduler ───────────────────────────────────────────────────────

describe('TriggeredScheduler', () => {
  it('fires when source + match pattern are satisfied', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-trg1.json',
      eventBus: bus,
    });

    registry.activate(makeContract({
      taskId: 'trig1',
      contractType: 'triggered',
      triggered: { source: 'logs.alert', match: 'CRITICAL' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new TriggeredScheduler({ registry, eventBus: bus });
    scheduler.handleExternalEvent({
      source: 'logs.alert',
      payload: 'Service down: CRITICAL memory pressure',
      receivedAt: Date.now(),
    });

    expect(fired).toHaveLength(1);
    expect((fired[0] as { contractId: string }).contractId).toBe('trig1');
    expect((fired[0] as { triggeredBy: string }).triggeredBy).toBe('event');
  });

  it('does not fire when source does not match', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-trg2.json',
      eventBus: bus,
    });

    registry.activate(makeContract({
      taskId: 'trig2',
      contractType: 'triggered',
      triggered: { source: 'logs.alert', match: 'CRITICAL' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new TriggeredScheduler({ registry, eventBus: bus });
    scheduler.handleExternalEvent({
      source: 'wecom.mention', // different source
      payload: 'CRITICAL alert',
      receivedAt: Date.now(),
    });

    expect(fired).toHaveLength(0);
  });

  it('does not fire when match pattern not in payload', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-trg3.json',
      eventBus: bus,
    });

    registry.activate(makeContract({
      taskId: 'trig3',
      contractType: 'triggered',
      triggered: { source: 'logs.alert', match: 'CRITICAL' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new TriggeredScheduler({ registry, eventBus: bus });
    scheduler.handleExternalEvent({
      source: 'logs.alert',
      payload: 'Info: service healthy',
      receivedAt: Date.now(),
    });

    expect(fired).toHaveLength(0);
  });

  it('respects backoff and does not re-fire within window', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-trg4.json',
      eventBus: bus,
    });

    registry.activate(makeContract({
      taskId: 'trig4',
      contractType: 'triggered',
      triggered: { source: 'logs.alert', match: 'ERROR', backoff: '5m' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    let now = 1_000_000;
    const scheduler = new TriggeredScheduler({
      registry,
      eventBus: bus,
      nowFn: () => now,
    });

    const event = { source: 'logs.alert', payload: 'ERROR occurred', receivedAt: now };
    scheduler.handleExternalEvent(event);
    expect(fired).toHaveLength(1);

    // Advance 2 minutes — still within 5m backoff
    now += 2 * 60_000;
    scheduler.handleExternalEvent({ ...event, receivedAt: now });
    expect(fired).toHaveLength(1); // not fired again

    // Advance past 5 minutes from first fire
    now += 4 * 60_000; // total 6m elapsed
    scheduler.handleExternalEvent({ ...event, receivedAt: now });
    expect(fired).toHaveLength(2); // fires again
  });

  it('fires with wildcard source (*)', () => {
    const bus = makeTestBus();
    const registry = new ContractRegistry({
      registryPath: '/tmp/kyber-test-trg5.json',
      eventBus: bus,
    });

    registry.activate(makeContract({
      taskId: 'trig5',
      contractType: 'triggered',
      triggered: { source: '*', match: 'deploy' },
    }));

    const fired: unknown[] = [];
    bus.on('contract.run.due', (e) => fired.push(e));

    const scheduler = new TriggeredScheduler({ registry, eventBus: bus });
    scheduler.handleExternalEvent({
      source: 'ci.github',
      payload: '{"status": "deploy started"}',
      receivedAt: Date.now(),
    });

    expect(fired).toHaveLength(1);
  });
});

// ─── parseBackoffMs ───────────────────────────────────────────────────────────

describe('parseBackoffMs', () => {
  it('parses seconds', () => expect(parseBackoffMs('30s')).toBe(30_000));
  it('parses minutes', () => expect(parseBackoffMs('5m')).toBe(300_000));
  it('parses hours', () => expect(parseBackoffMs('2h')).toBe(7_200_000));
  it('returns 0 for unknown format', () => expect(parseBackoffMs('invalid')).toBe(0));
});
