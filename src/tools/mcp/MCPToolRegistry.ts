import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolDefinition, ToolResult, ToolUseContext } from '../../types/tool.js';
import { MCPServerConfig } from '../../types/config.js';
import { z } from 'zod';

export interface MCPConnection {
  readonly config: MCPServerConfig;
  readonly client: Client;
  readonly transport: any;
  readonly tools: ToolDefinition[];
}

export class DefaultMCPToolRegistry {
  private connections = new Map<string, MCPConnection>();
  private tools = new Map<string, ToolDefinition>();

  /**
   * Connect to an MCP server and register its tools.
   */
  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    if (config.transport !== 'stdio') {
      throw new Error(`Transport "${config.transport}" not yet supported.`);
    }

    const transport = new StdioClientTransport({
      command: config.command!,
      args: config.args ?? [],
    });

    const client = new Client({ name: 'kyberkit', version: '0.1.0' });
    await client.connect(transport);

    // List server tools
    const { tools } = await client.listTools();
    const wrappedTools = tools.map(t => this.wrapMCPTool(config.name, t, client));

    for (const tool of wrappedTools) {
      this.tools.set(tool.name, tool);
    }

    const conn: MCPConnection = { config, client, transport, tools: wrappedTools };
    this.connections.set(config.name, conn);
    return conn;
  }

  /**
   * Disconnect from an MCP server and remove its tools.
   */
  async disconnect(serverName: string): Promise<void> {
    const conn = this.connections.get(serverName);
    if (!conn) return;

    await conn.client.close();
    for (const tool of conn.tools) {
      this.tools.delete(tool.name);
    }
    this.connections.set(serverName, undefined as any);
    this.connections.delete(serverName);
  }

  /**
   * Find a registered tool by name.
   */
  findTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered MCP tools.
   */
  listTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Helper to wrap MCP SDK tool into KyberKit ToolDefinition.
   */
  private wrapMCPTool(serverName: string, mcpTool: any, client: Client): ToolDefinition {
    const toolName = mcpTool.name;
    
    // We create a loose schema for now, can be improved with JsonSchema to Zod conversion
    const inputSchema = z.any(); 

    return {
      name: toolName,
      description: async () => mcpTool.description ?? `Tool from ${serverName}: ${toolName}`,
      inputSchema,
      maxResultSizeChars: 100_000,
      
      async call(input: any, context: ToolUseContext): Promise<ToolResult> {
        try {
          const result = await client.callTool({
            name: toolName,
            arguments: input
          });

          // MCP returns content segments
          const content = (result.content as any[]) ?? [];
          const textContent = content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');

          return { success: true, output: textContent };
        } catch (err: any) {
          return { success: false, error: err.message };
        }
      },

      isConcurrencySafe: () => true,
      isReadOnly: () => false, // Default is unknown, usually MCP tools are assumed read-write
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' }),
    };
  }
}
