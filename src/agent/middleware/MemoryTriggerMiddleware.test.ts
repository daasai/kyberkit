import { describe, it, expect, mock, beforeEach } from 'bun:test';
import {
  MemoryTriggerMiddleware,
  DEFAULT_MEMORY_TRIGGER_CONFIG,
  type MemoryTriggerDeps,
  type MemoryTriggerConfig,
} from './MemoryTriggerMiddleware.js';
import { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';
import type { MiddlewareContext } from '../StreamMiddleware.js';
import type { AgentEvent } from '../../types/agent-events.js';
import type { SessionMemoryExtractor } from '../../memory/extractors/SessionMemoryExtractor.js';
import type { SessionMemory } from '../../memory/SessionMemory.js';
import type { ChatMessage } from '../../types/model.js';

function makeContext(messages: ChatMessage[]): MiddlewareContext {
  return {
    agent: { messages } as any,
    turnNumber: 0,
    latestUserTurnText: '',
    cumulative: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheCreationTokens: 0,
      totalCacheReadTokens: 0,
      turnCount: 0,
    },
    accumulatedContent: [],
    pendingToolUses: [],
    stopReason: null,
  };
}

function makeSessionMemory(): SessionMemory {
  return {
    hasExtractedNotes: mock(() => false),
    getExtractedMarkdown: mock(() => null),
    mergeExtracted: mock(() => {}),
    buildContextTemplate: mock(() => ''),
  } as unknown as SessionMemory;
}

function makeDeps(overrides: {
  extractMock?: (msgs: ChatMessage[], prev: string | null) => Promise<{ markdown: string; tokenCount: number }>;
  config?: Partial<MemoryTriggerConfig>;
  ltmExtractor?: MemoryTriggerDeps['ltmExtractor'];
  sessionMemory?: SessionMemory;
}): { deps: MemoryTriggerDeps; eventBus: TypedEventBus<KyberEvents>; sessionMemory: SessionMemory } {
  const eventBus = new TypedEventBus<KyberEvents>();
  const sessionMemory = overrides.sessionMemory ?? makeSessionMemory();
  const extract = mock(
    overrides.extractMock ?? (async () => ({ markdown: '## Goal\nAuto', tokenCount: 16 })),
  );
  const sessionExtractor = { extract } as unknown as SessionMemoryExtractor;
  return {
    eventBus,
    sessionMemory,
    deps: {
      sessionExtractor,
      sessionMemory,
      ltmExtractor: overrides.ltmExtractor,
      eventBus,
      config: { ...DEFAULT_MEMORY_TRIGGER_CONFIG, ...(overrides.config ?? {}) },
    },
  };
}

const turnEvent: AgentEvent = { type: 'turn_complete', turnNumber: 1, stopReason: 'end_turn', content: [] };

