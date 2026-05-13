import { AgentStatus, AgentInstance, AgentDefinition } from '../types/agent.js';
import { transition, isTerminal } from './AgentStateMachine.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { MessageContent } from '../types/model.js';
import { ToolUseContext } from '../types/tool.js';

export class DefaultAgentInstance implements AgentInstance {
  public status: AgentStatus = 'created';
  public readonly context: ToolUseContext;
  
  // Minimal internal memory for Phase 0
  public messages: Array<{ role: 'user' | 'assistant'; content: Array<MessageContent> | string }> = [];

  constructor(
    public readonly id: string,
    public readonly definition: AgentDefinition,
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly traceId: string = crypto.randomUUID()
  ) {
    this.context = { agentId: this.id, traceId: this.traceId, callId: '' };
    
    // Load initial context if any
    if (this.definition.initialContext) {
      for (const msg of this.definition.initialContext) {
        this.messages.push(msg);
      }
    }
    
    this.eventBus.emit('agent.created', { agentId: this.id, definition: this.definition });
  }

  transition(action: string): void {
    const oldStatus = this.status;
    this.status = transition(oldStatus, action);
    
    this.eventBus.emit('agent.status_changed', { 
      agentId: this.id, 
      from: oldStatus, 
      to: this.status 
    });

    if (isTerminal(this.status)) {
      if (this.status === 'killed') {
        this.eventBus.emit('agent.killed', { agentId: this.id, reason: 'kill action triggered' });
      }
    }
  }

  addMessage(role: 'user' | 'assistant', content: Array<MessageContent> | string): void {
    this.messages.push({ role, content });
  }

  dispose(): void {
    if (!isTerminal(this.status)) {
      try {
        this.transition('kill');
      } catch (err) {
        // Ignore if already terminal
      }
    }
    this.messages = [];
  }
}
