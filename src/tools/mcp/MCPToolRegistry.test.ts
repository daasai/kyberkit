import { describe, it, expect, mock } from 'bun:test';
import { DefaultMCPToolRegistry } from './MCPToolRegistry.js';
import { MCPServerConfig } from '../../types/config.js';

// Mock the MCP SDK using Bun's native mock.module
mock.module('@modelcontextprotocol/sdk/client', () => {
  return {
    Client: class {
      connect = mock(async () => {});
      close = mock(async () => {});
      listTools = mock(async () => ({
        tools: [
          {
            name: 'get_weather',
            description: 'Get weather for a city',
            inputSchema: {
              type: 'object',
              properties: {
                city: { type: 'string' }
              },
              required: ['city']
            }
          }
        ]
      }));
      callTool = mock(async () => ({
        content: [{ type: 'text', text: 'Sunny, 25°C' }]
      }));
    }
  };
});

let lastStdioTransportArgs: { command: string; args: string[] } | null = null
mock.module('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: class {
      constructor(opts: { command: string; args: string[] }) {
        lastStdioTransportArgs = opts
      }
    },
  }
})

describe('MCPToolRegistry (M4.L1)', () => {
  const registry = new DefaultMCPToolRegistry();
  const mockConfig: MCPServerConfig = {
    name: 'weather-server',
    transport: 'stdio',
    command: 'node',
    args: ['weather.js'],
    trustLevel: 'sandboxed'
  };

  it('should connect to an MCP server and load tools', async () => {
    const conn = await registry.connect(mockConfig);
    expect(conn.config.name).toBe('weather-server');
    expect(conn.tools.length).toBe(1);
    expect(conn.tools[0].name).toBe('get_weather');
  });

  it('should find a registered tool by name', async () => {
    await registry.connect(mockConfig);
    const tool = registry.findTool('get_weather');
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('get_weather');
  });

  it('should execute a tool call and return formatted result', async () => {
    await registry.connect(mockConfig);
    const tool = registry.findTool('get_weather')!;
    
    const result = await tool.call({ city: 'San Francisco' }, {
      agentId: 'agent-1',
      traceId: 'trace-1',
      callId: 'call-1'
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe('Sunny, 25°C');
  });

  it('should disconnect and remove tools', async () => {
    await registry.connect(mockConfig);
    expect(registry.findTool('get_weather')).toBeDefined();
    
    await registry.disconnect('weather-server');
    expect(registry.findTool('get_weather')).toBeUndefined();
  });

  it('should append rootOverride to stdio spawn args', async () => {
    lastStdioTransportArgs = null
    const r = new DefaultMCPToolRegistry()
    await r.connect(mockConfig, ['/tmp/lib-mount', '/other'])
    expect(lastStdioTransportArgs).not.toBeNull()
    expect(lastStdioTransportArgs!.command).toBe('node')
    expect(lastStdioTransportArgs!.args).toEqual(['weather.js', '/tmp/lib-mount', '/other'])
    await r.disconnectAll()
    expect(r.findTool('get_weather')).toBeUndefined()
  });
});
