import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { randomUUID } from 'crypto';
import type { TaskHandle, TaskRuntime, TaskSpec, TaskState, TransitionHook } from './TaskRuntime.js';
import type { TaskSnapshot } from './TaskSnapshot.js';

interface StoredTask {
  id: string;
  spec: TaskSpec;
  state: TaskState;
  latestSnapshot?: TaskSnapshot;
}

interface TaskStore {
  tasks: Record<string, StoredTask>;
}

export interface TaskRuntimeImplConfig {
  /** Path to JSON file for durable task storage. */
  storePath: string;
}

/**
 * Default TaskRuntime implementation.
 * Persists tasks + snapshots to a JSON file so they survive process restarts.
 * Production deployments may substitute an SQLite-backed implementation.
 */
export class TaskRuntimeImpl implements TaskRuntime {
  private store: TaskStore = { tasks: {} };
  private hooks: TransitionHook[] = [];
  private loaded = false;

  constructor(private readonly config: TaskRuntimeImplConfig) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (existsSync(this.config.storePath)) {
      try {
        const raw = await readFile(this.config.storePath, 'utf-8');
        this.store = JSON.parse(raw) as TaskStore;
      } catch {
        this.store = { tasks: {} };
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.config.storePath), { recursive: true });
    await writeFile(this.config.storePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  async submit(spec: TaskSpec): Promise<TaskHandle> {
    await this.load();
    const id = randomUUID();
    const task: StoredTask = { id, spec, state: 'queued' };
    this.store.tasks[id] = task;
    await this.persist();
    return this.buildHandle(id);
  }

  async recover(id: string): Promise<TaskHandle | null> {
    await this.load();
    if (!this.store.tasks[id]) return null;
    return this.buildHandle(id);
  }

  async checkpoint(id: string, snapshot: TaskSnapshot): Promise<void> {
    await this.load();
    const task = this.store.tasks[id];
    if (!task) throw new Error(`Task ${id} not found`);
    task.latestSnapshot = snapshot;
    await this.persist();
  }

  onTransition(hook: TransitionHook): void {
    this.hooks.push(hook);
  }

  /** Internal helper for tests and TaskRuntime consumers to drive state. */
  async transitionTo(id: string, newState: TaskState): Promise<void> {
    await this.load();
    const task = this.store.tasks[id];
    if (!task) throw new Error(`Task ${id} not found`);
    const prev = task.state;
    task.state = newState;
    await this.persist();
    const handle = this.buildHandle(id);
    for (const hook of this.hooks) {
      await hook(prev, newState, handle);
    }
  }

  private buildHandle(id: string): TaskHandle {
    const self = this;
    return {
      get id() { return id; },
      get state() { return self.store.tasks[id]?.state ?? 'failed'; },
      checkpoint: async () => {
        const task = self.store.tasks[id];
        if (task?.latestSnapshot) return task.latestSnapshot;
        return {
          task_id: id,
          progress: { completed_units: 0, total_units: 0, unit_label: 'units' },
          circuit_states: [],
          checkpointed_at: Date.now(),
        };
      },
      cancel: async () => { await self.transitionTo(id, 'cancelled'); },
    };
  }
}
