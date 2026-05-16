export type CircuitState = 'closed' | 'open' | 'half-open';

export interface TaskProgress {
  completed_units: number;
  total_units: number;
  unit_label: string;  // e.g. 'blocks', 'pages', 'steps'
}

/**
 * Immutable point-in-time snapshot of a running task.
 * Stored by TaskRuntimeImpl at each checkpoint interval.
 * circuit_states lets recovery correctly re-init each resource's breaker.
 */
export interface TaskSnapshot {
  task_id: string;
  progress: TaskProgress;
  circuit_states: Array<{
    resource: string;
    state: CircuitState;
    failure_count: number;
  }>;
  checkpointed_at: number;
}
