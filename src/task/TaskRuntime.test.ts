import { describe, it, expect } from 'bun:test';
import type { TaskRuntime, TaskSpec, TaskHandle, TaskState, TransitionHook } from './TaskRuntime.js';
import type { TaskSnapshot } from './TaskSnapshot.js';

describe('TaskRuntime type contracts', () => {
  it('TaskSpec has required fields with generic vocabulary', () => {
    const spec: TaskSpec = {
      scope_id: 'scope-abc',       // generic — Kevin maps space_id → scope_id
      task_type: 'generation',
      payload: { prompt: 'hello' },
    };
    expect(spec.scope_id).toBeDefined();
    expect(spec.task_type).toBeDefined();
  });

  it('TaskHandle exposes state and async operations', async () => {
    const handle: TaskHandle = {
      id: 'task-1',
      state: 'queued' as TaskState,
      checkpoint: async () => ({
        task_id: 'task-1',
        progress: { completed_units: 0, total_units: 10, unit_label: 'blocks' },
        circuit_states: [],
        checkpointed_at: Date.now(),
      } satisfies TaskSnapshot),
      cancel: async () => {},
    };
    expect(handle.state).toBe('queued');
    const snap = await handle.checkpoint();
    expect(snap.task_id).toBe('task-1');
  });

  it('TaskState union covers all expected values', () => {
    const states: TaskState[] = ['queued', 'running', 'completed', 'failed', 'cancelled'];
    expect(states).toHaveLength(5);
  });
});
