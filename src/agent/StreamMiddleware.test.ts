import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { MiddlewarePipeline, StreamMiddleware, MiddlewareContext, createMiddlewareContext } from './StreamMiddleware.js';
import { AgentEvent } from '../types/agent-events.js';
import { DefaultAgentInstance } from './AgentInstance.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { TokenCounterMiddleware } from './middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from './middleware/ContentAccumulatorMiddleware.js';

describe('MiddlewarePipeline', () => {
  let context: MiddlewareContext;

  beforeEach(() => {
    const bus = new TypedEventBus<KyberEvents>();
    const agent = new DefaultAgentInstance('test', {
      name: 'test',
      model: 'test',
    }, bus);
    context = createMiddlewareContext(agent);
  });

  it('should pass events through an empty pipeline', () => {
    const pipeline = new MiddlewarePipeline();
    const event: AgentEvent = { type: 'text_delta', text: 'hello' };
    const result = pipeline.process(event, context);
    expect(result).toEqual([event]);
  });

  it('should allow middleware to transform events', () => {
    const upper: StreamMiddleware = {
      name: 'upper',
      process(event) {
        if (event.type === 'text_delta') {
          return { ...event, text: event.text.toUpperCase() };
        }
        return event;
      },
    };

    const pipeline = new MiddlewarePipeline().use(upper);
    const result = pipeline.process({ type: 'text_delta', text: 'hello' }, context);
    expect(result).toEqual([{ type: 'text_delta', text: 'HELLO' }]);
  });

  it('should allow middleware to filter events (return null)', () => {
    const filter: StreamMiddleware = {
      name: 'filter',
      process(event) {
        if (event.type === 'thinking_delta') return null;
        return event;
      },
    };

    const pipeline = new MiddlewarePipeline().use(filter);

    const kept = pipeline.process({ type: 'text_delta', text: 'hi' }, context);
    expect(kept.length).toBe(1);

    const filtered = pipeline.process({ type: 'thinking_delta', text: 'thinking...' }, context);
    expect(filtered.length).toBe(0);
  });

  it('should allow middleware to produce multiple events', () => {
    const doubler: StreamMiddleware = {
      name: 'doubler',
      process(event) {
        if (event.type === 'text_delta') {
          return [event, { type: 'text_delta', text: event.text + '!' }];
        }
        return event;
      },
    };

    const pipeline = new MiddlewarePipeline().use(doubler);
    const result = pipeline.process({ type: 'text_delta', text: 'hi' }, context);
    expect(result.length).toBe(2);
    expect((result[0] as any).text).toBe('hi');
    expect((result[1] as any).text).toBe('hi!');
  });

  it('should chain multiple middlewares correctly', () => {
    const addPrefix: StreamMiddleware = {
      name: 'prefix',
      process(event) {
        if (event.type === 'text_delta') {
          return { ...event, text: `[prefix]${event.text}` };
        }
        return event;
      },
    };
    const addSuffix: StreamMiddleware = {
      name: 'suffix',
      process(event) {
        if (event.type === 'text_delta') {
          return { ...event, text: `${event.text}[suffix]` };
        }
        return event;
      },
    };

    const pipeline = new MiddlewarePipeline().use(addPrefix).use(addSuffix);
    const result = pipeline.process({ type: 'text_delta', text: 'msg' }, context);
    expect(result).toEqual([{ type: 'text_delta', text: '[prefix]msg[suffix]' }]);
  });

  it('should report the correct size', () => {
    const pipeline = new MiddlewarePipeline();
    expect(pipeline.size).toBe(0);
    pipeline.use({ name: 'a', process: (e) => e });
    expect(pipeline.size).toBe(1);
    pipeline.use({ name: 'b', process: (e) => e });
    expect(pipeline.size).toBe(2);
  });
});

