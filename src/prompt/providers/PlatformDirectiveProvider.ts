import type { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * PlatformDirectiveProvider — injects product-level hard directives
 * (e.g. artifact protocol) into the assembled system prompt.
 */
export class PlatformDirectiveProvider implements PromptSectionProvider {
  readonly id = 'platform_directive';
  readonly priority = 0;
  readonly cacheable = true;
  readonly source = 'system' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    const directive = context.platformDirective?.trim();
    return directive && directive.length > 0 ? directive : null;
  }
}

