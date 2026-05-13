import { AgentStatus } from '../types/agent.js';
import { InvalidTransitionError } from '../types/errors.js';

/**
 * Valid transitions between Agent states.
 * This is a deterministic pure function mapping without side effects.
 */
const TRANSITIONS: Record<AgentStatus, Partial<Record<string, AgentStatus>>> = {
  created:      { start: 'initializing' },
  initializing: { ready: 'running', init_error: 'failed' },
  running:      { pause: 'paused', task_done: 'completing', kill: 'killed', error: 'failed' },
  paused:       { resume: 'running', kill: 'killed' },
  completing:   { verified: 'completed', verification_failed: 'running', kill: 'killed' },
  completed:    {},  // terminal
  failed:       {},  // terminal
  killed:       {},  // terminal
};

/**
 * Computes the next state given a current state and an action.
 * Throws InvalidTransitionError if the transition is impossible.
 */
export function transition(current: AgentStatus, action: string): AgentStatus {
  const next = TRANSITIONS[current]?.[action];
  if (!next) {
    throw new InvalidTransitionError(current, action);
  }
  return next;
}

/**
 * Checks if a state is a terminal state (cannot transition to any other state).
 */
export function isTerminal(status: AgentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}
