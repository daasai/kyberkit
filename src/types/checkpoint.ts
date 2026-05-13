import { MemorySnapshot } from './memory.js';

export type CheckpointId = string;

/**
 * [C4] Interruption State taxonomy (CC-Aligned).
 * Categorizes how a session was interrupted to guide recovery injection.
 */
export type InterruptionKind = 
  | 'none'               // Clean stop
  | 'interrupted_turn'   // Interrupted while agent was thinking/using tools
  | 'interrupted_prompt' // Interrupted after user prompt but before agent response;

export interface InterruptionState {
  kind: InterruptionKind;
  interruptedAt: number;
}

/**
 * [R2] Unified Checkpoint structure.
 * Captures atomic snapshot of agent messages, session memory, and task state.
 */
export interface Checkpoint {
  id: CheckpointId;
  agentId: string;
  timestamp: number;
  
  // State snapshots
  messages: unknown[];           // Full conversation history
  sessionSnapshot: MemorySnapshot; // Snapshot of L2 SessionMemory
  taskProgress: Record<string, any>;
  
  // [C4] Metadata for recovery
  interruptionState: InterruptionState;
  version: string; // "v1"
}

export interface CheckpointProvider {
  save(checkpoint: Checkpoint): Promise<void>;
  restore(id: CheckpointId): Promise<Checkpoint>;
  list(agentId: string): Promise<CheckpointId[]>;
  delete(id: CheckpointId): Promise<void>;
  prune(agentId: string, maxSnapshots: number, maxAgeMs: number): Promise<number>;
}
