import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * MemoryProvider — Injects retrieved memories into the system prompt.
 * Uses the memoryContext provided in the AssemblyContext (per-agent).
 *
 * Sprint 2, Step 5.
 */
export class MemoryProvider implements PromptSectionProvider {
  readonly id = 'memory_context';
  readonly priority = 3;
  readonly cacheable = false;
  readonly source = 'dynamic' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    const ctx = context.memoryContext;
    if (!ctx || ctx.trim().length === 0) return null;
    return `# Memory Context\n\n${ctx}`;
  }
}
