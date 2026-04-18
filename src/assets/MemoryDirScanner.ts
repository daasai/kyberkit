import matter from 'gray-matter';
import { readFile } from 'fs/promises';
import { readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Parsed memory file entry with frontmatter metadata.
 */
export interface MemoryFileEntry {
  /** Absolute file path */
  path: string;
  /** Filesystem mtime in milliseconds */
  lastModified: number;
  /** Parsed frontmatter metadata */
  metadata: {
    title?: string;
    category?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
    source?: 'auto' | 'manual';
  };
  /** Markdown body (content after frontmatter) */
  body: string;
}

/**
 * MemoryDirScanner — scans a memories/ directory and parses YAML frontmatter
 * from `.md` files using `gray-matter`.
 *
 * Sprint 4: additionally descends into single-level `<category>/` sub-dirs
 * (e.g. `user/`, `project/`, `reference/`) so the new Markdown memory store
 * layout is picked up by the AssetRegistry. Pre-Sprint-4 flat layouts keep
 * working unchanged.
 */
export class MemoryDirScanner {
  /**
   * Scan a directory for `.md` memory files, recursing one level into any
   * sub-directory. Excludes `MEMORY.md` (the auto-generated index).
   */
  async scan(dirPath: string): Promise<MemoryFileEntry[]> {
    if (!existsSync(dirPath)) return [];

    const results: MemoryFileEntry[] = [];
    results.push(...(await this.scanFlat(dirPath)));

    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return results;
    }

    for (const entry of entries) {
      const sub = join(dirPath, entry);
      try {
        const s = statSync(sub);
        if (!s.isDirectory()) continue;
      } catch {
        continue;
      }

      const subEntries = await this.scanFlat(sub);
      for (const e of subEntries) {
        if (!e.metadata.category) {
          e.metadata.category = entry;
        }
      }
      results.push(...subEntries);
    }
    return results;
  }

  /** Scan a single directory (no recursion) for `.md` memory files. */
  private async scanFlat(dirPath: string): Promise<MemoryFileEntry[]> {
    if (!existsSync(dirPath)) return [];

    const results: MemoryFileEntry[] = [];
    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      return results;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      if (entry === 'MEMORY.md') continue;

      const filePath = join(dirPath, entry);
      let lastModified = 0;
      try {
        const stat = statSync(filePath);
        if (!stat.isFile()) continue;
        lastModified = stat.mtimeMs;
      } catch {
        continue;
      }

      try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = matter(raw);
        results.push({
          path: filePath,
          lastModified,
          metadata: {
            title: parsed.data.title,
            category: parsed.data.category,
            tags: parsed.data.tags,
            createdAt: parsed.data.createdAt,
            updatedAt: parsed.data.updatedAt,
            source: parsed.data.source,
          },
          body: parsed.content,
        });
      } catch {
        // Skip files that fail to parse
      }
    }
    return results;
  }
}
