import type { ToolContext } from '../types/tool.js';
import type { ResolvedToolForApi, ToolDefinition } from '../types/tool.js';

/**
 * Materialize tool descriptions for Anthropic API + PromptAssembler (async description → string).
 */
export async function resolveToolsForApi(
  tools: ToolDefinition[],
  ctx: ToolContext,
): Promise<ResolvedToolForApi[]> {
  const out: ResolvedToolForApi[] = [];
  for (const t of tools) {
    const desc = await t.description(undefined as any, ctx);
    out.push({
      name: t.name,
      description: desc,
      inputSchema: t.inputSchema,
    });
  }
  return out;
}
