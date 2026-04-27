import { describe, it, expect } from 'bun:test';
import { resolveMission } from './mission.js';
import type { TurnState } from '../state/sessionReducer.js';

function turn(partial: Partial<TurnState>): TurnState {
  return {
    turnNumber: 1,
    userInput: '',
    thinking: '',
    assistantText: '',
    toolCalls: [],
    status: 'streaming',
    narrations: [],
    ...partial,
  } as TurnState;
}

describe('resolveMission', () => {
  it('returns empty string when no turn supplied', () => {
    expect(resolveMission(undefined)).toBe('');
  });

  it('prefers taskPlan.mission over everything else', () => {
    const t = turn({
      userInput: '请帮我重构一下 AuthService',
      taskPlan: {
        source: 'model',
        steps: [{ id: 's0', title: '读取文件', status: 'active' }],
        mission: '重构 AuthService',
      },
    });
    expect(resolveMission(t)).toBe('重构 AuthService');
  });

  it('falls back to active step title when no mission', () => {
    const t = turn({
      userInput: 'userInput fallback',
      taskPlan: {
        source: 'narrator',
        steps: [
          { id: 's0', title: '读取文件', status: 'done' },
          { id: 's1', title: '编辑文件', status: 'active' },
        ],
      },
    });
    expect(resolveMission(t)).toBe('编辑文件');
  });

  it('falls back to first step when no active step', () => {
    const t = turn({
      userInput: 'user input',
      taskPlan: {
        source: 'narrator',
        steps: [{ id: 's0', title: '第一步', status: 'pending' }],
      },
    });
    expect(resolveMission(t)).toBe('第一步');
  });

  it('falls back to userInput (truncated) when no plan', () => {
    const t = turn({ userInput: '帮我整理一下 README.md 里的所有二级标题，顺便修改错别字。' });
    const out = resolveMission(t, 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith('…')).toBe(true);
  });

  it('returns empty string when turn has no content', () => {
    const t = turn({});
    expect(resolveMission(t)).toBe('');
  });
});
