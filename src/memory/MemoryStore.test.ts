import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MemoryStore } from './MemoryStore.js';
import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { rm } from 'fs/promises';
import { join } from 'path';

describe('MemoryStore', () => {
  const testDir = './test-data-memory';
  const sessionFile = join(testDir, 'session.json');
  const dbFile = join(testDir, 'longterm.db');
  let eventBus: TypedEventBus<KyberEvents>;
  let store: MemoryStore;

  beforeEach(async () => {
    eventBus = new TypedEventBus<KyberEvents>();
    store = new MemoryStore({
      sessionFile,
      dbFile,
      flushTrigger: { tokenThreshold: 10, toolCallThreshold: 2, debounceMs: 50 },
      eventBus
    });
  });

  afterEach(async () => {
    if (store) store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('should learn and recall across tiers', async () => {
    await store.learn('user', 'User loves coffee.');
    
    // Check L1/L2/L3 combined recall
    const context = store.getContext();
    expect(context).toContain('User loves coffee');
  });

  it('should trigger session flush on tool calls', async () => {
    const spy = vi.fn();
    eventBus.on('memory.session_flushed', spy);

    await store.learn('project', 'Project X started.');
    store.recordToolCall();
    store.recordToolCall(); // Threshold is 2

    // Wait for async flush
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(spy).toHaveBeenCalled();
  });

  it('should filter by category', async () => {
    await store.learn('user', 'User is Bob.');
    await store.learn('project', 'Project Alpha.');
    
    const userMemories = store.recallByCategory('user');
    expect(userMemories).toHaveLength(1);
    expect(userMemories[0].content).toBe('User is Bob.');
  });
});
