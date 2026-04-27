import type {
  AgentEvent,
  CumulativeUsage,
  TaskCompleteEvent,
  TaskNarrationEvent,
  TaskPlanStep,
  TurnPhaseEvent,
} from '../../types/agent-events.js';
import type { StopReason } from '../../types/model.js';
import type { TurnSummary } from '../../types/turn-summary.js';

// ─── Tool call state ─────────────────────────────────────────────────────────

export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  inputFragment: string;
  input?: unknown;
  result?: string;
  isError?: boolean;
  status: 'pending' | 'running' | 'done' | 'error';
  progressMessage?: string;
  progressPercent?: number;
  progressPhase?: 'queued' | 'permission' | 'executing' | 'done';
}

// ─── Memory toast (Sprint 3.5 §6.1) ──────────────────────────────────────────

export interface MemoryToast {
  /** Unique id for React keys and revert targeting. */
  readonly id: string;
  /** Memory entry id (used when calling `LongTermMemory.remove(id)`). */
  readonly entryId: string;
  readonly title: string;
  readonly category: string;
  /** Filesystem path when known (shown for transparency on verbose mode). */
  readonly path?: string;
  /** Epoch ms when the toast was first shown. */
  readonly shownAt: number;
  /** Set once the user presses Ctrl+Z — toast renders in "reverting…" state. */
  readonly reverting?: boolean;
  /** Set after revert resolves; drives auto-dismiss of the ghost message. */
  readonly reverted?: boolean;
}

// ─── Turn state ───────────────────────────────────────────────────────────────

export interface NarrationLine {
  readonly id: string;
  readonly text: string;
  readonly kind: TaskNarrationEvent['kind'];
}

export interface TurnState {
  turnNumber: number;
  userInput: string;
  thinking: string;
  assistantText: string;
  toolCalls: ToolCallState[];
  status: 'streaming' | 'executing_tools' | 'done' | 'error';
  error?: string;
  stopReason?: StopReason;
  /** Latest agent turn_phase (model_stream / tool_execution / idle). */
  turnPhase?: TurnPhaseEvent['phase'];
  /** Wall time when the user submitted this turn (for elapsed in status UI). */
  turnStartedAtMs?: number;
  /** Latest structured plan from `task_plan` events. */
  taskPlan?: {
    steps: readonly TaskPlanStep[];
    source: 'model' | 'narrator';
    taskId?: string;
    mission?: string;
  };
  /** Recent narration lines (newest at end). */
  narrations: NarrationLine[];
  /** Latest `task_complete` event for this turn (Sprint 3.5 §5 — drives TurnSummary card). */
  taskComplete?: TaskCompleteEvent;
  /** Sprint 3.5 §5 — deterministic deliverables dashboard payload. */
  turnSummary?: TurnSummary;
}

// ─── REPL state ───────────────────────────────────────────────────────────────

