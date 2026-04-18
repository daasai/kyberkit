import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MemoryStore } from './MemoryStore.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { rm } from 'fs/promises';
import { join } from 'path';

describe('MemoryStore (Sprint 4 markdown backend)', () => {
  const testDir = './test-data-memory';
  const sessionFile = join(testDir, 'session.json');
  const memoriesDir = join(testDir, 'memories');
  let eventBus: TypedEventBus<KyberEvents>;
  let store: MemoryStore;

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    eventBus = new TypedEventBus<KyberEvents>();
    store = new MemoryStore({
      sessionFile,
      memoriesDir,
      flushTrigger: { tokenThreshold: 10, toolCallThreshold: 2, debounceMs: 50 },
      eventBus,
    });
    await store.init();
  });

  afterEach(async () => {
    store.close();
    await rm(testDir, { recursive: true, force: true });
  });

  it('legacy learn() writes to both L1 and the markdown L3 backend', async () => {
    const entry = await store.learn('user', 'User loves coffee.');
    expect(entry.category).toBe('user');

    const files = await store.getLongTermMemory().getStore().list();
    expect(files).toHaveLength(1);
    expect(files[0].body).toContain('User loves coffee');
    expect(files[0].source).toBe('manual');
  });

  it('recordToolCall is a safe no-op callable without a loaded conversation', () => {
    expect(() => {
      store.recordToolCall();
      store.recordToolCall();
      store.recordToolCall();
    }).not.toThrow();
  });

  it('recallByCategory merges L1 and L3 and dedupes by content', async () => {
    await store.learn('user', 'User is Bob.');
    await store.learn('project', 'Project Alpha.');

    const userMemories = await store.recallByCategory('user');
    expect(userMemories).toHaveLength(1);
    expect(userMemories[0].content).toBe('User is Bob.');
  });

  it('getLongTermMemory exposes the markdown store root', () => {
    const lt = store.getLongTermMemory();
    expect(lt.getRootDir()).toBe(memoriesDir);
  });
});
