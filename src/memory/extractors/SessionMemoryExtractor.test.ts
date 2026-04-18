import { describe, it, expect, mock } from 'bun:test';
import { SessionMemoryExtractor } from './SessionMemoryExtractor.js';
import type { ChatMessage, ModelProvider, StreamEvent } from '../../types/model.js';

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

describe('SessionMemoryExtractor', () => {
  const messages: ChatMessage[] = [
    { role: 'user', content: 'Refactor the auth module' },
    { role: 'assistant', content: 'Done — updated login.ts' },
  ];

  it('returns empty result for empty conversation', async () => {
    const model = makeModel(['## Goal\nIrrelevant']);
    const ext = new SessionMemoryExtractor({ model, fallbackModel: 'main' });

    const result = await ext.extract([], null);

    expect(result.markdown).toBe('');
    expect(result.tokenCount).toBe(0);
    expect(model.chatStream).not.toHaveBeenCalled();
  });

  it('uses compactModel when provided', async () => {
    const model = makeModel(['## Goal\n', 'Ship feature X']);
    const ext = new SessionMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
    });

    const result = await ext.extract(messages, null);

    expect(result.markdown).toContain('## Goal');
    expect(result.markdown).toContain('Ship feature X');
    expect(result.tokenCount).toBeGreaterThan(0);

    const call = (model.chatStream as any).mock.calls[0][0];
    expect(call.model).toBe('haiku');
    expect(call.tools).toEqual([]);
  });

  it('injects previousNotes as a merge prefix', async () => {
    const model = makeModel(['## Goal\nMerged']);
    const ext = new SessionMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
    });

    await ext.extract(messages, '## Goal\nOld note');

    const call = (model.chatStream as any).mock.calls[0][0];
    const prefix = (call.messages[0] as ChatMessage).content as string;
    expect(prefix).toContain('Previous note');
    expect(prefix).toContain('Old note');
    expect(prefix).toContain('Update it based on');
  });

  it('falls back to main model if compactModel fails', async () => {
    const model = makeModel(['## Goal\nFallback succeeded'], { throwFor: 'haiku' });
    const ext = new SessionMemoryExtractor({
      model,
      compactModel: 'haiku',
      fallbackModel: 'main',
    });

    const result = await ext.extract(messages, null);

    expect(result.markdown).toContain('Fallback succeeded');
    expect((model.chatStream as any).mock.calls).toHaveLength(2);
    expect((model.chatStream as any).mock.calls[1][0].model).toBe('main');
  });

  it('rethrows when only the fallback model exists and it fails', async () => {
    const model = makeModel(['ignored'], { throwFor: 'main' });
    const ext = new SessionMemoryExtractor({ model, fallbackModel: 'main' });

    await expect(ext.extract(messages, null)).rejects.toThrow('primary failed');
  });
});
