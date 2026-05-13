import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import {
  LongTermMemoryExtractor,
  parseEntries,
} from './LongTermMemoryExtractor.js';
import { LongTermMemory } from '../LongTermMemory.js';
import { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';
import type { ModelProvider, StreamEvent, ChatMessage } from '../../types/model.js';
import { rm } from 'fs/promises';

async function* stream(events: StreamEvent[]): AsyncIterable<StreamEvent> {
  for (const e of events) yield e;
}

function makeModel(textChunks: string[], opts: { throwFor?: string } = {}): ModelProvider {
  return {
    name: 'mock',
    supportedModels: ['haiku', 'main'],
    chat: mock(async () => ({} as any)),
    chatStream: mock((req: { model: string }) => {
      if (opts.throwFor && req.model === opts.throwFor) {
        throw new Error('primary failed');
      }
      return stream(textChunks.map((t) => ({ type: 'text_delta', text: t }) as StreamEvent));
    }),
    capabilities: () => ({
      maxContextTokens: 200000,
      supportsTools: true,
      supportsVision: false,
      supportsStreaming: true,
      supportsThinking: false,
    }),
    countTokens: async () => 1,
  };
}

describe('LongTermMemoryExtractor.parseEntries', () => {
  it('parses a clean JSON array', () => {
    const raw = JSON.stringify([
      { category: 'user', title: 'Uses Bun', tags: ['runtime'], body: 'Bun is fast' },
      { category: 'project', title: 'Biome', body: 'Biome replaces eslint' },
    ]);
    const out = parseEntries(raw);
    expect(out).toHaveLength(2);
    expect(out[0].tags).toEqual(['runtime']);
  });

  it('strips code fences', () => {
    const raw = '```json\n[{"category":"user","title":"X","body":"Y"}]\n```';
    expect(parseEntries(raw)).toHaveLength(1);
  });

  it('drops malformed entries', () => {
    const raw = JSON.stringify([
      { category: 'invalid', title: 'X', body: 'Y' },
      { category: 'user', title: '', body: 'Y' },
      { category: 'user', title: 'OK', body: '' },
      { category: 'user', title: 'Good', body: 'body' },
    ]);
    const out = parseEntries(raw);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('Good');
  });

  it('returns empty on invalid JSON', () => {
    expect(parseEntries('not json')).toEqual([]);
    expect(parseEntries('{"foo":1}')).toEqual([]);
  });
});

describe('LongTermMemoryExtractor.extract', () => {
  const root = './test-data-ltm-extract';
  let bus: TypedEventBus<KyberEvents>;
  let lt: LongTermMemory;

  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    bus = new TypedEventBus<KyberEvents>();
    lt = new LongTermMemory(root, bus);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const messages: ChatMessage[] = [
    { role: 'user', content: 'Always use Bun, never Node.' },
    { role: 'assistant', content: 'Noted.' },
  ];

  it('writes extracted entries to the markdown store', async () => {
    const json = JSON.stringify([
      { category: 'user', title: 'Uses Bun', body: 'Always Bun, never Node.' },
      { category: 'project', title: 'No SQLite', body: 'Drop SQLite for Markdown.' },
    ]);
    const model = makeModel([json]);
    const ext = new LongTermMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
      longTerm: lt,
      store: lt.getStore(),
    });

    const result = await ext.extract(messages);
    expect(result).toHaveLength(2);

    const all = await lt.list();
    expect(all.map((e) => e.metadata?.title).sort()).toEqual(['No SQLite', 'Uses Bun']);
    expect(all.every((e) => e.metadata?.source === 'auto')).toBe(true);
  });

  it('skips duplicates based on category::title', async () => {
    await lt.writeEntry({
      id: 'existing',
      category: 'user',
      content: 'Already here',
      timestamp: Date.now(),
      title: 'Uses Bun',
      source: 'manual',
    });
    const json = JSON.stringify([
      { category: 'user', title: 'uses bun', body: 'Duplicate attempt' },
      { category: 'user', title: 'Uses Biome', body: 'New knowledge' },
    ]);
    const model = makeModel([json]);
    const ext = new LongTermMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
      longTerm: lt,
      store: lt.getStore(),
    });

    const accepted = await ext.extract(messages);
    expect(accepted).toHaveLength(1);
    expect(accepted[0].content).toBe('New knowledge');

    const all = await lt.list();
    expect(all).toHaveLength(2);
  });

  it('returns [] for empty conversations', async () => {
    const model = makeModel(['ignored']);
    const ext = new LongTermMemoryExtractor({
      model, fallbackModel: 'main', longTerm: lt, store: lt.getStore(),
    });
    const res = await ext.extract([]);
    expect(res).toEqual([]);
    expect((model.chatStream as any).mock.calls).toHaveLength(0);
  });

  it('falls back to main model when compactModel throws', async () => {
    const json = JSON.stringify([{ category: 'user', title: 'Fallback', body: 'ok' }]);
    const model = makeModel([json], { throwFor: 'haiku' });
    const ext = new LongTermMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
      longTerm: lt,
      store: lt.getStore(),
    });

    const res = await ext.extract(messages);
    expect(res).toHaveLength(1);
    const calls = (model.chatStream as any).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].model).toBe('main');
  });

  it('gracefully handles malformed LLM output', async () => {
    const model = makeModel(['not a valid JSON']);
    const ext = new LongTermMemoryExtractor({
      model, fallbackModel: 'main', longTerm: lt, store: lt.getStore(),
    });
    const res = await ext.extract(messages);
    expect(res).toEqual([]);
    expect(await lt.list()).toHaveLength(0);
  });
});
