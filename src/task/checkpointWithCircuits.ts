import type { TaskSnapshot, TaskProgress } from './TaskSnapshot.js'
import type { DefaultCircuitBreaker } from '../scale/CircuitBreaker.js'

export interface RegisteredCircuit {
  resource: string
  breaker: DefaultCircuitBreaker
}

export function buildTaskSnapshotWithCircuits(
  task_id: string,
  progress: TaskProgress,
  circuits: RegisteredCircuit[],
): TaskSnapshot {
  return {
    task_id,
    progress,
    circuit_states: circuits.map((c) => ({
      resource: c.resource,
      state: c.breaker.getState(),
      failure_count: 0,
    })),
    checkpointed_at: Date.now(),
  }
}
