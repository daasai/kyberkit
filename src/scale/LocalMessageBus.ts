import { MessageBus, AgentEvent, AgentMessage, Subscription } from '../types/scale.js';

export class LocalMessageBus implements MessageBus {
  private eventListeners = new Map<string, Set<(event: AgentEvent) => void | Promise<void>>>();
  private messageQueues = new Map<string, AgentMessage[]>();
  private resolvers = new Map<string, ((value: IteratorResult<AgentMessage>) => void)[]>();

  publish(event: AgentEvent): void {
    const handlers = this.eventListeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  subscribe(eventType: string, handler: (event: AgentEvent) => void | Promise<void>): Subscription {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    const handlers = this.eventListeners.get(eventType)!;
    handlers.add(handler);

    return {
      unsubscribe: () => handlers.delete(handler)
    };
  }

  async send(toAgentId: string, message: AgentMessage): Promise<void> {
    if (!this.messageQueues.has(toAgentId)) {
      this.messageQueues.set(toAgentId, []);
    }
    const queue = this.messageQueues.get(toAgentId)!;
    queue.push(message);

    // Resolve any pending receive() calls
    const res = this.resolvers.get(toAgentId);
    if (res && res.length > 0) {
      const first = res.shift()!;
      first({ value: queue.shift()!, done: false });
    }
  }

  async *receive(agentId: string): AsyncIterableIterator<AgentMessage> {
    if (!this.messageQueues.has(agentId)) {
      this.messageQueues.set(agentId, []);
    }
    const queue = this.messageQueues.get(agentId)!;

    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else {
        // Wait for next message
        if (!this.resolvers.has(agentId)) {
          this.resolvers.set(agentId, []);
        }
        yield new Promise<AgentMessage>(resolve => {
          this.resolvers.get(agentId)!.push((res) => {
             if (!res.done) resolve(res.value);
          });
        });
      }
    }
  }
}
