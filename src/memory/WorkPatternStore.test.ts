import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonWorkPatternStore } from './WorkPatternStore.js';

let dir: string;
let store: JsonWorkPatternStore;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kyber-patterns-'));
  store = new JsonWorkPatternStore(join(dir, 'signals.json'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('JsonWorkPatternStore', () => {
  it('appendSignal persists to disk and getTaskSignals returns them', async () => {
    await store.appendSignal(
      { signal_type: 'accepted', signal_context: 'User accepted PRD outline', strength: 0.8 },
      { session_id: 'sess-1', output_id: 'artifact-A', work_type: 'prd_generation' },
    );
    await store.appendSignal(
      { signal_type: 'modified', signal_context: 'User rewrote problem block', strength: 1.0 },
      { session_id: 'sess-1', output_id: 'artifact-A', work_type: 'prd_generation' },
    );

    const signals = await store.getTaskSignals('artifact-A');
    expect(signals).toHaveLength(2);
    expect(signals[0]?.signal_type).toBe('accepted');
  });

  it('signals survive process restart (new store instance)', async () => {
    await store.appendSignal(
      { signal_type: 'rejected', signal_context: 'Wrong format', strength: 0.9 },
      { session_id: 'sess-1', output_id: 'artifact-B', work_type: 'analysis' },
    );

    const store2 = new JsonWorkPatternStore(join(dir, 'signals.json'));
    const signals = await store2.getTaskSignals('artifact-B');
    expect(signals).toHaveLength(1);
  });

  it('3 accepted signals across 3 artifacts trigger high confidence pattern', async () => {
    for (let i = 1; i <= 3; i++) {
      await store.appendSignal(
        { signal_type: 'accepted', signal_context: 'three-part structure accepted', strength: 0.85 },
        { session_id: `sess-${i}`, output_id: `artifact-${i}`, work_type: 'prd_generation' },
      );
    }

    const patterns = await store.getWorkspacePatterns('prd_generation');
    const highConf = patterns.filter((p) => p.confidence > 0.7);
    expect(highConf.length).toBeGreaterThan(0);
  });

  it('ingestFeedback does not require Kevin product types', async () => {
    const signal = { signal_type: 'accepted' as const, signal_context: 'ok', strength: 0.7 };
    const scope = { session_id: 's1', work_type: 'generic_task' };
    await expect(store.appendSignal(signal, scope)).resolves.toBeUndefined();
  });
});
