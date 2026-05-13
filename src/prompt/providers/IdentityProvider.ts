import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * IdentityProvider — Provides the core persona and character of the agent.
 * Supports workspace-level overrides.
 *
 * Sprint 2, Step 5.
 */
export class IdentityProvider implements PromptSectionProvider {
  readonly id = 'identity';
  readonly priority = 1;
  readonly cacheable = true;
  readonly source = 'system' as const;

  constructor(
    private readonly defaultPrompt: string,
    private readonly getWorkspaceIdentity?: () => string | undefined,
  ) {}

  async provide(context: AssemblyContext): Promise<string> {
    // 1. Check for identity inside the provided workspace config
    if (context.workspaceConfig?.identityPrompt) {
      return context.workspaceConfig.identityPrompt;
    }

    // 2. Check for identity via the injected getter (legacy/runtime hook)
    const wsIdentity = this.getWorkspaceIdentity?.();
    if (wsIdentity) {
      return wsIdentity;
    }

    // 3. Fallback to default
    return this.defaultPrompt;
  }
}
