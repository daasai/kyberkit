import Anthropic from '@anthropic-ai/sdk';
import { ModelProvider, ChatRequest, ChatResponse, ChatStreamChunk, ModelCapabilities, MessageContent } from '../types/model.js';
import { zodToJsonSchema } from 'zod-to-json-schema';

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly supportedModels = ['claude-sonnet-4-20250514', 'claude-haiku-35-20241022'];
  private client: Anthropic;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
  }

  /**
   * Send a complete chat turn request to Anthropic API.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: request.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content as any // Type assertion needed due to strict matching
      })),
      tools: request.tools?.map(t => ({
        name: t.name,
        description: t.description ? '(Dynamic desc enabled)' : '', // We resolve dynamic descriptions earlier in agent loop
        input_schema: zodToJsonSchema(t.inputSchema as any) as any,
      })),
      temperature: request.temperature,
    });

    return this.mapResponse(response as any);
  }

  /**
   * Stream a chat response.
   * Note: Stream implementation will be completed in Phase 1.
   */
  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    throw new Error('Streaming not fully implemented in Phase 0.');
  }

  /**
   * Define model capabilities.
   */
  capabilities(): ModelCapabilities {
    return {
      maxContextTokens: 200_000,
      supportsTools: true,
      supportsVision: true,
      supportsStreaming: true,
      supportsThinking: true,
    };
  }

  /**
   * Count tokens for a specific message content using Claude's token counting API.
   */
  async countTokens(content: MessageContent | string): Promise<number> {
    const mappedContent = typeof content === 'string' ? content : (content as any);
    const result = await this.client.messages.countTokens({
      model: 'claude-sonnet-4-20250514', // Using a default supported model for counting
      messages: [{ role: 'user', content: mappedContent }],
    });
    return result.input_tokens;
  }

  /**
   * Map Anthropic proprietary response format to KyberKit standard format.
   */
  private mapResponse(response: Anthropic.Messages.Message): ChatResponse {
    let stopReason: ChatResponse['stopReason'];
    switch (response.stop_reason) {
      case 'end_turn': stopReason = 'end_turn'; break;
      case 'max_tokens': stopReason = 'max_tokens'; break;
      case 'stop_sequence': stopReason = 'stop_sequence'; break;
      case 'tool_use': stopReason = 'tool_use'; break;
      default: stopReason = 'end_turn';
    }

    return {
      role: 'assistant',
      content: response.content as unknown as MessageContent[],
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    };
  }
}
