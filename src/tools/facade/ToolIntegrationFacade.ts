import { ToolDefinition, ToolIntegrationFacade, ShellExecutor, MCPToolRegistry, SkillRegistry } from '../../types/tool.js';

export class DefaultToolIntegrationFacade implements ToolIntegrationFacade {
  constructor(
    public readonly shell: ShellExecutor,
    public readonly mcp: MCPToolRegistry,
    public readonly skills: SkillRegistry,
  ) {}

  /**
   * Find a tool by name across all source registries.
   * Resolution priority: Skill > MCP > Builtin (Shell)
   */
  findTool(query: string): ToolDefinition | undefined {
    // 1. Check Skills
    const skill = this.skills.findSkill(query);
    if (skill) return skill;
    
    // 2. Check MCP
    const mcpTool = this.mcp.findTool(query);
    if (mcpTool) return mcpTool;

    // Shell tool etc. would be constructed here if it's represented as a `ToolDefinition`,
    // but in Phase 0, shell commands might be directly handled differently, 
    // or wrapped into a 'BashTool'. 
    // Since Phase 0 spec mentions findTool should return SkillDefinition | MCPTool | null, 
    // we return undefined here.
    return undefined;
  }

  /**
   * List all tools from all registries.
   */
  listAll(): ToolDefinition[] {
    return [
      ...this.skills.listSkills(),
      ...this.mcp.listTools(),
    ];
  }
}
