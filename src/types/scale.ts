// /src/types/scale.ts

export interface AgentEvent {
  type: string;
  sourceId: string;
  timestamp: number;
  payload: Record<string, any>;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  content: string;
  replyToId?: string;
}

export interface BudgetConfig {
  maxTokens: number;
  maxTimeMs: number;
  alertThresholdPercent: number;
  onExceeded: 'alert' | 'pause' | 'force_kill';
}

export interface BudgetStatus {
  tokensUsed: number;
  timeElapsedMs: number;
  isAlerting: boolean;
  isExceeded: boolean;
}

export interface Subscription {
  unsubscribe(): void;
}

export interface MessageBus {
  publish(event: AgentEvent): void;
  subscribe(eventType: string, handler: (event: AgentEvent) => void | Promise<void>): Subscription;
  send(toAgentId: string, message: AgentMessage): Promise<void>;
  receive(agentId: string): AsyncIterable<AgentMessage>;
}

export interface ResourceManager {
  configure(config: BudgetConfig): void;
  reportTokenConsumption(tokens: number): void;
  tick(): BudgetStatus;
  reset(): void;
}
