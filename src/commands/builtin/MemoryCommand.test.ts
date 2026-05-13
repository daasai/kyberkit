import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { MemoryCommand } from './MemoryCommand.js';
import { LongTermMemory } from '../../memory/LongTermMemory.js';
import { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';
import type { AssetEntry } from '../../types/assets.js';
import { rm } from 'fs/promises';

describe('MemoryCommand', () => {
  const root = './test-data-memory-cmd';
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

  const makeCmd = (opts: { assets?: AssetEntry[]; withLongTerm?: boolean } = {}) => {
    const assets = opts.assets ?? [];
    return new MemoryCommand(
      () => assets,
      opts.withLongTerm === false ? undefined : () => lt,
    );
  };

  it('list shows discovered asset memories', async () => {
    const assets: AssetEntry[] = [
      {
        id: 'mem1',
        scope: 'user',
        absolutePath: '/tmp/a.md',
        relativePath: 'a.md',
        type: 'memory',
        lastModified: 0,
        metadata: { title: 'Alpha', category: 'user' },
      } as unknown as AssetEntry,
    ];
    const cmd = makeCmd({ assets });
    const res = await cmd.execute({ _raw: 'list' });
    expect(res.success).toBe(true);
    expect(res.output).toContain('Alpha');
    expect(res.output).toContain('(user)');
  });

  it('add persists a manual memory under the user category', async () => {
    const cmd = makeCmd();
    const res = await cmd.execute({ _raw: 'add Remember to always use Bun.' });
    expect(res.success).toBe(true);

    const entries = await lt.list();
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe('Remember to always use Bun.');
    expect(entries[0].metadata?.source).toBe('manual');
    expect(entries[0].category).toBe('user');
  });

  it('add refuses empty input', async () => {
    const cmd = makeCmd();
    const res = await cmd.execute({ _raw: 'add ' });
    expect(res.success).toBe(false);
    expect(res.output).toContain('Usage');
  });

  it('remove deletes by id-prefix', async () => {
    const cmd = makeCmd();
    await cmd.execute({ _raw: 'add First fact.' });
    const [entry] = await lt.list();
    const prefix = entry.id.slice(0, 8);

    const res = await cmd.execute({ _raw: `remove ${prefix}` });
    expect(res.success).toBe(true);
    expect(await lt.list()).toHaveLength(0);
  });

  it('remove deletes by exact title match', async () => {
    const cmd = makeCmd();
    await cmd.execute({ _raw: 'add Prefer Bun to Node' });

    const res = await cmd.execute({ _raw: 'remove prefer bun to node' });
    expect(res.success).toBe(true);
    expect(await lt.list()).toHaveLength(0);
  });

  it('remove reports when nothing matches', async () => {
    const cmd = makeCmd();
    const res = await cmd.execute({ _raw: 'remove nonexistent' });
    expect(res.success).toBe(false);
    expect(res.output).toContain('No memory matches');
  });

  it('unknown subcommand yields usage message', async () => {
    const cmd = makeCmd();
    const res = await cmd.execute({ _raw: 'weird thing' });
    expect(res.success).toBe(false);
    expect(res.output).toContain('Usage: /memory');
  });

  it('add/remove report when long-term memory is unavailable', async () => {
    const cmd = makeCmd({ withLongTerm: false });
    const add = await cmd.execute({ _raw: 'add test' });
    expect(add.success).toBe(false);
    expect(add.output).toContain('not available');
    const rm = await cmd.execute({ _raw: 'remove x' });
    expect(rm.success).toBe(false);
  });
});
