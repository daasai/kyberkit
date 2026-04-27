import type { MemoryEntry } from '../../types/memory.js';

/**
 * Cheap local recall: Okapi BM25 over tokenized document text (title + tags + body).
 * No embeddings (Track B MVP); future `EmbeddingRecaller` can implement the same interface.
 */
export class Bm25LiteRecaller {
  private readonly k1 = 1.5;
  private readonly b = 0.75;

  recall(docs: readonly MemoryEntry[], query: string, k: number = 5): MemoryEntry[] {
    const qTerms = tokenize(query);
    if (qTerms.length === 0 || docs.length === 0) return [...docs].slice(0, k);

    const docTerms = docs.map((d) => tokenize(documentText(d)));
    const docLen = docTerms.map((t) => t.length);
    const avgLen = docLen.reduce((a, b) => a + b, 0) / docLen.length || 1;

    const df = new Map<string, number>();
    for (const terms of docTerms) {
      const seen = new Set<string>();
      for (const t of terms) {
        if (seen.has(t)) continue;
        seen.add(t);
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }

    const N = docs.length;
    const scores: number[] = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      const terms = docTerms[i]!;
      const len = docLen[i] ?? 0;
      const tf = new Map<string, number>();
      for (const t of terms) {
        tf.set(t, (tf.get(t) ?? 0) + 1);
      }
      for (const qt of qTerms) {
        const n = tf.get(qt) ?? 0;
        if (n === 0) continue;
        const dfi = df.get(qt) ?? 1;
        const idf = Math.log(1 + (N - dfi + 0.5) / (dfi + 0.5));
        const num = n * (this.k1 + 1);
        const den = n + this.k1 * (1 - this.b + (this.b * len) / avgLen);
        scores[i]! += idf * (num / den);
      }
    }

    return docs
      .map((d, i) => ({ d, s: scores[i] ?? 0 }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => x.d);
  }
}

function documentText(d: MemoryEntry): string {
  const title = d.metadata?.title ? String(d.metadata.title) : '';
  const tags = d.metadata?.tags
    ? Array.isArray(d.metadata.tags)
      ? d.metadata.tags.join(' ')
      : String(d.metadata.tags)
    : '';
  return `${title} ${tags} ${d.content} ${d.category}`;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/g)
    .filter((t) => t.length > 1);
}
