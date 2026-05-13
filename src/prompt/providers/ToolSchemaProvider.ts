import { PromptSectionProvider, AssemblyContext } from '../../types/prompt.js';

/**
 * ToolSchemaProvider — Injects descriptions of available tools/skills.
 * Note: These are text descriptions for the system prompt, not JSON schemas.
 *
 * Sprint 2, Step 5.
 */
export class ToolSchemaProvider implements PromptSectionProvider {
  readonly id = 'tool_schemas';
  readonly priority = 1;
  readonly cacheable = true;
  readonly source = 'system' as const;

  async provide(context: AssemblyContext): Promise<string | null> {
    if (!context.tools || context.tools.length === 0) return null;

    const lines = ['# Available Tools', ''];
    for (const tool of context.tools) {
      lines.push(`## ${tool.name}`);
      lines.push(tool.description);
      lines.push('');
    }
    return lines.join('\n');
  }
}
