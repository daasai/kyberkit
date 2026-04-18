import matter from 'gray-matter';
import { writeFile, readFile, mkdir, rename, unlink, readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { MemoryCategory } from '../types/memory.js';

/**
 * A single memory file under `.kyberkit/memories/<category>/<slug>.md`.
 */
export interface MarkdownMemoryFile {
  id: string;
  category: MemoryCategory;
  title: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  source: 'auto' | 'manual';
  score?: number;
  body: string;
  /** Absolute filesystem path (runtime-populated). */
  path: string;
}

/**
 * Sprint 4 §5.3 — Markdown-backed memory store.
 *
 * Replaces the Sprint 1 SQLite backend for long-term memory. Each memory is
 * a single `.md` file with YAML frontmatter, grouped by `category` sub-dir.
 * An auto-generated `MEMORY.md` index lives at the root for human browsing.
 */
export class MarkdownMemoryStore {
  constructor(
    private readonly rootDir: string,
    private readonly eventBus: TypedEventBus<KyberEvents>,
  ) {}

  /**
   * Create or update a memory file.
   *
   * If an existing file with the same `id` exists under any category, it is
   * removed first (so renamed titles do not leave orphans).
   */
  async write(entry: Omit<MarkdownMemoryFile, 'path'>): Promise<MarkdownMemoryFile> {
    await this.removeById(entry.id, { quiet: true });

    const catDir = join(this.rootDir, entry.category);
    await mkdir(catDir, { recursive: true });

    const fileName = `${slug(entry.title)}-${entry.id.slice(0, 8)}.md`;
    const path = join(catDir, fileName);

    const fm = stripUndefined({
      id: entry.id,
      category: entry.category,
      title: entry.title,
      tags: entry.tags,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      source: entry.source,
      score: entry.score ?? 1.0,
    });
    const md = matter.stringify(entry.body, fm);

    const tmp = `${path}.tmp`;
    await writeFile(tmp, md, 'utf-8');
    await rename(tmp, path);

    await this.refreshIndex();
    this.eventBus.emit('memory.written', { tierId: 'L3', entryId: entry.id });

    return { ...entry, path };
  }

  /** Return every memory file under `rootDir` (one level of sub-dirs). */
  async list(): Promise<MarkdownMemoryFile[]> {
    if (!existsSync(this.rootDir)) return [];
    const out: MarkdownMemoryFile[] = [];

    let categories: string[];
    try {
      categories = await readdir(this.rootDir);
    } catch {
      return [];
    }

    for (const cat of categories) {
      const dir = join(this.rootDir, cat);
      try {
        const s = await stat(dir);
        if (!s.isDirectory()) continue;
      } catch {
        continue;
      }

      let files: string[];
      try {
        files = await readdir(dir);
      } catch {
        continue;
      }

      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        if (f === 'MEMORY.md') continue;
        const full = join(dir, f);
        try {
          const parsed = matter(await readFile(full, 'utf-8'));
          out.push({
            id: parsed.data.id ?? `${cat}-${f.replace(/\.md$/, '')}`,
            category: (parsed.data.category ?? cat) as MemoryCategory,
            title: parsed.data.title ?? f.replace(/\.md$/, ''),
            tags: parsed.data.tags,
            createdAt: parsed.data.createdAt ?? new Date(0).toISOString(),
            updatedAt: parsed.data.updatedAt ?? new Date(0).toISOString(),
            source: (parsed.data.source ?? 'manual') as 'auto' | 'manual',
            score: parsed.data.score,
            body: parsed.content.trim(),
            path: full,
          });
        } catch {
          // Skip unreadable / malformed files.
        }
      }
    }
    return out;
  }

  /** Most recently updated entries in a given category. */
  async findByCategory(category: MemoryCategory, limit = 20): Promise<MarkdownMemoryFile[]> {
    const all = await this.list();
    return all
      .filter((m) => m.category === category)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  /** Simple case-insensitive substring search over title + body. */
  async search(query: string, limit = 10): Promise<MarkdownMemoryFile[]> {
    const q = query.toLowerCase();
    if (q.length === 0) return [];
    const all = await this.list();
    return all
      .filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q),
      )
      .sort((a, b) => (b.score ?? 1) - (a.score ?? 1))
      .slice(0, limit);
  }

  /** Remove a memory by id. Returns true when something was removed. */
  async remove(id: string): Promise<boolean> {
    return this.removeById(id, { quiet: false });
  }

  /**
   * Evict memories older than `maxAgeMs` (by `updatedAt`), or beyond
   * `maxEntries` keeping the most recent.
   */
  async prune(maxAgeMs: number, maxEntries: number): Promise<number> {
    const all = await this.list();
    const now = Date.now();
    const toDelete = new Set<string>();

    for (const m of all) {
      const ts = Date.parse(m.updatedAt);
      if (!Number.isNaN(ts) && now - ts > maxAgeMs) toDelete.add(m.id);
    }

    const kept = all
      .filter((m) => !toDelete.has(m.id))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const m of kept.slice(maxEntries)) toDelete.add(m.id);

    let removed = 0;
    for (const id of toDelete) {
      if (await this.removeById(id, { quiet: true })) removed++;
    }
    if (removed > 0) {
      this.eventBus.emit('memory.evicted', {
        tierId: 'L3',
        count: removed,
        policy: 'composite_ttl_lru',
      });
      await this.refreshIndex();
    }
    return removed;
  }

  /** Rewrite `MEMORY.md` with a grouped listing of all memories. */
  async refreshIndex(): Promise<void> {
    if (!existsSync(this.rootDir)) {
      await mkdir(this.rootDir, { recursive: true });
    }
    const all = await this.list();
    const byCat = new Map<string, MarkdownMemoryFile[]>();
    for (const m of all) {
      const bucket = byCat.get(m.category) ?? [];
      bucket.push(m);
      byCat.set(m.category, bucket);
    }

    const lines: string[] = [
      '# Memory Index',
      '',
      `_Auto-generated — ${new Date().toISOString()}_`,
      '',
    ];
    const sortedCats = Array.from(byCat.keys()).sort();
    for (const cat of sortedCats) {
      const list = (byCat.get(cat) ?? []).sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
      lines.push(`## ${cat} (${list.length})`);
      lines.push('');
      for (const m of list) {
        const tags = m.tags?.length ? ` \`${m.tags.join('`, `')}\`` : '';
        lines.push(`- [${m.title}](${cat}/${basename(m.path)})${tags}`);
      }
      lines.push('');
    }

    const indexPath = join(this.rootDir, 'MEMORY.md');
    await mkdir(dirname(indexPath), { recursive: true });
    await writeFile(indexPath, lines.join('\n'), 'utf-8');
  }

  private async removeById(id: string, opts: { quiet: boolean }): Promise<boolean> {
    const all = await this.list();
    const target = all.find((m) => m.id === id);
    if (!target) return false;
    try {
      await unlink(target.path);
    } catch {
      return false;
    }
    if (!opts.quiet) {
      await this.refreshIndex();
    }
    return true;
  }
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Build a URL-safe slug from a title. */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'memory';
}
