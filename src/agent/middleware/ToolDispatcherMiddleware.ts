import { ToolResultEvent } from '../../types/agent-events.js';
import { ToolIntegrationFacade, ToolUseContext } from '../../types/tool.js';
import { PermissionSandbox } from '../../permission/PermissionSandbox.js';

/**
 * Executes accumulated tool_use blocks and yields results.
 *
 * This is NOT a pipeline StreamMiddleware — it provides a standalone
 * async generator for tool dispatch, called by the Agent Loop after
 * a turn with stopReason='tool_use'.
 *
 * Sprint 1: Serial execution. Parallel execution deferred to Sprint 5 Step 13.
 */
export class ToolDispatcherMiddleware {
  constructor(
    private readonly tools: ToolIntegrationFacade,
    private readonly sandbox: PermissionSandbox,
  ) {}

  /**
   * Execute all pending tool uses and yield results one by one.
   */
  async *dispatchTools(
    pendingToolUses: Array<{ id: string; name: string; input: unknown }>,
    agentContext: ToolUseContext,
  ): AsyncGenerator<ToolResultEvent> {
    for (const toolUse of pendingToolUses) {
      const tool = this.tools.findTool(toolUse.name);
      if (!tool) {
        yield {
          type: 'tool_result',
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          result: `Unknown tool: ${toolUse.name}`,
          isError: true,
        };
        continue;
      }

      try {
        // Permission check
        const permCheck = await tool.checkPermissions(toolUse.input, agentContext as any);
        if (permCheck.behavior === 'deny') {
          yield {
            type: 'tool_result',
            toolUseId: toolUse.id,
            toolName: toolUse.name,
            result: `Permission denied for tool: ${toolUse.name}`,
            isError: true,
          };
          continue;
        }

        // Input validation
        if (tool.validateInput) {
          const valid = await tool.validateInput(toolUse.input, agentContext as any);
          if (!valid.result) {
            yield {
              type: 'tool_result',
              toolUseId: toolUse.id,
              toolName: toolUse.name,
              result: `Validation failed: ${valid.errors?.map(e => e.message).join('; ')}`,
              isError: true,
            };
            continue;
          }
        }

        // Execute
        const result = await tool.call(toolUse.input, agentContext as any);
        yield {
          type: 'tool_result',
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          result: (result.output as string) ?? 'Success',
          isError: !result.success,
        };
      } catch (e: any) {
        yield {
          type: 'tool_result',
          toolUseId: toolUse.id,
          toolName: toolUse.name,
          result: `Error executing tool: ${e.message}`,
          isError: true,
        };
      }
    }
  }
}
