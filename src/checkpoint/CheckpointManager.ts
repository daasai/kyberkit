import { CheckpointProvider, Checkpoint, CheckpointId, InterruptionKind } from '../types/checkpoint.js';
import { SessionMemory } from '../memory/SessionMemory.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { randomUUID } from 'crypto';

interface AgentSnapshot {
  id: string;
  messages: any[];
  taskProgress: any;
  status: string;
}

/**
 * [R2.2] CheckpointManager - Coordinates state persistence and recovery.
 * [C4]: Interruption-based auto-recovery (turn continuation).
 * Borrowed from CC's deserializeMessagesWithInterruptDetection().
 */
export class CheckpointManager {
  constructor(
    private readonly provider: CheckpointProvider,
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly version = 'v1'
  ) {}

  /** 
   * [R2.2] Captures current agent and session state into a checkpoint.
   */
  async save(
    agent: AgentSnapshot, 
    session: SessionMemory, 
    interruptionKind: InterruptionKind = 'none'
  ): Promise<CheckpointId> {
    const checkpointId = `${agent.id}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    
    const checkpoint: Checkpoint = {
      id: checkpointId,
      agentId: agent.id,
      timestamp: Date.now(),
      messages: [...agent.messages],
      sessionSnapshot: { entries: (session as any).entries, timestamp: Date.now() },
      taskProgress: agent.taskProgress || {},
      interruptionState: {
        kind: interruptionKind,
        interruptedAt: Date.now(),
      },
      version: this.version,
    };

    await this.provider.save(checkpoint);
    this.eventBus.emit('checkpoint.saved', { agentId: agent.id, checkpointId });
    return checkpointId;
  }

  /**
   * [C4] Restores an agent to a previously saved checkpoint.
   * [CC-Aligned]: Detects interruption state and injects continuation message if needed.
   */
  async restore(
    checkpointId: CheckpointId, 
    agent: AgentSnapshot, 
    session: SessionMemory
  ): Promise<void> {
    const state = await this.provider.restore(checkpointId);

    // Restore session memory (needs correct internal access)
    (session as any).entries = state.sessionSnapshot.entries;
    (session as any).isDirty = true;
    await session.flush();

    // Restore agent messages
    agent.messages = [...state.messages];
    agent.taskProgress = state.taskProgress;

    // [C4] Handle interruption-based auto-recovery (CC specific pattern)
    if (state.interruptionState.kind === 'interrupted_turn') {
      // Agent was mid-tool-call — inject synthetic continuation message
      agent.messages.push({
        role: 'user',
        content: 'Continue from where you left off.',
      });
      this.eventBus.emit('checkpoint.auto_continued', {
        agentId: agent.id, checkpointId, reason: 'interrupted_turn',
      });
    } else if (state.interruptionState.kind === 'interrupted_prompt') {
      // User sent message but agent never responded — replay user message (log only for now)
      this.eventBus.emit('checkpoint.auto_continued', {
        agentId: agent.id, checkpointId, reason: 'interrupted_prompt',
      });
    }

    this.eventBus.emit('checkpoint.restored', { agentId: agent.id, checkpointId });
  }

  async prune(agentId: string, maxSnapshots: number, maxAgeMs: number): Promise<void> {
    const count = await this.provider.prune(agentId, maxSnapshots, maxAgeMs);
    if (count > 0) {
      this.eventBus.emit('checkpoint.pruned', { count });
    }
  }
}
