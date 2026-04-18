import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { LongTermMemory } from './LongTermMemory.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { rm } from 'fs/promises';
import { randomUUID } from 'crypto';

describe('LongTermMemory (Markdown backend)', () => {
  const root = './test-data-ltm-markdown';
  let bus: TypedEventBus<KyberEvents>;
  let lt: LongTermMemory;

  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    bus = new TypedEventBus<KyberEvents>();
    lt = new LongTermMemory(root, bus);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const makeEntry = (over: Partial<Parameters<typeof lt.writeEntry>[0]> = {}) => ({
    id: randomUUID(),
    category: 'user' as const,
    content: 'User prefers Bun runtime.',
    timestamp: Date.now(),
    title: 'User prefers Bun',
    source: 'auto' as const,
    tags: ['runtime', 'bun'],
    ...over,
  });

  it('writeEntry round-trips through findByCategory with rich metadata', async () => {
    const e = makeEntry();
    await lt.writeEntry(e);

    const users = await lt.findByCategory('user');
    expect(users).toHaveLength(1);
    expect(users[0].content).toContain('Bun runtime');
    expect(users[0].category).toBe('user');
    expect(users[0].metadata?.title).toBe('User prefers Bun');
    expect(users[0].metadata?.source).toBe('auto');
    expect(users[0].metadata?.path).toMatch(/user\//);
  });

  it('search returns entries matching title or body', async () => {
    await lt.writeEntry(makeEntry({ title: 'Uses Biome', content: 'Biome replaces eslint' }));
    await lt.writeEntry(makeEntry({ title: 'Prefers Bun', content: 'Bun is the runtime' }));
    const biome = await lt.search('biome');
    expect(biome).toHaveLength(1);
    expect(biome[0].metadata?.title).toBe('Uses Biome');
  });

  it('remove() deletes an entry by id', async () => {
    const e = makeEntry();
    await lt.writeEntry(e);
    expect(await lt.remove(e.id)).toBe(true);
    expect(await lt.list()).toHaveLength(0);
  });

  it('prune removes old entries and trims to a max count', async () => {
    const oldTs = Date.now() - 1000 * 60 * 60 * 24 * 30;
    await lt.writeEntry(makeEntry({ title: 'Old', timestamp: oldTs }));
    await lt.writeEntry(makeEntry({ title: 'New A' }));
    await lt.writeEntry(makeEntry({ title: 'New B' }));

    await lt.prune(1000 * 60 * 60 * 24 * 7, 2);

    const remaining = await lt.list();
    expect(remaining).toHaveLength(2);
    expect(remaining.every((e) => e.metadata?.title !== 'Old')).toBe(true);
  });
});
