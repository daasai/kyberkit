import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { AnthropicProvider } from './AnthropicProvider.js';
import { ChatRequest, MessageContent, StreamEvent } from '../types/model.js';
import { ToolDefinition } from '../types/tool.js';
import { z } from 'zod';

let mockStreamEvents: unknown[] = [];

const mockCreateMessages = mock(async (params: any) => {
  if (params.stream) {
    return {
      async *[Symbol.asyncIterator]() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }
    };
  }

  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello KyberKit!' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 20 }
  };
});

mock.module('@anthropic-ai/sdk', () => {
  return {
    default: class AnthropicMock {
      messages = {
        create: mockCreateMessages,
        countTokens: mock(async () => ({ input_tokens: 42 }))
      };
    }
  };
});

describe('AnthropicProvider (M5)', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider({ apiKey: 'test-key' });
    mockCreateMessages.mockClear();
    mockStreamEvents = [];
  });

  it('should initialize with correct capabilities', () => {
    const caps = provider.capabilities();
    expect(caps.supportsTools).toBe(true);
    expect(caps.supportsStreaming).toBe(true);
    expect(provider.name).toBe('anthropic');
  });

  it('should format requests and parse responses correctly', async () => {
    const mockTool: ToolDefinition = {
      name: 'get_weather',
      description: async () => 'Get the local weather',
      inputSchema: z.object({ city: z.string() }),
      maxResultSizeChars: 1000,
      call: async () => ({ success: true }),
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' })
    };

    const request: ChatRequest = {
      model: 'claude-haiku-35-20241022',
      messages: [{ role: 'user', content: 'What is the weather in NYC?' }],
      systemPrompt: 'You are a helpful assistant',
      tools: [mockTool]
    };

    const response = await provider.chat(request);

    // Verify SDK was called with correctly mapped parameters
    expect(mockCreateMessages).toHaveBeenCalledTimes(1);
    const callArgs = mockCreateMessages.mock.calls[0][0];
    
    expect(callArgs.model).toBe('claude-haiku-35-20241022');
    expect(callArgs.system).toBe('You are a helpful assistant');
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools[0].name).toBe('get_weather');
    expect(callArgs.tools[0].input_schema.type).toBe('object');
    expect(callArgs.tools[0].input_schema.properties?.city).toEqual({ type: 'string' });

    // Verify KyberKit abstraction response
    expect(response.role).toBe('assistant');
    expect(response.stopReason).toBe('end_turn');
    expect(response.usage.outputTokens).toBe(20);
    expect((response.content[0] as any).text).toBe('Hello KyberKit!');
  });

  it('maps parameterless tools with type object (DeepSeek-compatible)', async () => {
    const mockTool: ToolDefinition = {
      name: 'list_allowed_directories',
      description: async () => 'List allowed directories',
      inputSchema: z.object({}),
      maxResultSizeChars: 1000,
      call: async () => ({ success: true }),
      isConcurrencySafe: () => true,
      isReadOnly: () => true,
      isEnabled: () => true,
      checkPermissions: async () => ({ behavior: 'allow' }),
    };

    await provider.chat({
      model: 'claude-haiku-35-20241022',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [mockTool],
    });

    const callArgs = mockCreateMessages.mock.calls.at(-1)?.[0];
    expect(callArgs.tools[0].input_schema).toEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('should count tokens correctly', async () => {
    const content: MessageContent = { type: 'text', text: 'Count this text' };
    const tokens = await provider.countTokens(content);
    expect(tokens).toBe(42); // Mocked response
  });

  it('should stream text deltas and final usage', async () => {
    mockStreamEvents = [
      {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 11,
            cache_creation_input_tokens: 7,
            cache_read_input_tokens: 3
          }
        }
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: ' world' }
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn' },
        usage: { output_tokens: 9 }
      },
      { type: 'message_stop' }
    ];

    const request: ChatRequest = {
      model: 'claude-haiku-35-20241022',
      messages: [{ role: 'user', content: 'hi' }],
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.chatStream(request)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ' world' },
      { type: 'message_stop', stopReason: 'end_turn' },
      {
        type: 'usage',
        usage: {
          inputTokens: 11,
          outputTokens: 9,
          cacheCreationTokens: 7,
          cacheReadTokens: 3
        }
      }
    ]);
  });

  it('should stream tool use input fragments and map tool_use stop reason', async () => {
    mockStreamEvents = [
      {
        type: 'message_start',
        message: { usage: { input_tokens: 5 } }
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tool_1', name: 'get_weather' }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"city":"' }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: 'NYC"}' }
      },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'tool_use' },
        usage: { output_tokens: 4 }
      },
      { type: 'message_stop' }
    ];

    const request: ChatRequest = {
      model: 'claude-haiku-35-20241022',
      messages: [{ role: 'user', content: 'weather?' }],
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.chatStream(request)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'tool_use_start', id: 'tool_1', name: 'get_weather' },
      { type: 'tool_use_input', id: 'tool_1', inputFragment: '{"city":"' },
      { type: 'tool_use_input', id: 'tool_1', inputFragment: 'NYC"}' },
      { type: 'tool_use_stop', id: 'tool_1' },
      { type: 'message_stop', stopReason: 'tool_use' },
      { type: 'usage', usage: { inputTokens: 5, outputTokens: 4 } }
    ]);
  });

  it('should stream thinking deltas and preserve usage fields', async () => {
    mockStreamEvents = [
      {
        type: 'message_start',
        message: {
          usage: {
            input_tokens: 13,
            cache_creation_input_tokens: 2
          }
        }
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'thinking' }
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'reasoning...' }
      },
      {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: { output_tokens: 8 }
      },
      { type: 'message_stop' }
    ];

    const request: ChatRequest = {
      model: 'claude-haiku-35-20241022',
      messages: [{ role: 'user', content: 'think' }],
    };

    const events: StreamEvent[] = [];
    for await (const event of provider.chatStream(request)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: 'thinking_delta', text: 'reasoning...' },
      { type: 'message_stop', stopReason: 'max_tokens' },
      {
        type: 'usage',
        usage: {
          inputTokens: 13,
          outputTokens: 8,
          cacheCreationTokens: 2
        }
      }
    ]);
  });
});
