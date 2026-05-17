import {
  ToolDefinition,
  ToolIntegrationFacade,
  ShellExecutor,
  MCPToolRegistry,
  SkillRegistry,
} from '../../types/tool.js';
import type { BuiltinToolRegistry } from '../builtin/BuiltinToolRegistry.js';
import type { SkillMeta } from '../skills/SkillMeta.js';

export class DefaultToolIntegrationFacade implements ToolIntegrationFacade {
  constructor(
    public readonly shell: ShellExecutor,
    public readonly mcp: MCPToolRegistry,
    public readonly skills: SkillRegistry,
    public readonly builtins: BuiltinToolRegistry,
  ) {}

  /**
   * Resolve a tool: builtins → MCP → skills (skills remain for legacy transcripts / explicit invoke).
   */
  findTool(query: string): ToolDefinition | undefined {
    const builtin = this.builtins.findTool(query);
    if (builtin) return builtin;

    const mcpTool = this.mcp.findTool(query);
    if (mcpTool) return mcpTool;

    const skill = this.skills.findSkill(query);
    if (skill) return skill;

    return undefined;
  }

  /**
   * Tools exposed to the model (builtins + MCP). Skills are injected via PromptAssembler only.
   * Builtins win on name collisions — MCP filesystem servers often mirror builtin names.
   */
  listAll(): ToolDefinition[] {
    const builtins = this.builtins.listTools();
    const builtinNames = new Set(builtins.map((t) => t.name));
    const mcpTools = this.mcp.listTools().filter((t) => !builtinNames.has(t.name));
    return [...builtins, ...mcpTools];
  }

  listSkillMetas(): SkillMeta[] {
    return this.skills.listSkillMetas?.() ?? [];
  }
}
