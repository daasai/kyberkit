import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { runAgentLoop } from './AgentLoop.js';
import { DefaultAgentInstance } from './AgentInstance.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { ModelProvider, ChatResponse } from '../types/model.js';
import { ToolIntegrationFacade, ToolDefinition } from '../types/tool.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { z } from 'zod';

describe('AgentLoop (M6.3)', () => {
  let eventBus: TypedEventBus<KyberEvents>;
  let agent: DefaultAgentInstance;
  let mockModel: ModelProvider;
  let mockFacade: ToolIntegrationFacade;
  let sandbox: PermissionSandbox;

  beforeEach(() => {
    eventBus = new TypedEventBus<KyberEvents>();
    agent = new DefaultAgentInstance('agent-1', {
      name: 'test-agent',
      model: 'test-model',
      systemPrompt: 'You are a bot',
    }, eventBus);
    
    // start agent state
    agent.transition('start');
    agent.transition('ready'); // now in 'running' state

    // Use dummy sandbox that allows everything
    sandbox = new PermissionSandbox({
      allowed: new Set(['read_fs']),
      denied: new Set(),
      allowedPaths: []
    });
    // mock sandbox checkAll to always allow for simplicity
    sandbox.checkAll = mock(() => ({ allowed: true }));
  });

  it('should run a simple conversation ending with end_turn', async () => {
    mockModel = {
      name: 'mock',
      supportedModels: [],
      capabilities: () => ({} as any),
      countTokens: async () => 0,
      chat: mock(async () => {
        return {
          role: 'assistant',
          content: [{ type: 'text', text: 'Task completed' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 0, outputTokens: 0 }
        } as ChatResponse;
      }),
      chatStream: undefined as any
    };

    mockFacade = {
      findTool: mock(() => undefined),
      listAll: mock(() => [])
    };

    // Initially agent is running
    expect(agent.status).toBe('running');

    await runAgentLoop(agent, mockModel, mockFacade, sandbox);

    // Should transition to 'task_done' and then 'verified'
    expect(agent.status).toBe('completed');
    
    // Check that context contains the assistant's response
    expect(agent.messages.length).toBe(1);
    expect(agent.messages[0].role).toBe('assistant');
    expect((agent.messages[0].content as any)[0].text).toBe('Task completed');
  });

  it('should execute a tool when returned by the model', async () => {
    let callCount = 0;
    
    const mockTool: ToolDefinition = {
      name: 'hello_tool',
      description: async () => 'hello',
      inputSchema: z.any(),
      maxResultSizeChars: 100,
      call: mock(async () => ({ success: true, output: 'Hello from tool' })),
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' })
    };

    mockModel = {
      name: 'mock',
      supportedModels: [],
      capabilities: () => ({} as any),
      countTokens: async () => 0,
      chat: mock(async () => {
        if (callCount === 0) {
          callCount++;
          return {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'call_1', name: 'hello_tool', input: {} }],
            stopReason: 'tool_use',
            usage: { inputTokens: 0, outputTokens: 0 }
          } as ChatResponse;
        } else {
          return {
            role: 'assistant',
            content: [{ type: 'text', text: 'All done.' }],
            stopReason: 'end_turn',
            usage: { inputTokens: 0, outputTokens: 0 }
          } as ChatResponse;
        }
      }),
      chatStream: undefined as any
    };

    mockFacade = {
      findTool: mock((name) => name === 'hello_tool' ? mockTool : undefined),
      listAll: mock(() => [mockTool])
    };

    await runAgentLoop(agent, mockModel, mockFacade, sandbox);
    
    expect(agent.status).toBe('completed');
    expect(mockTool.call).toHaveBeenCalled();
    
    // Assert messages structure
    expect(agent.messages[0].role).toBe('assistant'); // the tool_use
    expect(agent.messages[1].role).toBe('user'); // the tool_result
    expect((agent.messages[1].content as any)[0].type).toBe('tool_result');
    expect((agent.messages[1].content as any)[0].content).toBe('Hello from tool');
  });
});
