import type { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';
import { shouldSuggestPlanTask } from '../../agent/planTaskSuggestion.js';

/**
 * Injects a short instruction to call `plan_task` for long / exploratory user requests.
 */
export class PlanningHintProvider implements PromptSectionProvider {
  readonly id = 'planning_hint';
  readonly priority = 11;
  readonly cacheable = false;
  readonly source = 'dynamic' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    const t = context.userTurnText?.trim() ?? '';
    if (!shouldSuggestPlanTask(t)) return null;
    return [
      '# Task planning (multi-step work)',
      'For this request, call **plan_task** once before other tools with JSON field `steps`: an array of 3–6 short step titles.',
      'After that, execute tools in order; you may call **plan_task** again to replace the plan if the approach changes.',
    ].join('\n');
  }
}
