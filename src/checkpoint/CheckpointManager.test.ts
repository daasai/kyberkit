import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CheckpointManager } from './CheckpointManager.js';
import { JsonCheckpointProvider } from './JsonCheckpointProvider.js';
import { SessionMemory } from '../memory/SessionMemory.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { rm } from 'fs/promises';
import { join } from 'path';

describe('CheckpointManager', () => {
  const testDir = './test-checkpoint-data';
  let eventBus: TypedEventBus<KyberEvents>;
  let provider: JsonCheckpointProvider;
  let manager: CheckpointManager;
  let session: SessionMemory;

  beforeEach(async () => {
    eventBus = new TypedEventBus<KyberEvents>();
    provider = new JsonCheckpointProvider(testDir);
    manager = new CheckpointManager(provider, eventBus);
    session = new SessionMemory(join(testDir, 'session.json'), { tokenThreshold: 100, toolCallThreshold: 10, debounceMs: 0 }, eventBus);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should save and restore agent state', async () => {
    const agent = { id: 'agent-1', messages: [{ role: 'user', content: 'hello' }], status: 'running', taskProgress: {} };
    
    const id = await manager.save(agent, session);
    expect(id).toBeDefined();

    // Modify state
    agent.messages = [];
    
    await manager.restore(id, agent, session);
    expect(agent.messages).toHaveLength(1);
    expect(agent.messages[0].content).toBe('hello');
  });

  it('should detect interrupted turn and inject "Continue" [C4]', async () => {
    const agent = { id: 'agent-1', messages: [{ role: 'assistant', content: 'thinking...' }], status: 'running', taskProgress: {} };
    
    // Save with 'interrupted_turn'
    const id = await manager.save(agent, session, 'interrupted_turn');
    
    const restoredAgent = { id: 'agent-1', messages: [], status: 'running', taskProgress: {} };
    await manager.restore(id, restoredAgent, session);
    
    expect(restoredAgent.messages).toHaveLength(2);
    expect(restoredAgent.messages[1].content).toBe('Continue from where you left off.');
  });
});
