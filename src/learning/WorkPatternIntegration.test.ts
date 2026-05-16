import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { JsonWorkPatternStore } from '../memory/WorkPatternStore.js';

let dir: string;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('WorkPatternStore cross-session integration', () => {
  it('signals from session 1 are visible to session 2', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kyber-integration-'));
    const storePath = join(dir, 'patterns.json');

    const store1 = new JsonWorkPatternStore(storePath);
    await store1.appendSignal(
      { signal_type: 'accepted', signal_context: 'three-level structure works', strength: 0.9 },
      { session_id: 'sess-1', output_id: 'doc-1', work_type: 'prd' },
    );
    await store1.promoteSessionSignals('sess-1');

    const store2 = new JsonWorkPatternStore(storePath);
    const patterns = await store2.getWorkspacePatterns('prd');

    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0]?.signal_count).toBeGreaterThanOrEqual(1);
  });

  it('3 independent artifacts × accepted signal = confidence > 0.7', async () => {
    dir = await mkdtemp(join(tmpdir(), 'kyber-conf-'));
    const store = new JsonWorkPatternStore(join(dir, 'p.json'));

    for (let i = 1; i <= 3; i++) {
      await store.appendSignal(
        { signal_type: 'accepted', signal_context: 'executive summary accepted', strength: 0.85 },
        { session_id: `sess-${i}`, output_id: `report-${i}`, work_type: 'analysis' },
      );
    }

    const patterns = await store.getWorkspacePatterns('analysis');
    const highConf = patterns.filter((p) => p.confidence > 0.7);
    expect(highConf.length).toBeGreaterThan(0);
  });
});