describe('MemoryTriggerMiddleware', () => {
  let ctx: MiddlewareContext;

  beforeEach(() => {
    ctx = makeContext([{ role: 'user', content: 'hi' }]);
  });

  it('does nothing when disabled', () => {
    const { deps } = makeDeps({ config: { enabled: false } });
    const mw = new MemoryTriggerMiddleware(deps);

    const out = mw.process(turnEvent, ctx);

    expect(out).toBe(turnEvent);
    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(0);
  });

  it('triggers session extraction when turn threshold is reached', async () => {
    const { deps, eventBus, sessionMemory } = makeDeps({
      config: { sessionTurnThreshold: 2, sessionTokenThreshold: 999_999, sessionToolCallThreshold: 999 },
    });
    const extracted: KyberEvents['memory.extracted'][] = [];
    eventBus.on('memory.extracted', (e) => extracted.push(e));
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(1);
    expect((sessionMemory.mergeExtracted as any).mock.calls).toHaveLength(1);
    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toMatchObject({ tier: 'session', entryCount: 1 });
  });

  it('triggers on token threshold without waiting for turn boundary counters', async () => {
    const { deps } = makeDeps({
      config: { sessionTokenThreshold: 10, sessionTurnThreshold: 999, sessionToolCallThreshold: 999 },
    });
    const mw = new MemoryTriggerMiddleware(deps);

    const usage: AgentEvent = {
      type: 'usage',
      usage: { inputTokens: 10, outputTokens: 5 },
      cumulative: {
        totalInputTokens: 10,
        totalOutputTokens: 5,
        totalCacheCreationTokens: 0,
        totalCacheReadTokens: 0,
        turnCount: 1,
      },
    };
    mw.process(usage, ctx);
    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(1);
  });

  it('does not trigger when below all thresholds', () => {
    const { deps } = makeDeps({
      config: { sessionTokenThreshold: 999, sessionTurnThreshold: 999, sessionToolCallThreshold: 999 },
    });
    const mw = new MemoryTriggerMiddleware(deps);
    mw.process(turnEvent, ctx);

    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(0);
  });

  it('emits memory.extraction_skipped on extractor error', async () => {
    const { deps, eventBus } = makeDeps({
      extractMock: async () => {
        throw new Error('llm boom');
      },
      config: { sessionTurnThreshold: 1 },
    });
    const skipped: KyberEvents['memory.extraction_skipped'][] = [];
    eventBus.on('memory.extraction_skipped', (e) => skipped.push(e));
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({ tier: 'session', reason: 'llm boom' });
  });

  it('skips empty extractor output', async () => {
    const { deps, eventBus, sessionMemory } = makeDeps({
      extractMock: async () => ({ markdown: '   ', tokenCount: 0 }),
      config: { sessionTurnThreshold: 1 },
    });
    const skipped: KyberEvents['memory.extraction_skipped'][] = [];
    eventBus.on('memory.extraction_skipped', (e) => skipped.push(e));
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect(skipped).toHaveLength(1);
    expect((sessionMemory.mergeExtracted as any).mock.calls).toHaveLength(0);
  });

  it('passes existing notes as prev when available', async () => {
    const sessionMemory = {
      hasExtractedNotes: mock(() => true),
      getExtractedMarkdown: mock(() => '## Goal\nOld'),
      mergeExtracted: mock(() => {}),
      buildContextTemplate: mock(() => '## Goal\nOld'),
    } as unknown as SessionMemory;
    const { deps } = makeDeps({ config: { sessionTurnThreshold: 1 }, sessionMemory });
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    const call = (deps.sessionExtractor.extract as any).mock.calls[0];
    expect(call[1]).toBe('## Goal\nOld');
  });

  it('serialises concurrent session extractions via the mutex', async () => {
    let active = 0;
    let peak = 0;
    const extract = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return { markdown: '## Goal\nX', tokenCount: 1 };
    };
    const { deps } = makeDeps({ extractMock: extract, config: { sessionTurnThreshold: 1 } });
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    mw.process(turnEvent, ctx);
    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect(peak).toBe(1);
    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(3);
  });

  it('does not trigger LTM when ltmExtractor is absent', () => {
    const { deps } = makeDeps({ config: { sessionTurnThreshold: 1 } });
    const mw = new MemoryTriggerMiddleware(deps);
    mw.process(turnEvent, ctx);
    expect(deps.ltmExtractor).toBeUndefined();
  });

  it('triggers LTM on end_turn after cooldown', async () => {
    const ltmExtract = mock(async () => [{ category: 'project', slug: 'x' }]);
    const { deps, eventBus } = makeDeps({
      config: { sessionTurnThreshold: 999, ltmTurnCooldown: 2 },
      ltmExtractor: { extract: ltmExtract },
    });
    const extracted: KyberEvents['memory.extracted'][] = [];
    eventBus.on('memory.extracted', (e) => extracted.push(e));
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process(turnEvent, ctx);
    await mw.waitIdle();
    expect(ltmExtract.mock.calls).toHaveLength(0);

    mw.process(turnEvent, ctx);
    await mw.waitIdle();

    expect(ltmExtract.mock.calls).toHaveLength(1);
    expect(extracted.filter((e) => e.tier === 'long_term')).toHaveLength(1);
  });

  it('skips LTM on non end_turn stop reasons', async () => {
    const ltmExtract = mock(async () => []);
    const { deps } = makeDeps({
      config: { sessionTurnThreshold: 999, ltmTurnCooldown: 1 },
      ltmExtractor: { extract: ltmExtract },
    });
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process({ type: 'turn_complete', turnNumber: 1, stopReason: 'tool_use', content: [] }, ctx);
    await mw.waitIdle();

    expect(ltmExtract.mock.calls).toHaveLength(0);
  });

  it('does not trigger session extraction on tool_use turn_complete', async () => {
    const { deps } = makeDeps({
      config: { sessionTurnThreshold: 1, sessionTokenThreshold: 999_999, sessionToolCallThreshold: 999 },
    });
    const mw = new MemoryTriggerMiddleware(deps);

    mw.process({ type: 'turn_complete', turnNumber: 1, stopReason: 'tool_use', content: [] }, ctx);
    await mw.waitIdle();

    expect((deps.sessionExtractor.extract as any).mock.calls).toHaveLength(0);
  });
});
