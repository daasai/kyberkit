import type { AgentEvent, CumulativeUsage } from '../../types/agent-events.js';
import type { StopReason } from '../../types/model.js';

// ─── Tool call state ─────────────────────────────────────────────────────────

export interface ToolCallState {
  toolUseId: string;
  toolName: string;
  inputFragment: string;
  input?: unknown;
  result?: string;
  isError?: boolean;
  status: 'pending' | 'running' | 'done' | 'error';
}

// ─── Turn state ───────────────────────────────────────────────────────────────

export interface TurnState {
  turnNumber: number;
  userInput: string;
  thinking: string;
  assistantText: string;
  toolCalls: ToolCallState[];
  status: 'streaming' | 'executing_tools' | 'done' | 'error';
  error?: string;
  stopReason?: StopReason;
}

// ─── REPL state ───────────────────────────────────────────────────────────────

export interface REPLState {
  turns: TurnState[];
  cumulative: CumulativeUsage;
  /** null = idle, waiting for user input */
  currentTurnNumber: number | null;
  inputHistory: string[];
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type REPLAction =
  | { kind: 'userInput'; text: string }
  | { kind: 'agentEvent'; event: AgentEvent }
  | { kind: 'turnCancelled' }
  | { kind: 'resetErrors' };

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
              }
            : tc,
        ),
      };
      return replaceTurn(state, idx, updated);
    }

    case 'usage': {
      return { ...replaceTurn(state, idx, turn), cumulative: event.cumulative };
    }

    case 'turn_complete': {
      const updated = {
        ...turn,
        status: 'done' as const,
        stopReason: event.stopReason,
      };
      return {
        ...replaceTurn(state, idx, updated),
        currentTurnNumber: null,
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
