import type { TurnState } from '../state/sessionReducer.js';

/**
 * Resolve the short mission title for the IdentityBand.
 *
 * Priority (Sprint 3.5 §3.2 mission resolution):
 *  1. taskPlan.mission (assigned by NarratorMiddleware from `plan_task.mission`
 *     or upstream narrator state)
 *  2. First plan step title
 *  3. Truncated userInput
 *  4. Empty string (caller decides fallback copy, e.g. "待命")
 */
export function resolveMission(turn: TurnState | undefined, maxLen = 48): string {
  if (!turn) return '';

  const planMission = turn.taskPlan?.mission?.trim();
  if (planMission) return truncate(planMission, maxLen);

  const firstActive = turn.taskPlan?.steps.find((s) => s.status === 'active');
  if (firstActive?.title) return truncate(firstActive.title, maxLen);

  const firstStep = turn.taskPlan?.steps[0]?.title;
  if (firstStep) return truncate(firstStep, maxLen);

  if (turn.userInput) return truncate(turn.userInput.trim(), maxLen);

  return '';
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
