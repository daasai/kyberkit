import type { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';
import { Bm25LiteRecaller } from '../../memory/recall/Bm25LiteRecaller.js';
import type { LongTermMemory } from '../../memory/LongTermMemory.js';

const bm25 = new Bm25LiteRecaller();
const LTM_MAX = 5;
const L2_MAX_CHARS = 8000;

/**
 * MemoryProvider — L2 session notes + Track B L3 BM25 recall (MVP, no embeddings).
 */
export class MemoryProvider implements PromptSectionProvider {
  readonly id = 'memory_context';
  readonly priority = 4;
  readonly cacheable = false;
  readonly source = 'dynamic' as const;

  constructor(
    private readonly getLongTermMemory: () => LongTermMemory | undefined = () => undefined,
  ) {}

  async provide(context: AssemblyContext): Promise<string | null> {
    const l2 = (context.memoryContext ?? '').trim();
    const ltm = this.getLongTermMemory();
    const query = (context.userTurnText ?? '').trim();
    const parts: string[] = [];

    if (l2.length > 0) {
      const truncated = l2.length > L2_MAX_CHARS ? `${l2.slice(0, L2_MAX_CHARS)}…` : l2;
      parts.push('## Session memory', '', truncated);
    }

    if (ltm && query.length > 0) {
      const all = await ltm.list();
      if (all.length > 0) {
        const top = bm25.recall(all, query, LTM_MAX);
        if (top.length > 0) {
          const block = top
            .map(
              (e) =>
                `### ${e.metadata?.title ?? e.id} (${e.category})\n${e.content.slice(0, 1200)}`,
            )
            .join('\n\n');
          parts.push('## Long-term memory (recalled)', '', block);
        } else {
          const fallback = all
            .slice(0, Math.min(3, all.length))
            .map((e) => `### ${e.metadata?.title ?? e.id}\n${e.content.slice(0, 500)}`)
            .join('\n\n');
          parts.push('## Long-term memory (recent)', '', fallback);
        }
      }
    }

    if (parts.length === 0) return null;
    return ['# Memory Context (Recalled + Session)', ...parts].join('\n\n');
  }
}
