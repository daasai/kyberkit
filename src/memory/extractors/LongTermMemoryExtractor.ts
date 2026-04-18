import type { ChatMessage, ModelProvider } from '../../types/model.js';
import type { LongTermMemory } from '../LongTermMemory.js';
import type { MarkdownMemoryStore } from '../MarkdownMemoryStore.js';
import type { MemoryEntry, MemoryCategory } from '../../types/memory.js';
import { randomUUID } from 'crypto';

export interface LongTermMemoryExtractorDeps {
  model: ModelProvider;
  compactModel?: string;
  fallbackModel: string;
  longTerm: LongTermMemory;
  /** Direct reference to the markdown store for de-duplication lookups. */
  store: MarkdownMemoryStore;
  /** Max output tokens from the extractor LLM call. Default 2048. */
  maxTokens?: number;
}

type RawLtmEntry = {
  category: 'user' | 'project' | 'reference';
  title: string;
  tags?: string[];
  body: string;
};

const SYSTEM_PROMPT = `You are a long-term memory curator.
Analyze the given conversation and identify ATOMIC pieces of durable knowledge
worth persisting across future sessions. Return a JSON array of entries:

[
  {
    "category": "user" | "project" | "reference",
    "title": "<short title, <= 60 chars>",
    "tags": ["tag1", "tag2"],
    "body": "<5-15 line Markdown explanation>"
  }
]

Rules:
- Only extract information that will REMAIN valuable beyond this session.
- Deduplicate aggressively. If unsure, OMIT rather than duplicate.
- Categories:
  * user:      personal preferences, workflow style, recurring asks
  * project:   codebase facts, architectural decisions, local conventions
  * reference: external docs/snippets cited during the conversation
- Output STRICT JSON, no prose, no code fences.`.trim();

/**
 * Sprint 4 §5.5 — LongTermMemoryExtractor.
 *
 * Scans the latest conversation via an LLM call on the `compactModel`
 * (fallback: main model) and persists any new durable knowledge into the
 * `MarkdownMemoryStore`. Runs fire-and-forget under a mutex inside
 * `MemoryTriggerMiddleware`.
 */
export class LongTermMemoryExtractor {
  constructor(private readonly deps: LongTermMemoryExtractorDeps) {}

  async extract(messages: ChatMessage[]): Promise<MemoryEntry[]> {
    if (messages.length === 0) return [];

    const existing = await this.deps.store.list();
    const existingKeys = new Set(
      existing.map((e) => `${e.category}::${e.title.toLowerCase().trim()}`),
    );

    const raw = await this.runExtraction(messages);
    if (raw.trim().length === 0) return [];

    const parsed = parseEntries(raw);
    const accepted: MemoryEntry[] = [];
    const ts = Date.now();

    for (const p of parsed) {
      const key = `${p.category}::${p.title.toLowerCase().trim()}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      const entry: MemoryEntry = {
        id: randomUUID(),
        category: p.category as MemoryCategory,
        content: p.body,
        timestamp: ts,
        metadata: { tags: p.tags },
        score: 1.0,
      };
      try {
        await this.deps.longTerm.writeEntry({
          ...entry,
          title: p.title,
          source: 'auto',
          tags: p.tags,
        });
        accepted.push(entry);
      } catch {
        // Skip individual file-write failures — other entries still land.
      }
    }
    return accepted;
  }

  private async runExtraction(messages: ChatMessage[]): Promise<string> {
    const maxTokens = this.deps.maxTokens ?? 2048;
    const primary = this.deps.compactModel ?? this.deps.fallbackModel;

    try {
      return await this.stream(primary, messages, maxTokens);
    } catch (err) {
      if (primary === this.deps.fallbackModel) throw err;
      return this.stream(this.deps.fallbackModel, messages, maxTokens);
    }
  }

  private async stream(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<string> {
    const chunks: string[] = [];
    for await (const ev of this.deps.model.chatStream({
      model,
      systemPrompt: SYSTEM_PROMPT,
      messages,
      tools: [],
      maxTokens,
    })) {
      if (ev.type === 'text_delta') chunks.push(ev.text);
    }
    return chunks.join('').trim();
  }
}

/**
 * Tolerantly parse the LLM output. Strips optional ```json fences and
 * silently drops entries that miss required fields or use invalid categories.
 */
export function parseEntries(raw: string): RawLtmEntry[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```[\s]*$/i, '')
    .trim();

  let arr: unknown;
  try {
    arr = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const valid: RawLtmEntry[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const x = item as Record<string, unknown>;
    if (typeof x.title !== 'string' || x.title.trim().length === 0) continue;
    if (typeof x.body !== 'string' || x.body.trim().length === 0) continue;
    if (x.category !== 'user' && x.category !== 'project' && x.category !== 'reference') continue;

    let tags: string[] | undefined;
    if (Array.isArray(x.tags)) {
      tags = x.tags.filter((t): t is string => typeof t === 'string');
      if (tags.length === 0) tags = undefined;
    }

    valid.push({
      category: x.category,
      title: x.title.trim().slice(0, 60),
      tags,
      body: x.body.trim(),
    });
  }
  return valid;
}
