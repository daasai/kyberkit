import type { TaskSnapshot } from './TaskSnapshot.js';

export type TaskState =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskSpec {
  /** Scope this task runs within. The calling layer provides this from its own domain model. */
  scope_id: string;
  task_type: string;
  payload: unknown;
  /** Output object produced by this task, if any. */
  output_id?: string;
  /** Associated plan ID (first-class citizen). */
  plan_id?: string;
}

export interface TaskHandle {
  id: string;
  state: TaskState;
  /** Capture current progress to durable storage. */
  checkpoint(): Promise<TaskSnapshot>;
  cancel(): Promise<void>;
}

/**
 * Called by TaskRuntime on every state transition.
 * Observers registered here are called on every state change without
 * modifying the runtime's core state machine.
 */
export type TransitionHook = (
  from: TaskState,
  to: TaskState,
  task: TaskHandle,
) => Promise<void>;

export interface TaskRuntime {
  /** Enqueue a new task; returns a handle immediately. */
  submit(spec: TaskSpec): Promise<TaskHandle>;
  /** Reload a task from its most recent checkpoint. Returns null if not found. */
  recover(id: string): Promise<TaskHandle | null>;
  /** Persist a snapshot (called internally and by task executors). */
  checkpoint(id: string, snapshot: TaskSnapshot): Promise<void>;
  /** Register a state-transition observer. Multiple hooks are supported. */
  onTransition(hook: TransitionHook): void;
}
