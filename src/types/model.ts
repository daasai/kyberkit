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
  stopReason: StopReason;
  usage: UsageInfo;
}

export interface UsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

export type StopReason = 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';

export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_input'; id: string; inputFragment: string }
  | { type: 'tool_use_stop'; id: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'message_stop'; stopReason: StopReason }
  | { type: 'usage'; usage: UsageInfo };



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
  chatStream(request: ChatRequest): AsyncIterable<StreamEvent>;
  capabilities(): ModelCapabilities;
  countTokens(content: MessageContent | string): Promise<number>;
}
