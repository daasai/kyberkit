/**
 * Sprint 3.5 §5 — Deliverables Dashboard data contract.
 *
 * All fields are aggregated from trajectory events (`fs_events`, trace_events,
 * usage, memory.extracted). No new business state is introduced; this shape
 * exists solely for rendering.
 */
export interface TurnSummary {
  /** Matches `TaskCompleteEvent.taskId`. */
  readonly taskId: string;
  /** Plan mission (empty string if none discovered). */
  readonly mission: string;
  /** Epoch ms when the task completed. */
  readonly completedAt: number;
  /** Wall-clock duration of the task (ms). */
  readonly durationMs: number;

  readonly deliverables: readonly Deliverable[];
  readonly steps: readonly StepRecord[];
  readonly assets: readonly AssetRecord[];
  readonly metrics: TurnMetrics;
}

export interface Deliverable {
  /** Path as recorded in `fs_events` (often relative to workspace). */
  readonly path: string;
  readonly kind: 'create' | 'modify' | 'delete';
  readonly sizeBytes?: number;
  readonly atMs: number;
  readonly toolName?: string | null;
}

export interface StepRecord {
  readonly index: number;
  readonly title: string;
  readonly tool?: string;
  readonly durationMs?: number;
  readonly status: 'ok' | 'error' | 'skipped';
}

export interface AssetRecord {
  readonly type: 'memory' | 'skill' | 'permit';
  readonly title: string;
  readonly sourcePath?: string;
  /** Skill draft from suggestion engine; not yet on disk until adopted. */
  readonly suggested?: boolean;
  readonly revertible: boolean;
}

export interface TurnMetrics {
  readonly toolCallsTotal: number;
  readonly toolCallsFailed: number;
  readonly tokensInput: number;
  readonly tokensOutput: number;
  /** USD estimate when available; undefined if pricing missing. */
  readonly costUsd?: number;
}
