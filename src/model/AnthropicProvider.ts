import Anthropic from '@anthropic-ai/sdk';
import type { RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages.js';
import { ModelProvider, ChatRequest, ChatResponse, StopReason, StreamEvent, ModelCapabilities, MessageContent, UsageInfo } from '../types/model.js';
import { toolInputJsonSchema } from '../tools/toolInputJsonSchema.js';

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
    const response = await this.client.messages.create(
      {
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt,
        messages: this.mapMessages(request.messages),
        tools: this.mapTools(request),
        temperature: request.temperature,
      },
      { signal: request.abortSignal },
    );

    return this.mapResponse(response as any);
  }

  /**
   * Stream a chat response using raw SSE events.
   *
   * Uses raw Stream<RawMessageStreamEvent> (not MessageStream) to avoid
   * O(n^2) JSON re-parsing on each input_json_delta. Content blocks are
   * accumulated manually as strings, following the DeepCC pattern.
   */
  async *chatStream(request: ChatRequest): AsyncIterable<StreamEvent> {
    const stream = await this.client.messages.create(
      {
        model: request.model,
        max_tokens: request.maxTokens ?? 4096,
        system: request.systemPrompt,
        messages: this.mapMessages(request.messages),
        tools: this.mapTools(request),
        temperature: request.temperature,
        stream: true,
      },
      { signal: request.abortSignal },
    );

    // Per-block accumulation state
    // Maps block index → { type, id?, name?, data }
    const contentBlocks = new Map<number, {
      type: string;
      id?: string;
      name?: string;
      data: string;
    }>();

    let stopReason: StopReason = 'end_turn';
    const usage: UsageInfo = {
      inputTokens: 0,
      outputTokens: 0,
    };

    for await (const event of stream as AsyncIterable<RawMessageStreamEvent>) {
      switch (event.type) {
        case 'message_start': {
          // Extract initial usage from the message header
          const msg = event.message;
          usage.inputTokens = msg.usage.input_tokens;
          const cacheCreation = (msg.usage as any).cache_creation_input_tokens;
          const cacheRead = (msg.usage as any).cache_read_input_tokens;
          if (cacheCreation) usage.cacheCreationTokens = cacheCreation;
          if (cacheRead) usage.cacheReadTokens = cacheRead;
          break;
        }

        case 'content_block_start': {
          const block = event.content_block as any;
          contentBlocks.set(event.index, {
            type: block.type,
            id: block.id,
            name: block.name,
            data: '',
          });

          if (block.type === 'tool_use') {
            yield {
              type: 'tool_use_start',
              id: block.id,
              name: block.name,
            };
          }
          break;
        }

        case 'content_block_delta': {
          const blockState = contentBlocks.get(event.index);
          if (!blockState) break;

          const delta = event.delta as any;
          if (delta.type === 'text_delta') {
            blockState.data += delta.text;
            yield { type: 'text_delta', text: delta.text };
          } else if (delta.type === 'input_json_delta') {
            blockState.data += delta.partial_json;
            yield {
              type: 'tool_use_input',
              id: blockState.id!,
              inputFragment: delta.partial_json,
            };
          } else if (delta.type === 'thinking_delta') {
            blockState.data += delta.thinking;
            yield { type: 'thinking_delta', text: delta.thinking };
          }
          break;
        }

        case 'content_block_stop': {
          const blockState = contentBlocks.get(event.index);
          if (blockState?.type === 'tool_use') {
            yield {
              type: 'tool_use_stop',
              id: blockState.id!,
            };
          }
          break;
        }

        case 'message_delta': {
          const delta = event.delta as any;
          if (delta.stop_reason) {
            stopReason = this.mapStopReason(delta.stop_reason);
          }
          if (event.usage) {
            usage.outputTokens = event.usage.output_tokens;
          }
          break;
        }

        case 'message_stop': {
          yield { type: 'message_stop', stopReason };
          yield { type: 'usage', usage: { ...usage } };
          break;
        }
      }
    }
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
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: mappedContent }],
    });
    return result.input_tokens;
  }

  /**
   * Map KyberKit messages to Anthropic SDK format.
   */
  private mapMessages(messages: ChatRequest['messages']): Anthropic.Messages.MessageParam[] {
    return messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as any,
    }));
  }

  /**
   * Map KyberKit tool definitions to Anthropic SDK format.
   */
  private mapTools(request: ChatRequest): Anthropic.Messages.Tool[] | undefined {
    const resolved = request.resolvedTools;
    if (resolved && resolved.length > 0) {
      return resolved.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: toolInputJsonSchema(t.inputSchema) as any,
      }));
    }
    const tools = request.tools;
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({
      name: t.name,
      description: t.description ? '(Dynamic desc enabled)' : '',
      input_schema: toolInputJsonSchema(t.inputSchema) as any,
    }));
  }

  /**
   * Map Anthropic proprietary response format to KyberKit standard format.
   */
  private mapResponse(response: Anthropic.Messages.Message): ChatResponse {
    return {
      role: 'assistant',
      content: response.content as unknown as MessageContent[],
      stopReason: this.mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Map Anthropic stop_reason string to KyberKit StopReason.
   */
  private mapStopReason(reason: string | null): StopReason {
    switch (reason) {
      case 'end_turn': return 'end_turn';
      case 'max_tokens': return 'max_tokens';
      case 'stop_sequence': return 'stop_sequence';
      case 'tool_use': return 'tool_use';
      default: return 'end_turn';
    }
  }
}
