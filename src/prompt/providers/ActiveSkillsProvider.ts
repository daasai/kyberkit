import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * Injects discovered SKILL.md bodies as workflow guidance (not as callable tools).
 */
export class ActiveSkillsProvider implements PromptSectionProvider {
  readonly id = 'active_skills';
  readonly priority = 2;
  readonly cacheable = false;
  readonly source = 'dynamic' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    if (!context.skillContext?.trim()) return null;
    return ['# Active workflow guidance (matched skills)', '', context.skillContext.trim(), ''].join('\n');
  }
}
