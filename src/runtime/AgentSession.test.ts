import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { AgentSession, buildReliability } from './AgentSession.js';
import { DefaultAgentInstance } from '../agent/AgentInstance.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { ReliabilityLayer, AgentLoopDeps } from '../agent/AgentLoop.js';
import type { ModelProvider, StreamEvent } from '../types/model.js';
import type { ToolIntegrationFacade } from '../types/tool.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { MiddlewarePipeline } from '../agent/StreamMiddleware.js';
import { TokenCounterMiddleware } from '../agent/middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from '../agent/middleware/ContentAccumulatorMiddleware.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';
import { HelpCommand } from '../commands/builtin/HelpCommand.js';
import type { AgentEvent } from '../types/agent-events.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────

async function* streamFromEvents(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) yield e;
}

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
      handle: mock(async () => ({
        strategy: { type: 'abort', reason: 'test' },
        applied: true,
        attemptCount: 0,
      })),
      registerStrategy: mock(() => {}),
    } as any,
    verification: {
      execute: mock(async () => ({ passed: true, outcomes: {}, summary: '', token: 'test' })),
      addStep: mock(() => {}),
    } as any,
  };
}

function makeModel(events: StreamEvent[]): ModelProvider {
  return {
    name: 'mock',
    supportedModels: [],
    capabilities: () => ({} as any),
    countTokens: async () => 0,
    chat: mock(async () => ({} as any)),
    chatStream: mock(() => streamFromEvents(events)),
  } as any;
}

function makeTools(): ToolIntegrationFacade {
  return {
    findTool: mock(() => undefined),
    listAll: mock(() => []),
  } as any;
}

/** Creates a test AgentSession with configurable AgentLoopDeps overrides. */
function makeSession(
  overrides: Partial<AgentLoopDeps> = {},
  reliability?: ReliabilityLayer,
): AgentSession {
  const bus = new TypedEventBus<KyberEvents>();
  const agent = new DefaultAgentInstance(
    'agent-test',
    { name: 'test-agent', model: 'test-model', systemPrompt: 'You are a test agent.' },
    bus,
  );
  agent.transition('start');
  agent.transition('ready');

  const sandbox = new PermissionSandbox({
    allowed: new Set(['read_fs']),
    denied: new Set(),
    allowedPaths: [],
  });
  sandbox.checkAll = mock(() => ({ allowed: true })) as any;

  const pipeline = new MiddlewarePipeline()
    .use(new TokenCounterMiddleware())
    .use(new ContentAccumulatorMiddleware());

  const rel = reliability ?? createMockReliability();

  const deps: AgentLoopDeps = {
    agent,
    model: makeModel([
      { type: 'text_delta', text: 'Hello from mock' },
      { type: 'message_stop', stopReason: 'end_turn' },
      { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } },
    ]),
    tools: makeTools(),
    sandbox,
    pipeline,
    reliability: rel,
    ...overrides,
  };

  return new AgentSession('session-test', agent, deps, rel);
}

async function collectEvents(iter: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of iter) events.push(e);
  return events;
}

// ─── AgentSession.send() — LLM path ──────────────────────────────────────────

describe('AgentSession.send() — LLM path', () => {
  it('yields text_delta events from the model', async () => {
    const session = makeSession();
    const events = await collectEvents(session.send('hello'));
    const text = events
      .filter(e => e.type === 'text_delta')
      .map(e => (e as Extract<AgentEvent, { type: 'text_delta' }>).text)
      .join('');
    expect(text).toContain('Hello from mock');
  });

  it('yields a turn_complete event at end of turn', async () => {
    const session = makeSession();
    const events = await collectEvents(session.send('hello'));
    expect(events.some(e => e.type === 'turn_complete')).toBe(true);
  });

  it('adds the user message to the agent before running', async () => {
    const session = makeSession();
    await collectEvents(session.send('test input'));
    expect(session.agent.messages[0]).toMatchObject({ role: 'user', content: 'test input' });
  });
});

// ─── AgentSession.send() — multi-turn ─────────────────────────────────────────

describe('AgentSession.send() — multi-turn', () => {
  it('resets completed agent status for subsequent turns', async () => {
    const session = makeSession();

    await collectEvents(session.send('first'));
    expect(session.agent.status).toBe('completed');

    // Second send must succeed — session resets status
    const events = await collectEvents(session.send('second'));
    expect(events.some(e => e.type === 'turn_complete')).toBe(true);
    expect(session.agent.status).toBe('completed');
  });

  it('accumulates messages across turns', async () => {
    const session = makeSession();
    await collectEvents(session.send('first'));
    await collectEvents(session.send('second'));
    const userMessages = session.agent.messages.filter(m => m.role === 'user');
    expect(userMessages.length).toBe(2);
  });
});

// ─── AgentSession.send() — command interception ───────────────────────────────

