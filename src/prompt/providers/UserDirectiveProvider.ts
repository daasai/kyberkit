import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * UserDirectiveProvider — Provides custom behavior rules from KK.md.
 * Injects merged content from all asset scopes (user, workspace, project).
 *
 * Sprint 2, Step 5.
 */
export class UserDirectiveProvider implements PromptSectionProvider {
  readonly id = 'user_directives';
  readonly priority = 2;
  readonly cacheable = true;
  readonly source = 'user' as const;

  constructor(private readonly getKKMd: () => string | null) {}

  async provide(): Promise<string | null> {
    const kkMd = this.getKKMd();
    if (!kkMd) return null;

    return `# User Directives (KK.md)\n\n${kkMd}`;
  }
}
