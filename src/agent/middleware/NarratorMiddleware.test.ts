import { describe, it, expect } from 'bun:test';
import { NarratorMiddleware } from './NarratorMiddleware.js';
import type { AgentEvent } from '../../types/agent-events.js';
import type { MiddlewareContext } from '../StreamMiddleware.js';

function makeContext(userText = 'test task'): MiddlewareContext {
  return {
    agent: {} as any,
    turnNumber: 1,
    latestUserTurnText: userText,
    cumulative: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      turnCount: 0,
    },
    accumulatedContent: [],
    pendingToolUses: [],
    stopReason: null,
  };
}

function processAll(
  mw: NarratorMiddleware,
  ctx: MiddlewareContext,
  events: AgentEvent[],
): AgentEvent[] {
  const out: AgentEvent[] = [];
  for (const e of events) {
    const r = mw.process(e, ctx);
    if (r == null) continue;
    if (Array.isArray(r)) out.push(...r);
    else out.push(r);
  }
  return out;
}

describe('NarratorMiddleware — task boundaries', () => {
  it('synthesizes task_complete after turn_complete with stopReason=end_turn', () => {
    const mw = new NarratorMiddleware();
    const ctx = makeContext('write a test');
    const events: AgentEvent[] = [
      { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] },
    ];

    const out = processAll(mw, ctx, events);
    const taskComplete = out.find(e => e.type === 'task_complete');
    expect(taskComplete).toBeDefined();
    if (taskComplete && taskComplete.type === 'task_complete') {
      expect(taskComplete.turnsInTask).toBe(1);
      expect(taskComplete.mission).toBe('write a test');
      expect(taskComplete.stopReason).toBe('end_turn');
    }
  });

  it('does not emit task_complete when stopReason=tool_use (task continues)', () => {
    const mw = new NarratorMiddleware();
    const ctx = makeContext('task');
    const events: AgentEvent[] = [
      { type: 'turn_complete', turnNumber: 1, stopReason: 'tool_use', content: [] },
    ];
    const out = processAll(mw, ctx, events);
    expect(out.find(e => e.type === 'task_complete')).toBeUndefined();
  });

  it('attaches taskId and mission to task_plan from plan_task tool call', () => {
    const mw = new NarratorMiddleware();
    const ctx = makeContext('initial user text');
    const events: AgentEvent[] = [
      {
        type: 'tool_use_complete',
        toolUseId: 'tu1',
        toolName: 'plan_task',
        input: { steps: ['Read', 'Write'], mission: '重构 AuthService' },
      },
    ];
    const out = processAll(mw, ctx, events);
    const plan = out.find(e => e.type === 'task_plan');
    expect(plan).toBeDefined();
    if (plan && plan.type === 'task_plan') {
      expect(plan.mission).toBe('重构 AuthService');
      expect(plan.taskId).toBeDefined();
      expect(plan.steps.length).toBe(2);
    }
  });

  it('carries mission from plan through to task_complete', () => {
    const mw = new NarratorMiddleware();
    const ctx = makeContext('raw user input');
    const events: AgentEvent[] = [
      {
        type: 'tool_use_complete',
        toolUseId: 'tu1',
        toolName: 'plan_task',
        input: { steps: ['A', 'B'], mission: '关键任务' },
      },
      {
        type: 'tool_result',
        toolUseId: 'tu1',
        toolName: 'plan_task',
        result: 'ok',
        isError: false,
      },
      { type: 'turn_complete', turnNumber: 1, stopReason: 'tool_use', content: [] },
      { type: 'turn_complete', turnNumber: 2, stopReason: 'end_turn', content: [] },
    ];
    const out = processAll(mw, ctx, events);
    const taskComplete = out.find(e => e.type === 'task_complete');
    expect(taskComplete).toBeDefined();
    if (taskComplete && taskComplete.type === 'task_complete') {
      expect(taskComplete.mission).toBe('关键任务');
      expect(taskComplete.turnsInTask).toBe(2);
    }
  });

  it('counts tool calls and errors across the task', () => {
    const mw = new NarratorMiddleware();
    const ctx = makeContext('task');
    const events: AgentEvent[] = [
      { type: 'tool_use_complete', toolUseId: 'tu1', toolName: 'read_file', input: { path: 'a' } },
      { type: 'tool_result', toolUseId: 'tu1', toolName: 'read_file', result: 'ok', isError: false },
      { type: 'tool_use_complete', toolUseId: 'tu2', toolName: 'write_file', input: { path: 'b', content: 'c' } },
      { type: 'tool_result', toolUseId: 'tu2', toolName: 'write_file', result: 'err', isError: true },
      { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] },
    ];
    const out = processAll(mw, ctx, events);
    const taskComplete = out.find(e => e.type === 'task_complete');
    expect(taskComplete).toBeDefined();
    if (taskComplete && taskComplete.type === 'task_complete') {
      expect(taskComplete.toolCalls).toBe(2);
      expect(taskComplete.errors).toBe(1);
    }
  });

  it('starts a fresh task after the previous one closes', () => {
    const mw = new NarratorMiddleware();
    const ctx1 = makeContext('task one');
    const out1 = processAll(mw, ctx1, [
      { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] },
    ]);
    const task1 = out1.find(e => e.type === 'task_complete');
    expect(task1 && task1.type === 'task_complete').toBeTruthy();
    const id1 = task1 && task1.type === 'task_complete' ? task1.taskId : '';

    const ctx2 = makeContext('task two');
    const out2 = processAll(mw, ctx2, [
      { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] },
    ]);
    const task2 = out2.find(e => e.type === 'task_complete');
    expect(task2 && task2.type === 'task_complete').toBeTruthy();
    const id2 = task2 && task2.type === 'task_complete' ? task2.taskId : '';

    expect(id1).not.toBe(id2);
  });
});