describe('AgentSession.send() — command interception', () => {
  it('intercepts /help and does NOT call the LLM', async () => {
    const streamSpy = mock(() => streamFromEvents([]));
    const mockModel: ModelProvider = {
      name: 'mock',
      supportedModels: [],
      capabilities: () => ({} as any),
      countTokens: async () => 0,
      chat: mock(async () => ({} as any)),
      chatStream: streamSpy,
    } as any;

    const commandRegistry = new CommandRegistry()
      .register(new HelpCommand(() => commandRegistry.list()));

    const session = makeSession({ model: mockModel, commandRegistry });
    const events = await collectEvents(session.send('/help'));

    expect(streamSpy).not.toHaveBeenCalled();
    expect(events.some(e => e.type === 'text_delta')).toBe(true);
  });

  it('does NOT add slash command input to agent.messages', async () => {
    const commandRegistry = new CommandRegistry()
      .register(new HelpCommand(() => commandRegistry.list()));
    const session = makeSession({ commandRegistry });

    await collectEvents(session.send('/help'));

    // Command must NOT appear in agent message history
    expect(session.agent.messages.length).toBe(0);
  });

  it('does NOT change agent.status when handling a command', async () => {
    const commandRegistry = new CommandRegistry()
      .register(new HelpCommand(() => commandRegistry.list()));
    const session = makeSession({ commandRegistry });

    await collectEvents(session.send('/help'));

    // Agent lifecycle must be untouched (still 'running', not 'completed')
    expect(session.agent.status).toBe('running');
  });

  it('routes plain text to the LLM (not treated as command)', async () => {
    const streamSpy = mock(() => streamFromEvents([
      { type: 'text_delta', text: 'response' },
      { type: 'message_stop', stopReason: 'end_turn' },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 3 } },
    ]));
    const mockModel: ModelProvider = {
      name: 'mock',
      supportedModels: [],
      capabilities: () => ({} as any),
      countTokens: async () => 0,
      chat: mock(async () => ({} as any)),
      chatStream: streamSpy,
    } as any;

    const commandRegistry = new CommandRegistry();
    const session = makeSession({ model: mockModel, commandRegistry });
    await collectEvents(session.send('hello there'));

    expect(streamSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── AgentSession.send() — abort signal ──────────────────────────────────────

describe('AgentSession.send() — abort signal', () => {
  it('yields no events when signal is already aborted before send()', async () => {
    const session = makeSession();
    const controller = new AbortController();
    controller.abort();

    const events = await collectEvents(
      session.send('hello', { signal: controller.signal }),
    );
    expect(events.length).toBe(0);
  });
});

// ─── AgentSession.close() ────────────────────────────────────────────────────

describe('AgentSession.close()', () => {
  it('flushes memory and calls close without throwing', async () => {
    const reliability = createMockReliability();
    const session = makeSession({}, reliability);

    await expect(session.close()).resolves.toBeUndefined();
    expect(reliability.memory.flush).toHaveBeenCalled();
    expect(reliability.memory.close).toHaveBeenCalled();
  });

  it('calls the optional cleanup function exactly once', async () => {
    const bus = new TypedEventBus<KyberEvents>();
    const agent = new DefaultAgentInstance(
      'a1', { name: 't', model: 'm' }, bus,
    );
    agent.transition('start');
    agent.transition('ready');

    const sandbox = new PermissionSandbox({
      allowed: new Set(['read_fs']), denied: new Set(), allowedPaths: [],
    });
    sandbox.checkAll = mock(() => ({ allowed: true })) as any;

    const pipeline = new MiddlewarePipeline()
      .use(new TokenCounterMiddleware())
      .use(new ContentAccumulatorMiddleware());

    const reliability = createMockReliability();
    const deps: AgentLoopDeps = {
      agent,
      model: makeModel([]),
      tools: makeTools(),
      sandbox,
      pipeline,
      reliability,
    };

    const cleanupFn = mock(async () => {});
    const session = new AgentSession('s1', agent, deps, reliability, cleanupFn);

    await session.close();
    expect(cleanupFn).toHaveBeenCalledTimes(1);
  });
});

// ─── buildReliability helper ─────────────────────────────────────────────────

describe('buildReliability', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kyber-rel-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('real mode: returns all four components and no cleanup', async () => {
    const { reliability, cleanup, rootDir } = await buildReliability('real', {
      rootDir: tempDir,
      agentId: 'test-agent',
    });

    expect(rootDir).toBe(tempDir);
    expect(reliability.memory).toBeDefined();
    expect(reliability.checkpoint).toBeDefined();
    expect(reliability.exceptionHandler).toBeDefined();
    expect(reliability.verification).toBeDefined();
    expect(cleanup).toBeUndefined();

    reliability.memory.close();
  });

  it('inmemory mode: returns all four components and a cleanup function', async () => {
    const { reliability, cleanup, rootDir } = await buildReliability('inmemory', {
      rootDir: tempDir,
      agentId: 'test-agent',
    });

    expect(rootDir).not.toBe(tempDir);
    expect(reliability.memory).toBeDefined();
    expect(reliability.checkpoint).toBeDefined();
    expect(reliability.exceptionHandler).toBeDefined();
    expect(reliability.verification).toBeDefined();
    expect(typeof cleanup).toBe('function');

    reliability.memory.close();
    if (cleanup) await cleanup();
  });

  it('inmemory cleanup resolves without throwing', async () => {
    const { reliability, cleanup } = await buildReliability('inmemory', {
      rootDir: tempDir,
      agentId: 'test-agent',
    });
    reliability.memory.close();
    await expect(cleanup?.()).resolves.toBeUndefined();
  });
});
