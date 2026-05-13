import type { ToolDefinition, ToolUseContext } from '../types/tool.js';

export type PreToolHookResult = { deny?: string; updatedInput?: unknown };

/**
 * Extensible Pre/Post tool hooks (DeepCC Phase 8 alignment). Wired through ToolDispatcherMiddleware.
 */
export class ToolHookRegistry {
  private pre: Array<
    (tool: ToolDefinition, input: unknown, ctx: ToolUseContext) => Promise<PreToolHookResult | void>
  > = [];

  registerPre(
    fn: (tool: ToolDefinition, input: unknown, ctx: ToolUseContext) => Promise<PreToolHookResult | void>,
  ): void {
    this.pre.push(fn);
  }

  async runPre(
    tool: ToolDefinition,
    input: unknown,
    ctx: ToolUseContext,
  ): Promise<{ input: unknown; deny?: string }> {
    let cur = input;
    for (const fn of this.pre) {
      const r = await fn(tool, cur, ctx);
      if (r?.deny) return { input: cur, deny: r.deny };
      if (r?.updatedInput !== undefined) cur = r.updatedInput;
    }
    return { input: cur };
  }
}
