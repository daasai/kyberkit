import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { runAgentLoop, agentLoop, ReliabilityLayer, AgentLoopDeps } from './AgentLoop.js';
import { DefaultAgentInstance } from './AgentInstance.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { ModelProvider, ChatResponse, StreamEvent } from '../types/model.js';
import { ToolIntegrationFacade, ToolDefinition } from '../types/tool.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { MiddlewarePipeline } from './StreamMiddleware.js';
import { TokenCounterMiddleware } from './middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from './middleware/ContentAccumulatorMiddleware.js';
import { AgentEvent } from '../types/agent-events.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';
import { HelpCommand } from '../commands/builtin/HelpCommand.js';
import { z } from 'zod';

/** Helper: create an async iterable from an array of StreamEvents */
async function* streamFromEvents(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) {
    yield e;
  }
}

/** Helper: create a minimal mock ReliabilityLayer */
function createMockReliability(): ReliabilityLayer {
  return {
    memory: {
      getContext: () => '',
      recordToolCall: mock(() => {}),
      learn: mock(async () => ({} as any)),
      recallByCategory: mock(() => []),
      flush: mock(async () => {}),
      prune: mock(() => {}),
      close: mock(() => {}),
      init: mock(async () => {}),
    } as any,
    checkpoint: {
      save: mock(async () => 'ckpt-1'),
      restore: mock(async () => {}),
      prune: mock(async () => {}),
    } as any,
    exceptionHandler: {
      recordSuccess: mock(() => {}),
      recordFailure: mock(() => {}),
      handle: mock(async () => ({ strategy: { type: 'abort', reason: 'test' }, applied: true, attemptCount: 0 })),
      registerStrategy: mock(() => {}),
    } as any,
    verification: {
      execute: mock(async () => ({ passed: true, outcomes: {}, summary: '', token: 'test' })),
      addStep: mock(() => {}),
    } as any,
  };
}