describe('TokenCounterMiddleware', () => {
  let context: MiddlewareContext;
  let mw: TokenCounterMiddleware;

  beforeEach(() => {
    const bus = new TypedEventBus<KyberEvents>();
    const agent = new DefaultAgentInstance('test', {
      name: 'test',
      model: 'test',
    }, bus);
    context = createMiddlewareContext(agent);
    mw = new TokenCounterMiddleware();
  });

  it('should accumulate usage into cumulative totals', () => {
    const event: AgentEvent = {
      type: 'usage',
      usage: { inputTokens: 100, outputTokens: 50 },
      cumulative: { totalInputTokens: 0, totalOutputTokens: 0, totalCacheCreationTokens: 0, totalCacheReadTokens: 0, turnCount: 0 },
    };

    const result = mw.process(event, context) as any;
    expect(result.cumulative.totalInputTokens).toBe(100);
    expect(result.cumulative.totalOutputTokens).toBe(50);
    expect(context.cumulative.totalInputTokens).toBe(100);

    // Second usage event should accumulate
    const event2: AgentEvent = {
      type: 'usage',
      usage: { inputTokens: 200, outputTokens: 100, cacheCreationTokens: 10, cacheReadTokens: 5 },
      cumulative: { totalInputTokens: 0, totalOutputTokens: 0, totalCacheCreationTokens: 0, totalCacheReadTokens: 0, turnCount: 0 },
    };
    const result2 = mw.process(event2, context) as any;
    expect(result2.cumulative.totalInputTokens).toBe(300);
    expect(result2.cumulative.totalOutputTokens).toBe(150);
    expect(result2.cumulative.totalCacheCreationTokens).toBe(10);
    expect(result2.cumulative.totalCacheReadTokens).toBe(5);
  });

  it('should pass non-usage events through unchanged', () => {
    const event: AgentEvent = { type: 'text_delta', text: 'hello' };
    const result = mw.process(event, context);
    expect(result).toEqual(event);
    expect(context.cumulative.totalInputTokens).toBe(0);
  });
});

describe('ContentAccumulatorMiddleware', () => {
  let context: MiddlewareContext;
  let mw: ContentAccumulatorMiddleware;

  beforeEach(() => {
    const bus = new TypedEventBus<KyberEvents>();
    const agent = new DefaultAgentInstance('test', {
      name: 'test',
      model: 'test',
    }, bus);
    context = createMiddlewareContext(agent);
    mw = new ContentAccumulatorMiddleware();
  });

  it('should accumulate text deltas into content on turn_complete', () => {
    mw.process({ type: 'text_delta', text: 'Hello' }, context);
    mw.process({ type: 'text_delta', text: ' World' }, context);

    mw.process({
      type: 'turn_complete',
      turnNumber: 1,
      stopReason: 'end_turn',
      content: [],
    }, context);

    expect(context.accumulatedContent).toEqual([
      { type: 'text', text: 'Hello World' },
    ]);
  });

  it('should accumulate tool_use blocks into pendingToolUses', () => {
    mw.process({ type: 'tool_use_start', toolUseId: 'tu_1', toolName: 'read_file' }, context);
    mw.process({ type: 'tool_use_input', toolUseId: 'tu_1', fragment: '{"path":' }, context);
    mw.process({ type: 'tool_use_input', toolUseId: 'tu_1', fragment: '"/tmp/x"}' }, context);
    mw.process({ type: 'tool_use_complete', toolUseId: 'tu_1', toolName: 'read_file', input: { path: '/tmp/x' } }, context);

    expect(context.pendingToolUses).toEqual([
      { id: 'tu_1', name: 'read_file', input: { path: '/tmp/x' } },
    ]);
  });

  it('should reset buffers after turn_complete', () => {
    mw.process({ type: 'text_delta', text: 'Turn 1' }, context);
    mw.process({
      type: 'turn_complete',
      turnNumber: 1,
      stopReason: 'end_turn',
      content: [],
    }, context);

    // Reset context for turn 2
    context.accumulatedContent = [];

    mw.process({ type: 'text_delta', text: 'Turn 2' }, context);
    mw.process({
      type: 'turn_complete',
      turnNumber: 2,
      stopReason: 'end_turn',
      content: [],
    }, context);

    expect(context.accumulatedContent).toEqual([
      { type: 'text', text: 'Turn 2' },
    ]);
  });

  it('should pass through all events for real-time display', () => {
    const event: AgentEvent = { type: 'text_delta', text: 'hi' };
    const result = mw.process(event, context);
    expect(result).toEqual(event);
  });
});