export interface REPLState {
  turns: TurnState[];
  cumulative: CumulativeUsage;
  /** null = idle, waiting for user input */
  currentTurnNumber: number | null;
  inputHistory: string[];
  /** Compact tool rows + merged error groups; verbose shows full tool I/O. */
  displayMode: 'compact' | 'verbose';
  /** Sprint 3.5 §6.1 — active "已记住" toasts (FIFO; newest at end). */
  memoryToasts: MemoryToast[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type REPLAction =
  | { kind: 'userInput'; text: string }
  | { kind: 'agentEvent'; event: AgentEvent }
  | { kind: 'turnCancelled' }
  | { kind: 'resetErrors' }
  | { kind: 'toggleDisplayMode' }
  | { kind: 'memoryToastAdd'; toast: MemoryToast }
  | { kind: 'memoryToastDismiss'; id: string }
  | { kind: 'memoryToastRevertStart'; id: string }
  | { kind: 'memoryToastRevertDone'; id: string };

// ─── Initial state ────────────────────────────────────────────────────────────

export function initialState(): REPLState {
  return {
    turns: [],
    cumulative: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      turnCount: 0,
    },
    currentTurnNumber: null,
    inputHistory: [],
    displayMode: 'compact',
    memoryToasts: [],
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function replReducer(state: REPLState, action: REPLAction): REPLState {
  switch (action.kind) {
    case 'userInput': {
      const turnNumber = state.turns.length + 1;
      const newTurn: TurnState = {
        turnNumber,
        userInput: action.text,
        thinking: '',
        assistantText: '',
        toolCalls: [],
        status: 'streaming',
        turnStartedAtMs: Date.now(),
        narrations: [],
      };
      return {
        ...state,
        turns: [...state.turns, newTurn],
        currentTurnNumber: turnNumber,
        inputHistory: [...state.inputHistory, action.text].slice(-50),
      };
    }

    case 'agentEvent':
      return applyAgentEvent(state, action.event);

    case 'turnCancelled':
      return patchCurrentTurn(state, { status: 'error', error: 'Cancelled' });

    case 'resetErrors':
      return {
        ...state,
        turns: state.turns.map(t =>
          t.status === 'error' ? { ...t, error: undefined, status: 'done' } : t,
        ),
      };

    case 'toggleDisplayMode':
      return {
        ...state,
        displayMode: state.displayMode === 'compact' ? 'verbose' : 'compact',
      };

    case 'memoryToastAdd': {
      // Dedupe by entryId (avoid duplicates when the same memory is re-written).
      const existing = state.memoryToasts.filter(t => t.entryId !== action.toast.entryId);
      return { ...state, memoryToasts: [...existing, action.toast] };
    }

    case 'memoryToastDismiss':
      return {
        ...state,
        memoryToasts: state.memoryToasts.filter(t => t.id !== action.id),
      };

    case 'memoryToastRevertStart':
      return {
        ...state,
        memoryToasts: state.memoryToasts.map(t =>
          t.id === action.id ? { ...t, reverting: true } : t,
        ),
      };

    case 'memoryToastRevertDone':
      return {
        ...state,
        memoryToasts: state.memoryToasts.map(t =>
          t.id === action.id ? { ...t, reverting: false, reverted: true } : t,
        ),
      };
  }
}

// ─── Apply agent event ────────────────────────────────────────────────────────

function applyAgentEvent(state: REPLState, event: AgentEvent): REPLState {
  const idx = state.turns.findIndex(t => t.turnNumber === state.currentTurnNumber);
  if (idx === -1) return state;

  const turn = state.turns[idx]!;

  switch (event.type) {
    case 'text_delta': {
      const updated = { ...turn, assistantText: turn.assistantText + event.text };
      return replaceTurn(state, idx, updated);
    }

    case 'thinking_delta': {
      const updated = { ...turn, thinking: turn.thinking + event.text };
      return replaceTurn(state, idx, updated);
    }

    case 'tool_use_start': {
      const tc: ToolCallState = {
        toolUseId: event.toolUseId,
        toolName: event.toolName,
        inputFragment: '',
        status: 'pending',
      };
      const updated = { ...turn, toolCalls: [...turn.toolCalls, tc] };
      return replaceTurn(state, idx, updated);
    }

    case 'tool_use_input': {
      const updated = {
        ...turn,
        toolCalls: turn.toolCalls.map(tc =>
          tc.toolUseId === event.toolUseId
            ? { ...tc, inputFragment: tc.inputFragment + event.fragment }
            : tc,
        ),
      };
      return replaceTurn(state, idx, updated);
    }

    case 'tool_use_complete': {
      const updated = {
        ...turn,
        status: 'executing_tools' as const,
        toolCalls: turn.toolCalls.map(tc =>
          tc.toolUseId === event.toolUseId
            ? { ...tc, input: event.input, status: 'running' as const }
            : tc,
        ),
      };
      return replaceTurn(state, idx, updated);
    }

    case 'tool_progress': {
      const updated = {
        ...turn,
        toolCalls: turn.toolCalls.map(tc =>
          tc.toolUseId === event.toolUseId
            ? {
                ...tc,
                progressMessage: event.message,
                progressPercent: event.percent,
                progressPhase: event.phase,
              }
            : tc,
        ),
      };
      return replaceTurn(state, idx, updated);
    }

    case 'turn_phase': {
      const updated = { ...turn, turnPhase: event.phase };
      return replaceTurn(state, idx, updated);
    }

    case 'tool_result': {
      const updated = {
        ...turn,
        toolCalls: turn.toolCalls.map(tc =>
          tc.toolUseId === event.toolUseId
            ? {
                ...tc,
                result: event.result,
                isError: event.isError,
                status: (event.isError ? 'error' : 'done') as ToolCallState['status'],
                progressMessage: undefined,
                progressPercent: undefined,
                progressPhase: undefined,
              }
            : tc,
        ),
      };
      return replaceTurn(state, idx, updated);
    }

    case 'usage': {
      const turnCount = Math.max(
        state.cumulative.turnCount,
        event.cumulative.turnCount,
      );
      return {
        ...replaceTurn(state, idx, turn),
        cumulative: { ...event.cumulative, turnCount },
      };
    }

    case 'turn_complete': {
      const nextTurnCount = state.cumulative.turnCount + 1;
      const nextCumulative = { ...state.cumulative, turnCount: nextTurnCount };
      if (event.stopReason === 'tool_use') {
        const updated = {
          ...turn,
          stopReason: event.stopReason,
          status: 'streaming' as const,
        };
        return {
          ...replaceTurn(state, idx, updated),
          cumulative: nextCumulative,
        };
      }
      const updated = {
        ...turn,
        status: 'done' as const,
        stopReason: event.stopReason,
      };
      return {
        ...replaceTurn(state, idx, updated),
        currentTurnNumber: null,
        cumulative: nextCumulative,
      };
    }

    case 'error': {
      const updated = {
        ...turn,
        status: 'error' as const,
        error: event.error.message,
      };
      return {
        ...replaceTurn(state, idx, updated),
        currentTurnNumber: null,
      };
    }

    case 'status':
      return state;

    case 'task_plan': {
      const updated = {
        ...turn,
        taskPlan: {
          steps: [...event.steps],
          source: event.source,
          taskId: event.taskId,
          mission: event.mission,
        },
      };
      return replaceTurn(state, idx, updated);
    }

    case 'task_complete': {
      const updated = { ...turn, taskComplete: event };
      return replaceTurn(state, idx, updated);
    }

    case 'turn_summary': {
      const updated = { ...turn, turnSummary: event.summary };
      return replaceTurn(state, idx, updated);
    }

    case 'task_narration': {
      const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const narrations = [...(turn.narrations ?? []), { id, text: event.text, kind: event.kind }].slice(-50);
      const updated = { ...turn, narrations };
      return replaceTurn(state, idx, updated);
    }

    case 'heartbeat':
      return state;

    default:
      return state;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function replaceTurn(state: REPLState, idx: number, updated: TurnState): REPLState {
  const turns = [...state.turns];
  turns[idx] = updated;
  return { ...state, turns };
}

function patchCurrentTurn(
  state: REPLState,
  patch: Partial<TurnState>,
): REPLState {
  const idx = state.turns.findIndex(t => t.turnNumber === state.currentTurnNumber);
  if (idx === -1) return state;
  return {
    ...replaceTurn(state, idx, { ...state.turns[idx]!, ...patch }),
    currentTurnNumber: null,
  };
}
