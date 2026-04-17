import { 
  PromptSectionProvider, 
  AssemblyContext, 
  AssembledPrompt, 
  PromptSection 
} from '../types/prompt.js';

/**
 * PromptAssembler — coordinates the dynamic construction of the system prompt.
 * Collects content from multiple PromptSectionProviders, respects priorities,
 * and manages a token budget.
 *
 * Sprint 2, Step 5.
 */
export class PromptAssembler {
  private providers: PromptSectionProvider[] = [];

  /** Register a provider for the assembly pipeline. */
  register(provider: PromptSectionProvider): this {
    this.providers.push(provider);
    // Sort by priority (1 is highest)
    this.providers.sort((a, b) => a.priority - b.priority);
    return this;
  }

  /**
   * Assemble the system prompt using all registered providers.
   * Cuts off sections if they exceed the specified budget.
   */
  async assemble(context: AssemblyContext): Promise<AssembledPrompt> {
    const includedSections: PromptSection[] = [];
    let totalTokens = 0;

    for (const provider of this.providers) {
      const content = await provider.provide(context);
      if (!content || content.trim().length === 0) continue;

      const sectionTokens = this.estimateTokens(content);

      // Rule: Priority 1 sections (Identity, Tools) are always included.
      // Other sections are included only if they fit within the remaining budget.
      if (provider.priority > 1 && (totalTokens + sectionTokens) > context.budget) {
        continue;
      }

      includedSections.push({
        id: provider.id,
        content,
        cacheable: provider.cacheable,
        priority: provider.priority,
        source: provider.source,
      });

      totalTokens += sectionTokens;
    }

    return {
      text: includedSections.map(s => s.content).join('\n\n'),
      sections: includedSections,
      estimatedTokens: totalTokens,
      cacheBreakpoints: [], // Reserved for Sprint 5
    };
  }

  /** Simple token estimation (chars / 3.5 per spec) */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 3.5);
  }
}
