import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SessionMemory } from './SessionMemory.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { MemoryCategory, MemoryFlushTrigger } from '../types/memory.js';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';

describe('SessionMemory.mergeExtracted', () => {
  const testDir = './test-data-sessmem';
  const file = join(testDir, 'session.json');
  const trigger: MemoryFlushTrigger = {
    tokenThreshold: 1_000_000,
    toolCallThreshold: 1_000_000,
    debounceMs: 50,
  };
  let eventBus: TypedEventBus<KyberEvents>;
  let mem: SessionMemory;

  beforeEach(() => {
    eventBus = new TypedEventBus<KyberEvents>();
    mem = new SessionMemory(file, trigger, eventBus);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('stores extracted notes and returns them verbatim from buildContextTemplate', async () => {
    expect(mem.hasExtractedNotes()).toBe(false);

    mem.mergeExtracted('## Goal\nShip sprint4', { basedOnMessages: 5, tokenCount: 20 });

    expect(mem.hasExtractedNotes()).toBe(true);
    expect(mem.buildContextTemplate()).toBe('## Goal\nShip sprint4');
    expect(mem.getExtractedMarkdown()).toBe('## Goal\nShip sprint4');
    expect(mem.getNotesMeta()).toMatchObject({ basedOnMessages: 5, tokenCount: 20 });
  });

  it('ignores empty Markdown', () => {
    mem.mergeExtracted('   \n  ', { basedOnMessages: 1, tokenCount: 0 });
    expect(mem.hasExtractedNotes()).toBe(false);
  });

  it('persists notes across restore()', async () => {
    mem.mergeExtracted('## Goal\nPersist me', { basedOnMessages: 3, tokenCount: 10 });
    // Let flush settle
    await new Promise((r) => setTimeout(r, 30));

    const raw = await readFile(file, 'utf-8');
    expect(raw).toContain('Persist me');

    const revived = new SessionMemory(file, trigger, eventBus);
    await revived.restore();
    expect(revived.hasExtractedNotes()).toBe(true);
    expect(revived.buildContextTemplate()).toContain('Persist me');
  });

  it('falls back to heuristic section template when no extracted notes exist', async () => {
    await mem.push({
      id: 't1',
      content: 'User likes tea',
      category: 'user' as MemoryCategory,
      timestamp: Date.now(),
    });

    const rendered = mem.buildContextTemplate();
    expect(rendered).toContain('User Preferences');
    expect(rendered).toContain('User likes tea');
  });

  it('clear() resets extracted notes too', () => {
    mem.mergeExtracted('## Goal\nX', { basedOnMessages: 1, tokenCount: 1 });
    mem.clear();
    expect(mem.hasExtractedNotes()).toBe(false);
    expect(mem.buildContextTemplate()).toBe('');
  });
});
