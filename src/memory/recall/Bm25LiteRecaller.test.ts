import { describe, expect, it } from 'bun:test';
import { Bm25LiteRecaller } from './Bm25LiteRecaller.js';
import type { MemoryEntry } from '../../types/memory.js';

function entry(id: string, body: string, title?: string): MemoryEntry {
  return {
    id,
    category: 'project',
    content: body,
    timestamp: Date.now(),
    metadata: { title: title ?? id, tags: [] },
  };
}

describe('Bm25LiteRecaller', () => {
  it('ranks documents by query terms', () => {
    const r = new Bm25LiteRecaller();
    const docs = [
      entry('1', 'unrelated text about weather'),
      entry('2', 'how to run npm test in this repository'),
      entry('3', 'bash script for logging'),
    ];
    const top = r.recall(docs, 'npm test repository', 2);
    expect(top[0]!.id).toBe('2');
  });
});
