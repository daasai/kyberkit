import { describe, it, expect } from 'bun:test';
import { transition, isTerminal } from './AgentStateMachine.js';
import { InvalidTransitionError } from '../types/errors.js';

describe('AgentStateMachine (M6.1)', () => {
  it('should allow valid transitions', () => {
    expect(transition('created', 'start')).toBe('initializing');
    expect(transition('initializing', 'ready')).toBe('running');
    expect(transition('running', 'pause')).toBe('paused');
    expect(transition('running', 'task_done')).toBe('completing');
    expect(transition('running', 'kill')).toBe('killed');
    expect(transition('running', 'error')).toBe('failed');
    expect(transition('paused', 'resume')).toBe('running');
    expect(transition('completing', 'verified')).toBe('completed');
    expect(transition('completing', 'verification_failed')).toBe('running');
  });

  it('should throw InvalidTransitionError on invalid transitions', () => {
    expect(() => transition('created', 'pause')).toThrow(InvalidTransitionError);
    expect(() => transition('running', 'start')).toThrow(InvalidTransitionError);
    expect(() => transition('completed', 'kill')).toThrow(InvalidTransitionError);
    expect(() => transition('failed', 'resume')).toThrow(InvalidTransitionError);
  });

  it('should correctly identify terminal states', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('killed')).toBe(true);

    expect(isTerminal('created')).toBe(false);
    expect(isTerminal('initializing')).toBe(false);
    expect(isTerminal('running')).toBe(false);
    expect(isTerminal('paused')).toBe(false);
    expect(isTerminal('completing')).toBe(false);
  });
});
