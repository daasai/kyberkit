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
 * MemoryDirScanner — scans a memories/ directory and parses
 * YAML frontmatter from .md files using gray-matter.
 */
export class MemoryDirScanner {
  /**
   * Scan a directory for .md memory files.
   * Excludes MEMORY.md (the index file).
   */
  async scan(dirPath: string): Promise<MemoryFileEntry[]> {
    if (!existsSync(dirPath)) return [];

    const results: MemoryFileEntry[] = [];
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue;
      if (entry === 'MEMORY.md') continue;

      const filePath = join(dirPath, entry);
      const stat = statSync(filePath);
      if (!stat.isFile()) continue;

      try {
        const raw = await readFile(filePath, 'utf-8');
        const parsed = matter(raw);

        results.push({
          path: filePath,
          lastModified: stat.mtimeMs,
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