describe('AgentLoop (M6.3)', () => {
  let eventBus: TypedEventBus<KyberEvents>;
  let agent: DefaultAgentInstance;
  let mockFacade: ToolIntegrationFacade;
  let sandbox: PermissionSandbox;
  let reliability: ReliabilityLayer;

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
    sandbox.checkAll = mock(() => ({ allowed: true })) as any;

    mockFacade = {
      findTool: mock(() => undefined),
      listAll: mock(() => [])
    };

    reliability = createMockReliability();
  });

  describe('runAgentLoop (legacy wrapper)', () => {
    it('should run a simple conversation ending with end_turn', async () => {
      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: mock(async () => ({
          role: 'assistant',
          content: [{ type: 'text', text: 'Task completed' }],
          stopReason: 'end_turn',
          usage: { inputTokens: 0, outputTokens: 0 }
        } as ChatResponse)),
        chatStream: mock(function* () {
          return streamFromEvents([
            { type: 'text_delta', text: 'Task completed' },
            { type: 'message_stop', stopReason: 'end_turn' },
            { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } },
          ]);
        }) as any,
      };

      // Override chatStream to return our async iterable
      mockModel.chatStream = mock(() => {
        return streamFromEvents([
          { type: 'text_delta', text: 'Task completed' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } },
        ]);
      }) as any;

      expect(agent.status).toBe('running');

      await runAgentLoop(agent, mockModel, mockFacade, sandbox, reliability);

      // Should transition to 'completed' through task_done → verified
      expect(agent.status).toBe('completed');

      // Check that context contains the assistant's response
      expect(agent.messages.length).toBeGreaterThanOrEqual(1);
      expect(agent.messages[0].role).toBe('assistant');
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
        checkPermissions: async () => ({ behavior: 'allow' }),
      };

      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => {
          callCount++;
          if (callCount === 1) {
            // First turn: request tool use
            return streamFromEvents([
              { type: 'tool_use_start', id: 'call_1', name: 'hello_tool' },
              { type: 'tool_use_input', id: 'call_1', inputFragment: '{}' },
              { type: 'tool_use_stop', id: 'call_1' },
              { type: 'message_stop', stopReason: 'tool_use' },
              { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
            ]);
          } else {
            // Second turn: complete
            return streamFromEvents([
              { type: 'text_delta', text: 'All done.' },
              { type: 'message_stop', stopReason: 'end_turn' },
              { type: 'usage', usage: { inputTokens: 15, outputTokens: 10 } },
            ]);
          }
        }) as any,
      };

      mockFacade = {
        findTool: mock((name: string) => name === 'hello_tool' ? mockTool : undefined),
        listAll: mock(() => [mockTool as any]),
      };

      await runAgentLoop(agent, mockModel, mockFacade, sandbox, reliability);

      expect(agent.status).toBe('completed');
      expect(mockTool.call).toHaveBeenCalled();

      // Messages: assistant (tool_use) → user (tool_result) → assistant (text)
      expect(agent.messages.length).toBeGreaterThanOrEqual(3);
      expect(agent.messages[0].role).toBe('assistant');
      expect(agent.messages[1].role).toBe('user');
    });
  });

  describe('agentLoop (streaming generator)', () => {
    it('should yield text_delta events during streaming', async () => {
      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => streamFromEvents([
          { type: 'text_delta', text: 'Hello' },
          { type: 'text_delta', text: ' World' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
        ])) as any,
      };

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware());

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: mockFacade,
        sandbox,
        pipeline,
        reliability,
      };

      const events: AgentEvent[] = [];
      for await (const event of agentLoop(deps)) {
        events.push(event);
      }

      const textDeltas = events.filter(e => e.type === 'text_delta');
      expect(textDeltas.length).toBe(2);
      expect((textDeltas[0] as any).text).toBe('Hello');
      expect((textDeltas[1] as any).text).toBe(' World');

      const turnComplete = events.filter(e => e.type === 'turn_complete');
      expect(turnComplete.length).toBe(1);

      expect(agent.status).toBe('completed');
    });

    it('should yield usage events with cumulative tracking', async () => {
      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => streamFromEvents([
          { type: 'text_delta', text: 'Done' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 100, outputTokens: 50 } },
        ])) as any,
      };

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware());

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: mockFacade,
        sandbox,
        pipeline,
        reliability,
      };

      const events: AgentEvent[] = [];
      for await (const event of agentLoop(deps)) {
        events.push(event);
      }

      const usageEvents = events.filter(e => e.type === 'usage');
      expect(usageEvents.length).toBe(1);
      const usage = usageEvents[0] as any;
      expect(usage.cumulative.totalInputTokens).toBe(100);
      expect(usage.cumulative.totalOutputTokens).toBe(50);
    });

    it('should yield tool_result events for tool calls', async () => {
      let callCount = 0;

      const mockTool: ToolDefinition = {
        name: 'greet',
        description: async () => 'greet',
        inputSchema: z.any(),
        maxResultSizeChars: 100,
        call: mock(async () => ({ success: true, output: 'Hi there!' })),
        isConcurrencySafe: () => true,
        isReadOnly: () => true,
        isEnabled: () => true,
        checkPermissions: async () => ({ behavior: 'allow' }),
      };

      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => {
          callCount++;
          if (callCount === 1) {
            return streamFromEvents([
              { type: 'tool_use_start', id: 'tu_1', name: 'greet' },
              { type: 'tool_use_input', id: 'tu_1', inputFragment: '{"name":"world"}' },
              { type: 'tool_use_stop', id: 'tu_1' },
              { type: 'message_stop', stopReason: 'tool_use' },
              { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
            ]);
          } else {
            return streamFromEvents([
              { type: 'text_delta', text: 'Greeted successfully.' },
              { type: 'message_stop', stopReason: 'end_turn' },
              { type: 'usage', usage: { inputTokens: 20, outputTokens: 10 } },
            ]);
          }
        }) as any,
      };

      const facade: ToolIntegrationFacade = {
        findTool: mock((name: string) => name === 'greet' ? mockTool : undefined),
        listAll: mock(() => [mockTool as any]),
      };

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware());

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: facade,
        sandbox,
        pipeline,
        reliability,
      };

      const events: AgentEvent[] = [];
      for await (const event of agentLoop(deps)) {
        events.push(event);
      }

      const toolResults = events.filter(e => e.type === 'tool_result');
      expect(toolResults.length).toBe(1);
      expect((toolResults[0] as any).toolName).toBe('greet');
      expect((toolResults[0] as any).result).toBe('Hi there!');
      expect((toolResults[0] as any).isError).toBe(false);

      expect(agent.status).toBe('completed');
    });

    it('should intercept slash commands without completing the agent lifecycle', async () => {
      agent.addMessage('user', '/help');

      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => streamFromEvents([])) as any,
      };

      const registry = new CommandRegistry();
      registry.register(new HelpCommand(() => registry.list()));

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware());

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: mockFacade,
        sandbox,
        pipeline,
        reliability,
        commandRegistry: registry,
      };

      const events: AgentEvent[] = [];
      for await (const event of agentLoop(deps)) {
        events.push(event);
      }

      expect(mockModel.chatStream).not.toHaveBeenCalled();
      expect(agent.status).toBe('running');
      expect(events.some(e => e.type === 'turn_complete')).toBe(true);
      expect(agent.messages[agent.messages.length - 1]).toEqual({
        role: 'assistant',
        content: [{ type: 'text', text: '# Available Commands\n\n- **/help**: Show all available commands' }]
      });
    });

    it('should continue handling a normal turn after a slash command turn', async () => {
      const registry = new CommandRegistry();
      registry.register(new HelpCommand(() => registry.list()));

      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => streamFromEvents([
          { type: 'text_delta', text: 'Normal reply' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 5, outputTokens: 3 } },
        ])) as any,
      };

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware());

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: mockFacade,
        sandbox,
        pipeline,
        reliability,
        commandRegistry: registry,
      };

      agent.addMessage('user', '/help');
      for await (const _event of agentLoop(deps)) {
        // first command-only turn
      }

      expect(agent.status).toBe('running');
      expect(mockModel.chatStream).not.toHaveBeenCalled();

      agent.addMessage('user', 'hello');
      const secondTurnEvents: AgentEvent[] = [];
      for await (const event of agentLoop(deps)) {
        secondTurnEvents.push(event);
      }

      expect(mockModel.chatStream).toHaveBeenCalledTimes(1);
      expect(secondTurnEvents.some(e => e.type === 'turn_complete')).toBe(true);
      expect(agent.status).toBe('completed');
    });
  });
});
