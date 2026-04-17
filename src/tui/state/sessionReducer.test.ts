import { describe, it, expect } from 'bun:test';
import { replReducer, initialState } from './sessionReducer.js';
import type { REPLState, REPLAction } from './sessionReducer.js';
import type { AgentEvent } from '../../types/agent-events.js';

function reduce(state: REPLState, ...actions: REPLAction[]): REPLState {
  return actions.reduce(replReducer, state);
}

function withActiveUserInput(text = 'hello'): REPLState {
  return reduce(initialState(), { kind: 'userInput', text });
}

describe('replReducer — userInput', () => {
  it('creates a new streaming turn', () => {
    const s = reduce(initialState(), { kind: 'userInput', text: 'hi' });
    expect(s.turns).toHaveLength(1);
    expect(s.turns[0]!.status).toBe('streaming');
    expect(s.turns[0]!.userInput).toBe('hi');
    expect(s.currentTurnNumber).toBe(1);
  });

  it('appends to input history (max 50)', () => {
    let s = initialState();
    for (let i = 0; i < 55; i++) {
      s = reduce(s, { kind: 'userInput', text: `msg${i}` });
    }
    expect(s.inputHistory).toHaveLength(50);
    expect(s.inputHistory.at(-1)).toBe('msg54');
  });
});

describe('replReducer — agentEvent: text_delta', () => {
  it('appends text to assistantText', () => {
    const e: AgentEvent = { type: 'text_delta', text: 'Hello ' };
    const e2: AgentEvent = { type: 'text_delta', text: 'world' };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e }, { kind: 'agentEvent', event: e2 });
    expect(s.turns[0]!.assistantText).toBe('Hello world');
  });
});

describe('replReducer — agentEvent: thinking_delta', () => {
  it('appends text to thinking buffer', () => {
    const e: AgentEvent = { type: 'thinking_delta', text: 'reasoning…' };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e });
    expect(s.turns[0]!.thinking).toBe('reasoning…');
  });
});

describe('replReducer — agentEvent: tool_use_start', () => {
  it('inserts a pending tool call', () => {
    const e: AgentEvent = { type: 'tool_use_start', toolUseId: 'tc1', toolName: 'get_file' };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e });
    expect(s.turns[0]!.toolCalls).toHaveLength(1);
    expect(s.turns[0]!.toolCalls[0]!.status).toBe('pending');
    expect(s.turns[0]!.toolCalls[0]!.toolName).toBe('get_file');
  });
});

describe('replReducer — agentEvent: tool_use_input', () => {
  it('accumulates input fragment on correct tool call', () => {
    const start: AgentEvent = { type: 'tool_use_start', toolUseId: 'tc1', toolName: 'search' };
    const frag: AgentEvent = { type: 'tool_use_input', toolUseId: 'tc1', fragment: '{"q":' };
    const frag2: AgentEvent = { type: 'tool_use_input', toolUseId: 'tc1', fragment: '"bun"}' };
    const s = reduce(
      withActiveUserInput(),
      { kind: 'agentEvent', event: start },
      { kind: 'agentEvent', event: frag },
      { kind: 'agentEvent', event: frag2 },
    );
    expect(s.turns[0]!.toolCalls[0]!.inputFragment).toBe('{"q":"bun"}');
  });
});

describe('replReducer — agentEvent: tool_use_complete', () => {
  it('sets tool call to running and stores parsed input', () => {
    const start: AgentEvent = { type: 'tool_use_start', toolUseId: 'tc1', toolName: 'search' };
    const complete: AgentEvent = { type: 'tool_use_complete', toolUseId: 'tc1', toolName: 'search', input: { q: 'bun' } };
    const s = reduce(
      withActiveUserInput(),
      { kind: 'agentEvent', event: start },
      { kind: 'agentEvent', event: complete },
    );
    expect(s.turns[0]!.toolCalls[0]!.status).toBe('running');
    expect(s.turns[0]!.toolCalls[0]!.input).toEqual({ q: 'bun' });
    expect(s.turns[0]!.status).toBe('executing_tools');
  });
});

describe('replReducer — agentEvent: tool_result', () => {
  it('marks tool call done with result', () => {
    const start: AgentEvent = { type: 'tool_use_start', toolUseId: 'tc1', toolName: 'search' };
    const result: AgentEvent = { type: 'tool_result', toolUseId: 'tc1', toolName: 'search', result: 'ok', isError: false };
    const s = reduce(
      withActiveUserInput(),
      { kind: 'agentEvent', event: start },
      { kind: 'agentEvent', event: result },
    );
    expect(s.turns[0]!.toolCalls[0]!.status).toBe('done');
    expect(s.turns[0]!.toolCalls[0]!.result).toBe('ok');
  });

  it('marks tool call error on isError=true', () => {
    const start: AgentEvent = { type: 'tool_use_start', toolUseId: 'tc1', toolName: 'x' };
    const result: AgentEvent = { type: 'tool_result', toolUseId: 'tc1', toolName: 'x', result: 'boom', isError: true };
    const s = reduce(
      withActiveUserInput(),
      { kind: 'agentEvent', event: start },
      { kind: 'agentEvent', event: result },
    );
    expect(s.turns[0]!.toolCalls[0]!.status).toBe('error');
  });
});

describe('replReducer — agentEvent: usage', () => {
  it('updates cumulative on the state', () => {
    const cumulative = { totalInputTokens: 100, totalOutputTokens: 50, totalCacheCreationTokens: 0, totalCacheReadTokens: 10, turnCount: 1 };
    const e: AgentEvent = { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 }, cumulative };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e });
    expect(s.cumulative).toEqual(cumulative);
  });
});

describe('replReducer — agentEvent: turn_complete', () => {
  it('marks turn done and clears currentTurnNumber', () => {
    const e: AgentEvent = { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e });
    expect(s.turns[0]!.status).toBe('done');
    expect(s.turns[0]!.stopReason).toBe('end_turn');
    expect(s.currentTurnNumber).toBeNull();
  });
});

describe('replReducer — agentEvent: error', () => {
  it('marks turn error and clears currentTurnNumber', () => {
    const e: AgentEvent = { type: 'error', error: new Error('boom'), recoverable: false };
    const s = reduce(withActiveUserInput(), { kind: 'agentEvent', event: e });
    expect(s.turns[0]!.status).toBe('error');
    expect(s.turns[0]!.error).toBe('boom');
    expect(s.currentTurnNumber).toBeNull();
  });
});

describe('replReducer — turnCancelled', () => {
  it('marks current turn as error with Cancelled message', () => {
    const s = reduce(withActiveUserInput(), { kind: 'turnCancelled' });
    expect(s.turns[0]!.status).toBe('error');
    expect(s.turns[0]!.error).toBe('Cancelled');
    expect(s.currentTurnNumber).toBeNull();
  });
});

describe('replReducer — noop when no active turn', () => {
  it('ignores agentEvent when no active turn', () => {
    const s0 = initialState();
    const e: AgentEvent = { type: 'text_delta', text: 'orphan' };
    const s = reduce(s0, { kind: 'agentEvent', event: e });
    expect(s.turns).toHaveLength(0);
  });
});
