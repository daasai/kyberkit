import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { AssetPaths } from '../types/assets.js';

/**
 * KKMdLoader — loads and merges KK.md files from three scope levels.
 * Merge strategy: user → workspace → project (appended in order).
 */
export class KKMdLoader {
  /**
   * Load and merge KK.md from all available scopes.
   * Returns null if no KK.md exists at any level.
   */
  async load(paths: AssetPaths): Promise<string | null> {
    const contents: string[] = [];

    const sources: Array<{ path: string | undefined; name: string }> = [
      { path: paths.user, name: 'user' },
      { path: paths.workspace, name: 'workspace' },
      { path: paths.project, name: 'project' },
    ];

    for (const src of sources) {
      if (!src.path) continue;
      const kkPath = join(src.path, 'KK.md');
      if (!existsSync(kkPath)) continue;

      try {
        const content = await readFile(kkPath, 'utf-8');
        if (content.trim()) {
          contents.push(content);
        }
      } catch {
        // Skip unreadable files
      }
    }

    return contents.length > 0 ? contents.join('\n\n---\n\n') : null;
  }
}
