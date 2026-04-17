import { StopReason, UsageInfo, MessageContent } from './model.js';

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
  | ToolResultEvent
  | UsageEvent
  | TurnCompleteEvent
  | StatusEvent
  | ErrorEvent;

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
