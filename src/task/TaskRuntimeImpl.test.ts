import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TaskRuntimeImpl } from './TaskRuntimeImpl.js';
import type { TransitionHook } from './TaskRuntime.js';

let dir: string;
let runtime: TaskRuntimeImpl;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kyber-task-'));
  runtime = new TaskRuntimeImpl({ storePath: join(dir, 'tasks.json') });
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('TaskRuntimeImpl', () => {
  it('submit returns a handle in queued state', async () => {
    const handle = await runtime.submit({
      scope_id: 'scope-1',
      task_type: 'test_task',
      payload: { n: 1 },
    });
    expect(handle.id).toBeDefined();
    expect(handle.state).toBe('queued');
  });

  it('recover returns null for unknown id', async () => {
    const result = await runtime.recover('nonexistent-id');
    expect(result).toBeNull();
  });

  it('checkpoint persists and recover restores progress', async () => {
    const handle = await runtime.submit({
      scope_id: 'scope-1',
      task_type: 'long_task',
      payload: {},
    });

    await runtime.checkpoint(handle.id, {
      task_id: handle.id,
      progress: { completed_units: 3, total_units: 10, unit_label: 'blocks' },
      circuit_states: [],
      checkpointed_at: Date.now(),
    });

    // Simulate restart: create a new runtime instance with the same store
    const runtime2 = new TaskRuntimeImpl({ storePath: join(dir, 'tasks.json') });
    const recovered = await runtime2.recover(handle.id);
    expect(recovered).not.toBeNull();
    const snap = await recovered!.checkpoint();
    expect(snap.progress.completed_units).toBe(3);
    expect(snap.progress.total_units).toBe(10);
  });

  it('onTransition hook fires on state changes', async () => {
    const transitions: Array<{ from: string; to: string }> = [];
    const hook: TransitionHook = async (from, to) => {
      transitions.push({ from, to });
    };
    runtime.onTransition(hook);

    const handle = await runtime.submit({
      scope_id: 'scope-1',
      task_type: 'test',
      payload: {},
    });
    await runtime.transitionTo(handle.id, 'running');
    await runtime.transitionTo(handle.id, 'completed');

    expect(transitions).toHaveLength(2);
    expect(transitions[0]).toEqual({ from: 'queued', to: 'running' });
    expect(transitions[1]).toEqual({ from: 'running', to: 'completed' });
  });
});
