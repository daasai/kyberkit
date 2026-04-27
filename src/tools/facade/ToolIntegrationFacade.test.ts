import { describe, it, expect, mock } from 'bun:test';
import { DefaultToolIntegrationFacade } from './ToolIntegrationFacade.js';
import { ShellExecutor, MCPToolRegistry, SkillRegistry, ToolDefinition, ToolResult } from '../../types/tool.js';
import { BuiltinToolRegistry } from '../builtin/BuiltinToolRegistry.js';
import { z } from 'zod';

// Mocks
const mockShell: ShellExecutor = {
  exec: mock(async () => ({ stdout: '', stderr: '', exitCode: 0, interrupted: false })),
  execBackground: mock(async () => ({})),
  isReadOnly: mock(() => true),
  isDestructive: mock(() => false),
};

const mockMcp: MCPToolRegistry = {
  findTool: mock((name: string) => {
    if (name === 'mcp_tool') return createMockTool('mcp_tool');
    return undefined;
  }),
  listTools: mock(() => [createMockTool('mcp_tool')]),
};

const mockSkills: SkillRegistry = {
  findSkill: mock((name: string) => {
    if (name === 'skill_tool') return createMockTool('skill_tool');
    return undefined;
  }),
  listSkills: mock(() => [createMockTool('skill_tool')]),
  listSkillMetas: mock(() => []),
};

function createMockTool(name: string): ToolDefinition {
  return {
    name,
    inputSchema: z.any(),
    maxResultSizeChars: 1000,
    description: async () => 'mock',
    call: async () => ({ success: true }),
    isConcurrencySafe: () => true,
    isReadOnly: () => true,
    isEnabled: () => true,
    checkPermissions: async () => ({ behavior: 'allow' }),
  };
}

describe('ToolIntegrationFacade (M4.Facade)', () => {
  const mockBuiltins = new BuiltinToolRegistry([createMockTool('builtin_tool')]);
  const facade = new DefaultToolIntegrationFacade(mockShell, mockMcp, mockSkills, mockBuiltins);

  it('should list builtins + MCP only (skills are prompt-injected, not model tools)', () => {
    const allTools = facade.listAll();
    expect(allTools.length).toBe(2);
    const names = allTools.map((t) => t.name).sort();
    expect(names).toEqual(['builtin_tool', 'mcp_tool']);
  });

  it('should resolve builtin before MCP and skill', () => {
    expect(facade.findTool('builtin_tool')?.name).toBe('builtin_tool');
    expect(facade.findTool('mcp_tool')?.name).toBe('mcp_tool');
    expect(facade.findTool('skill_tool')?.name).toBe('skill_tool');
  });

  it('should return undefined if tool is not found', () => {
    const tool = facade.findTool('unknown_tool');
    expect(tool).toBeUndefined();
  });
});
