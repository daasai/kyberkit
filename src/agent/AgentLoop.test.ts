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
import { MemoryTriggerMiddleware, DEFAULT_MEMORY_TRIGGER_CONFIG } from './middleware/MemoryTriggerMiddleware.js';
import type { SessionMemory } from '../memory/SessionMemory.js';
import type { SessionMemoryExtractor } from '../memory/extractors/SessionMemoryExtractor.js';

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
        chatStream: mock(() => streamFromEvents([
          { type: 'text_delta', text: 'Task completed' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } },
        ])) as any,
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

    it('should not intercept slash commands at loop layer', async () => {
      agent.addMessage('user', '/help');

      const mockModel: ModelProvider = {
        name: 'mock',
        supportedModels: [],
        capabilities: () => ({} as any),
        countTokens: async () => 0,
        chat: async () => ({} as any),
        chatStream: mock(() => streamFromEvents([
          { type: 'text_delta', text: 'Model handled /help text as plain input' },
          { type: 'message_stop', stopReason: 'end_turn' },
          { type: 'usage', usage: { inputTokens: 5, outputTokens: 3 } },
        ])) as any,
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

      expect(mockModel.chatStream).toHaveBeenCalledTimes(1);
      expect(events.some(e => e.type === 'turn_complete')).toBe(true);
      expect(agent.status).toBe('completed');
    });

    /**
     * Regression: session extract on `turn_complete` + `tool_use` used to run before tool results
     * existed and blocked `waitIdle()` until the extractor LLM finished — felt like a hang after
     * the first tool (e.g. read_file). Extract must not run until a real `end_turn` completion.
     */
    it('should not stall between tool_use and the next model stream when MemoryTrigger uses slow extract', async () => {
      let callCount = 0;
      const bus = new TypedEventBus<KyberEvents>();
      const extract = mock(async () => {
        await new Promise((r) => setTimeout(r, 500));
        return { markdown: '## Snip\nok', tokenCount: 8 };
      });
      const sessionMemory = {
        hasExtractedNotes: mock(() => false),
        getExtractedMarkdown: mock(() => null),
        mergeExtracted: mock(() => {}),
      } as unknown as SessionMemory;
      const sessionExtractor = { extract } as unknown as SessionMemoryExtractor;

      const memoryTrigger = new MemoryTriggerMiddleware({
        sessionExtractor,
        sessionMemory,
        eventBus: bus,
        config: { ...DEFAULT_MEMORY_TRIGGER_CONFIG, sessionTurnThreshold: 1 },
      });

      const mockTool: ToolDefinition = {
        name: 'ping',
        description: async () => 'ping',
        inputSchema: z.any(),
        maxResultSizeChars: 100,
        call: mock(async () => ({ success: true, output: 'pong' })),
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
              { type: 'tool_use_start', id: 't1', name: 'ping' },
              { type: 'tool_use_input', id: 't1', inputFragment: '{}' },
              { type: 'tool_use_stop', id: 't1' },
              { type: 'message_stop', stopReason: 'tool_use' },
              { type: 'usage', usage: { inputTokens: 5, outputTokens: 2 } },
            ]);
          }
          return streamFromEvents([
            { type: 'text_delta', text: 'after-tool' },
            { type: 'message_stop', stopReason: 'end_turn' },
            { type: 'usage', usage: { inputTokens: 10, outputTokens: 4 } },
          ]);
        }) as any,
      };

      const facade: ToolIntegrationFacade = {
        findTool: mock((name: string) => (name === 'ping' ? mockTool : undefined)),
        listAll: mock(() => [mockTool as any]),
      };

      const pipeline = new MiddlewarePipeline()
        .use(new TokenCounterMiddleware())
        .use(new ContentAccumulatorMiddleware())
        .use(memoryTrigger);

      const deps: AgentLoopDeps = {
        agent,
        model: mockModel,
        tools: facade,
        sandbox,
        pipeline,
        reliability,
        memoryTrigger,
      };

      let tAfterToolResult: number | null = null;
      let tFirstTextAfterTool: number | null = null;
      for await (const event of agentLoop(deps)) {
        if (event.type === 'tool_result') {
          tAfterToolResult = performance.now();
        }
        if (event.type === 'text_delta' && tAfterToolResult != null && tFirstTextAfterTool == null) {
          tFirstTextAfterTool = performance.now();
        }
      }

      expect(tAfterToolResult).not.toBeNull();
      expect(tFirstTextAfterTool).not.toBeNull();
      if (tAfterToolResult !== null && tFirstTextAfterTool !== null) {
        expect(tFirstTextAfterTool - tAfterToolResult).toBeLessThan(200);
      }
      expect(extract.mock.calls.length).toBe(1);
      expect(agent.status).toBe('completed');
    });
  });
});
