import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MarkdownMemoryStore, slug } from './MarkdownMemoryStore.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

describe('MarkdownMemoryStore', () => {
  const root = './test-data-md-memory';
  let bus: TypedEventBus<KyberEvents>;
  let store: MarkdownMemoryStore;

  beforeEach(async () => {
    await rm(root, { recursive: true, force: true });
    bus = new TypedEventBus<KyberEvents>();
    store = new MarkdownMemoryStore(root, bus);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const entry = (overrides: Partial<Parameters<typeof store.write>[0]> = {}) => ({
    id: randomUUID(),
    category: 'project' as const,
    title: 'AgentLoop stream semantics',
    tags: ['agent', 'streaming'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: 'auto' as const,
    score: 1.0,
    body: 'AgentLoop yields events through the pipeline.',
    ...overrides,
  });

  it('writes a memory under <category>/<slug>-<id8>.md with frontmatter + body', async () => {
    const e = entry();
    const written = await store.write(e);

    expect(existsSync(written.path)).toBe(true);
    expect(written.path).toContain('project/agentloop-stream-semantics');
    expect(written.path).toContain(e.id.slice(0, 8));

    const raw = await readFile(written.path, 'utf-8');
    expect(raw).toMatch(/^---/);
    expect(raw).toContain(`id: ${e.id}`);
    expect(raw).toContain('category: project');
    expect(raw).toContain('AgentLoop yields events');
  });

  it('emits memory.written on write', async () => {
    const events: KyberEvents['memory.written'][] = [];
    bus.on('memory.written', (e) => events.push(e));
    const e = entry();
    await store.write(e);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      tierId: 'L3',
      entryId: e.id,
      category: e.category,
      title: e.title,
      source: e.source,
    });
    expect(typeof events[0]!.path).toBe('string');
  });

  it('list() discovers files across category subdirs and skips MEMORY.md', async () => {
    await store.write(entry({ title: 'Uses Bun', category: 'user' }));
    await store.write(entry({ title: 'Prefers Tailwind', category: 'user' }));
    await store.write(entry({ title: 'AgentLoop stream', category: 'project' }));

    const all = await store.list();
    expect(all).toHaveLength(3);
    expect(all.map((m) => m.category).sort()).toEqual(['project', 'user', 'user']);

    expect(existsSync(join(root, 'MEMORY.md'))).toBe(true);
  });

  it('findByCategory and search filter correctly', async () => {
    const a = entry({ title: 'User prefers Bun', category: 'user', body: 'bun runtime' });
    const b = entry({ title: 'Project uses Biome', category: 'project', body: 'biome linter' });
    await store.write(a);
    await store.write(b);

    const users = await store.findByCategory('user');
    expect(users).toHaveLength(1);
    expect(users[0].title).toBe('User prefers Bun');

    const bunSearch = await store.search('bun');
    expect(bunSearch).toHaveLength(1);
    expect(bunSearch[0].title).toBe('User prefers Bun');

    const biomeSearch = await store.search('biome');
    expect(biomeSearch).toHaveLength(1);
    expect(biomeSearch[0].title).toBe('Project uses Biome');
  });

  it('write(sameId) replaces the old file even when the title changes', async () => {
    const id = randomUUID();
    const first = await store.write(entry({ id, title: 'Old title' }));
    expect(existsSync(first.path)).toBe(true);

    const second = await store.write(entry({ id, title: 'New title' }));
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(true);

    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('New title');
  });

  it('remove deletes a file by id', async () => {
    const e = entry();
    const written = await store.write(e);
    expect(await store.remove(e.id)).toBe(true);
    expect(existsSync(written.path)).toBe(false);
    expect(await store.remove(e.id)).toBe(false);
  });

  it('refreshIndex writes a sorted MEMORY.md', async () => {
    await store.write(entry({ title: 'Beta', category: 'user' }));
    await store.write(entry({ title: 'Alpha', category: 'user' }));

    const indexRaw = await readFile(join(root, 'MEMORY.md'), 'utf-8');
    expect(indexRaw).toContain('# Memory Index');
    expect(indexRaw).toContain('## user (2)');
    expect(indexRaw).toContain('[Alpha]');
    expect(indexRaw).toContain('[Beta]');
  });

  it('prune evicts by age and by max count', async () => {
    const old = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();
    const now = new Date().toISOString();
    await store.write(entry({ title: 'Older', createdAt: old, updatedAt: old }));
    await store.write(entry({ title: 'New 1', createdAt: now, updatedAt: now }));
    await store.write(entry({ title: 'New 2', createdAt: now, updatedAt: now }));

    const removed = await store.prune(1000 * 60 * 60 * 24 * 7, 2);
    expect(removed).toBeGreaterThanOrEqual(1);

    const all = await store.list();
    expect(all).toHaveLength(2);
    expect(all.every((m) => m.title !== 'Older')).toBe(true);
  });

  it('slug() is URL-safe and bounded', () => {
    expect(slug('Hello, World!')).toBe('hello-world');
    expect(slug('   leading-spaces   ')).toBe('leading-spaces');
    expect(slug('A'.repeat(120)).length).toBeLessThanOrEqual(60);
    expect(slug('')).toBe('memory');
  });
});
