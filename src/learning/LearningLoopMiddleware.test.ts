import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdir, readFile, rm } from 'fs/promises';
import { randomUUID } from 'crypto';

import { LearningLoopMiddleware } from './LearningLoopMiddleware.js';
import { EvolutionChangelog } from './EvolutionChangelog.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { TaskCompleteEvent } from '../types/agent-events.js';

// ─── EvolutionChangelog ───────────────────────────────────────────────────────

describe('EvolutionChangelog', () => {
  let tmpDir: string;
  let changelogPath: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `kyber-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
    changelogPath = join(tmpDir, 'evolution-changelog.md');
  });

  it('creates the file on first appendEntry and writes correct content', async () => {
    const changelog = new EvolutionChangelog(changelogPath);
    await changelog.appendEntry({
      taskId: 'task-abc123',
      mission: '构建登录模块',
      toolCalls: 8,
      toolBreakdown: { read_file: 4, write_file: 3, bash: 1 },
      rollbackCheckpointId: 'ckpt-xyz',
      timestamp: new Date('2026-05-02T13:38:00Z').getTime(),
    });

    const content = await readFile(changelogPath, 'utf-8');
    expect(content).toContain('task-abc123');
    expect(content).toContain('构建登录模块');
    expect(content).toContain('8 次');
    expect(content).toContain('write_file ×3');
    expect(content).toContain('read_file ×4');
    expect(content).toContain('ckpt-xyz');
  });

  it('appends multiple entries without overwriting', async () => {
    const changelog = new EvolutionChangelog(changelogPath);
    await changelog.appendEntry({
      taskId: 'task-1',
      mission: 'First task',
      toolCalls: 3,
      toolBreakdown: { bash: 3 },
      timestamp: Date.now(),
    });
    await changelog.appendEntry({
      taskId: 'task-2',
      mission: 'Second task',
      toolCalls: 5,
      toolBreakdown: { write_file: 5 },
      timestamp: Date.now(),
    });

    const content = await readFile(changelogPath, 'utf-8');
    expect(content).toContain('task-1');
    expect(content).toContain('task-2');
  });

  it('omits rollback line when checkpointId is undefined', async () => {
    const changelog = new EvolutionChangelog(changelogPath);
    await changelog.appendEntry({
      taskId: 'task-no-ckpt',
      mission: 'Quick task',
      toolCalls: 2,
      toolBreakdown: { read_file: 2 },
      timestamp: Date.now(),
    });

    const content = await readFile(changelogPath, 'utf-8');
    expect(content).not.toContain('回滚点');
  });
});

// ─── LearningLoopMiddleware ───────────────────────────────────────────────────

function makeTaskEvent(overrides: Partial<TaskCompleteEvent> = {}): TaskCompleteEvent {
  return {
    type: 'task_complete',
    taskId: `task-${randomUUID().slice(0, 8)}`,
    mission: '测试任务',
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    turnsInTask: 2,
    toolCalls: 5,
    errors: 0,
    stopReason: 'end_turn',
    ...overrides,
  };
}

describe('LearningLoopMiddleware', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `kyber-ll-test-${randomUUID()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  it('writes changelog and emits learning_loop.evolved after qualifying task', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const evolved = mock();
    bus.on('learning_loop.evolved', evolved);

    const changelogPath = join(tmpDir, 'evolution-changelog.md');
    const changelog = new EvolutionChangelog(changelogPath);
    const loop = new LearningLoopMiddleware({ changelog, eventBus: bus });

    const task = makeTaskEvent({ toolCalls: 4 });
    const toolLog = [
      { name: 'read_file', input: {} },
      { name: 'write_file', input: {} },
      { name: 'read_file', input: {} },
      { name: 'bash', input: {} },
    ];

    loop.schedule(task, toolLog, 'user text');

    // Wait for the async fire-and-forget job
    await new Promise((r) => setTimeout(r, 50));

    expect(evolved).toHaveBeenCalledTimes(1);
    const payload = (evolved.mock.calls[0] as any)[0];
    expect(payload.taskId).toBe(task.taskId);
    expect(payload.mission).toBe(task.mission);
    expect(payload.toolCalls).toBe(4);
    expect(payload.changelogPath).toBe(changelogPath);

    const content = await readFile(changelogPath, 'utf-8');
    expect(content).toContain(task.taskId);
    expect(content).toContain('read_file ×2');
  });

  it('skips tasks below minToolCalls threshold', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const evolved = mock();
    bus.on('learning_loop.evolved', evolved);

    const changelogPath = join(tmpDir, 'evolution-changelog.md');
    const changelog = new EvolutionChangelog(changelogPath);
    const loop = new LearningLoopMiddleware({ changelog, eventBus: bus, minToolCalls: 3 });

    const task = makeTaskEvent({ toolCalls: 1 });
    loop.schedule(task, [{ name: 'read_file', input: {} }], '');

    await new Promise((r) => setTimeout(r, 50));
    expect(evolved).not.toHaveBeenCalled();
  });

  it('propagates rollbackCheckpointId from checkpoint.saved bus event', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const evolved = mock();
    bus.on('learning_loop.evolved', evolved);

    const changelogPath = join(tmpDir, 'ckpt-test.md');
    const changelog = new EvolutionChangelog(changelogPath);
    const loop = new LearningLoopMiddleware({ changelog, eventBus: bus });

    // Simulate checkpoint.saved before the task completes
    bus.emit('checkpoint.saved', { agentId: 'a1', checkpointId: 'ckpt-rollback-99' });

    const task = makeTaskEvent({ toolCalls: 3 });
    loop.schedule(task, [
      { name: 'bash', input: {} },
      { name: 'read_file', input: {} },
      { name: 'write_file', input: {} },
    ], '');

    await new Promise((r) => setTimeout(r, 50));

    expect(evolved).toHaveBeenCalledTimes(1);
    const payload = (evolved.mock.calls[0] as any)[0];
    expect(payload.rollbackCheckpointId).toBe('ckpt-rollback-99');

    const content = await readFile(changelogPath, 'utf-8');
    expect(content).toContain('ckpt-rollback-99');
  });

  it('calls skillRunner.schedule when provided and toolCalls >= 3', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const changelogPath = join(tmpDir, 'skill-test.md');
    const changelog = new EvolutionChangelog(changelogPath);
    const fakeSkillRunner = { schedule: mock() } as any;

    const loop = new LearningLoopMiddleware({
      changelog,
      eventBus: bus,
      skillRunner: fakeSkillRunner,
    });

    const task = makeTaskEvent({ toolCalls: 5 });
    const toolLog = Array.from({ length: 5 }, (_, i) => ({ name: 'bash', input: { i } }));
    loop.schedule(task, toolLog, 'user');

    await new Promise((r) => setTimeout(r, 50));
    expect(fakeSkillRunner.schedule).toHaveBeenCalledTimes(1);
  });

  it('disposes checkpoint subscription without error', () => {
    const bus = new TypedEventBus<KyberEvents>();
    const changelogPath = join(tmpDir, 'dispose-test.md');
    const loop = new LearningLoopMiddleware({
      changelog: new EvolutionChangelog(changelogPath),
      eventBus: bus,
    });
    expect(() => loop.dispose()).not.toThrow();
    // No checkpoint events should be tracked after dispose
    bus.emit('checkpoint.saved', { agentId: 'a1', checkpointId: 'late-ckpt' });
    // Verify: (loop as any).latestCheckpointId should remain undefined or prior value
    // Just checking no crash
  });
});
