import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { AnthropicProvider } from './AnthropicProvider.js';
import { ChatRequest, MessageContent } from '../types/model.js';
import { ToolDefinition } from '../types/tool.js';
import { z } from 'zod';

const mockCreateMessages = mock(async (params: any) => {
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

    // Verify KyberKit abstraction response
    expect(response.role).toBe('assistant');
    expect(response.stopReason).toBe('end_turn');
    expect(response.usage.outputTokens).toBe(20);
    expect((response.content[0] as any).text).toBe('Hello KyberKit!');
  });

  it('should count tokens correctly', async () => {
    const content: MessageContent = { type: 'text', text: 'Count this text' };
    const tokens = await provider.countTokens(content);
    expect(tokens).toBe(42); // Mocked response
  });
});
