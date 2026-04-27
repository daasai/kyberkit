import { StopReason, UsageInfo, MessageContent } from './model.js';
import type { TurnSummary } from './turn-summary.js';

/**
 * AgentEvent — the stream of events yielded by agentLoop().
 * Consumers (TUI, SDK, tests) iterate over these to observe agent behavior.
 */
export type AgentEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolUseStartEvent
  | ToolUseInputEvent
  | ToolUseCompleteEvent
  | ToolProgressEvent
  | ToolResultEvent
  | TurnPhaseEvent
  | UsageEvent
  | TurnCompleteEvent
  | TaskCompleteEvent
  | TurnSummaryEvent
  | StatusEvent
  | ErrorEvent
  | TaskPlanEvent
  | TaskNarrationEvent
  | HeartbeatEvent;

/** Step in a user-visible task plan (mission chip). */
export type TaskPlanStepStatus = 'pending' | 'active' | 'done' | 'skipped' | 'failed';

export interface TaskPlanStep {
  readonly id: string;
  readonly title: string;
  readonly status: TaskPlanStepStatus;
}

/** Structured multi-step plan for progress UI (from model tool or narrator fallback). */
export interface TaskPlanEvent {
  readonly type: 'task_plan';
  readonly steps: readonly TaskPlanStep[];
  readonly source: 'model' | 'narrator';
  /**
   * Short human-readable mission title (≤12 CJK chars / 24 ASCII chars recommended).
   * When omitted, consumers should fall back to the first user message or the first step title.
   * Sprint 3.5 §3.2 — IdentityBand uses this as the stable task name (not userInput截断).
   */
  readonly mission?: string;
  /**
   * Stable ID grouping this plan with downstream task_complete / trajectory rows.
   * Assigned by NarratorMiddleware on plan creation.
   */
  readonly taskId?: string;
}

/** One-line human-readable progress beat (rule-generated or model-adjacent). */
export interface TaskNarrationEvent {
  readonly type: 'task_narration';
  readonly text: string;
  readonly kind: 'starting' | 'progress' | 'recovering' | 'wrapping_up';
}

/** Optional heartbeat for CLI / SDK consumers (TUI may synthesize locally). */
export interface HeartbeatEvent {
  readonly type: 'heartbeat';
  readonly elapsedMs: number;
  readonly toolCalls: number;
  readonly lastEventAgeMs: number;
}

/** Incremental text output from LLM */
export interface TextDeltaEvent {
  readonly type: 'text_delta';
  readonly text: string;
}

/** Incremental thinking/reasoning output from LLM */
export interface ThinkingDeltaEvent {
  readonly type: 'thinking_delta';
  readonly text: string;
}

/** LLM has started a tool_use block */
export interface ToolUseStartEvent {
  readonly type: 'tool_use_start';
  readonly toolUseId: string;
  readonly toolName: string;
}

/** Incremental tool input JSON fragment */
export interface ToolUseInputEvent {
  readonly type: 'tool_use_input';
  readonly toolUseId: string;
  readonly fragment: string;
}

/** Tool use block fully received (input JSON parsed) */
export interface ToolUseCompleteEvent {
  readonly type: 'tool_use_complete';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly input: unknown;
}

/** Long-running or staged tool execution feedback */
export interface ToolProgressEvent {
  readonly type: 'tool_progress';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly phase?: 'queued' | 'permission' | 'executing' | 'done';
  readonly message?: string;
  readonly percent?: number;
}

/** High-level phase of the agent turn (for status UI) */
export interface TurnPhaseEvent {
  readonly type: 'turn_phase';
  readonly phase: 'model_stream' | 'tool_execution' | 'idle';
}

/** Tool execution result */
export interface ToolResultEvent {
  readonly type: 'tool_result';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly result: string;
  readonly isError: boolean;
}

/** Token usage update (emitted at stream end) */
export interface UsageEvent {
  readonly type: 'usage';
  readonly usage: UsageInfo;
  readonly cumulative: CumulativeUsage;
}

/** One LLM turn completed (after all tools executed) */
export interface TurnCompleteEvent {
  readonly type: 'turn_complete';
  readonly turnNumber: number;
  readonly stopReason: StopReason;
  /** The accumulated assistant message content blocks */
  readonly content: Array<MessageContent>;
}

/**
 * The user's task (possibly spanning multiple turns) is complete.
 *
 * A "task" is defined as:
 *  - From the first `task_plan` event (or first user input if no plan was emitted)
 *  - Until a `turn_complete` with `stopReason = 'end_turn'` arrives
 *
 * In the common case where the model does not call `plan_task`, a task collapses to a single turn.
 * When `plan_task` is used, multiple `turn_complete` events (one per tool-calling turn) may be
 * yielded before the final `task_complete` closes the task.
 *
 * Consumers (TurnSummaryBuilder, TUI) use this as the boundary to render the delivery dashboard.
 * Sprint 3.5 §5.
 */
export interface TaskCompleteEvent {
  readonly type: 'task_complete';
  readonly taskId: string;
  /** Short human-readable title; falls back to user input preview when no plan mission was set. */
  readonly mission: string;
  readonly startedAt: number;
  readonly completedAt: number;
  readonly turnsInTask: number;
  readonly toolCalls: number;
  readonly errors: number;
  readonly stopReason: StopReason;
}

/**
 * Sprint 3.5 §5 — Delivered-this-turn dashboard payload.
 *
 * Emitted by the session layer immediately after `task_complete` passes through
 * so the TUI can render a deterministic deliverables block alongside the
 * model's natural-language wrap-up.
 */
export interface TurnSummaryEvent {
  readonly type: 'turn_summary';
  readonly summary: TurnSummary;
}

/** Agent lifecycle status change */
export interface StatusEvent {
  readonly type: 'status';
  readonly status: string;
  readonly message?: string;
}

/** Error during agent execution */
export interface ErrorEvent {
  readonly type: 'error';
  readonly error: Error;
  readonly recoverable: boolean;
}

/** Cumulative usage across the entire session */
export interface CumulativeUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  turnCount: number;
}
