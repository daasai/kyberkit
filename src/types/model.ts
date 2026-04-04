import { ToolDefinition } from './tool.js';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<MessageContent>;
}

export type MessageContent = 
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | Array<MessageContent>; is_error?: boolean };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  tools?: ToolDefinition[];
  temperature?: number;
}

export interface ChatResponse {
  role: 'assistant';
  content: Array<MessageContent>;
  stopReason?: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ChatStreamChunk {
  type: 'text_delta' | 'tool_use_start' | 'tool_use_delta' | 'message_stop';
  text?: string;
  toolUse?: { id: string; name: string; inputFragment: string };
}

export interface ModelCapabilities {
  maxContextTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
  supportsThinking: boolean;
}

export interface ModelProvider {
  readonly name: string;
  readonly supportedModels: string[];
  
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk>;
  capabilities(): ModelCapabilities;
  countTokens(content: MessageContent | string): Promise<number>;
}
