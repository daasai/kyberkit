import type { 
  AssetPaths, 
  AssetManifest, 
  AssetEntry, 
  AssetFilter, 
  AssetChangeEvent, 
  AssetType, 
  AssetScope 
} from '../types/assets.js';
import type { Disposable } from '../types/common.js';
import { KKMdLoader } from './KKMdLoader.js';
import { MemoryDirScanner } from './MemoryDirScanner.js';
import { join, relative } from 'path';
import { existsSync, readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'fs';

/**
 * Interface for AssetRegistry.
 */
export interface AssetRegistry {
  scan(paths: AssetPaths): Promise<AssetManifest>;
  watch(paths: AssetPaths, onChange: (event: AssetChangeEvent) => void): Disposable;
  query(filter: AssetFilter): AssetEntry[];
  getMergedKKMd(): string | null;
  getMemories(): AssetEntry[];
  getManifest(): AssetManifest | null;
}

/**
 * Default implementation of AssetRegistry.
 */
export class DefaultAssetRegistry implements AssetRegistry {
  private manifest: AssetManifest | null = null;
  private readonly kkLoader = new KKMdLoader();
  private readonly memoryScanner = new MemoryDirScanner();
  private mergedKKMd: string | null = null;

  async scan(paths: AssetPaths): Promise<AssetManifest> {
    const entries: AssetEntry[] = [];

    const scopes: Array<{ scope: AssetScope; root: string | undefined }> = [
      { scope: 'user', root: paths.user },
      { scope: 'workspace', root: paths.workspace },
      { scope: 'project', root: paths.project }
    ];

    for (const { scope, root } of scopes) {
      if (root && existsSync(root)) {
        const scopeEntries = await this.scanScope(root, scope);
        entries.push(...scopeEntries);
      }
    }

    this.mergedKKMd = await this.kkLoader.load(paths);

    const byType = new Map<AssetType, AssetEntry[]>();
    for (const entry of entries) {
      const typeList = byType.get(entry.type) || [];
      typeList.push(entry);
      byType.set(entry.type, typeList);
    }

    this.manifest = {
      entries,
      byType,
      scannedAt: Date.now()
    };

    return this.manifest;
  }

  private async scanScope(root: string, scope: AssetScope): Promise<AssetEntry[]> {
    const entries: AssetEntry[] = [];

    // KK.md
    const kkPath = join(root, 'KK.md');
    if (existsSync(kkPath)) {
      const kkEntry = this.createAssetEntry(root, scope, kkPath, 'kk_md');
      if (kkEntry) entries.push(kkEntry);
    }

    // Memories
    const memoriesDir = join(root, 'memories');
    if (existsSync(memoriesDir)) {
      const memoryFiles = await this.memoryScanner.scan(memoriesDir);
      for (const mf of memoryFiles) {
        entries.push({
          id: `${scope}/memory/${relative(memoriesDir, mf.path)}`,
          type: 'memory',
          scope,
          absolutePath: mf.path,
          relativePath: `memories/${relative(memoriesDir, mf.path)}`,
          content: mf.body,
          metadata: mf.metadata,
          lastModified: mf.lastModified
        });
      }
    }

    const skillsDir = join(root, 'skills');
    entries.push(...this.scanDirectoryAssets(root, scope, skillsDir, path =>
      path.endsWith('/SKILL.md') || path === 'SKILL.md' ? 'skill' : null
    ));

    const commandsDir = join(root, 'commands');
    entries.push(...this.scanDirectoryAssets(root, scope, commandsDir, path =>
      path.startsWith('commands/') ? 'command' : null
    ));

    return entries;
  }

  watch(paths: AssetPaths, onChange: (event: AssetChangeEvent) => void): Disposable {
    const watchers: FSWatcher[] = [];
    const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const DEBOUNCE_MS = 50;

    const scopedRoots: Array<{ root: string; scope: AssetScope }> = [
      { root: paths.user, scope: 'user' },
      ...(paths.workspace ? [{ root: paths.workspace, scope: 'workspace' as const }] : []),
      ...(paths.project ? [{ root: paths.project, scope: 'project' as const }] : []),
    ];

    for (const { root, scope } of scopedRoots) {
      if (existsSync(root)) {
        const watcher = watch(root, { recursive: true }, (eventType, filename) => {
          if (!filename) return;

          const relativePath = filename.toString().replaceAll('\\', '/');
          const absolutePath = join(root, relativePath);
          const assetType = this.detectAssetType(relativePath);
          if (!assetType) return;

          // Debounce: collapse rapid successive events for the same path
          const existing = debounceTimers.get(absolutePath);
          if (existing) clearTimeout(existing);

          const timer = setTimeout(() => {
            debounceTimers.delete(absolutePath);
            const exists = existsSync(absolutePath);
            const event: AssetChangeEvent = {
              type: eventType === 'change' ? 'modified' : exists ? 'added' : 'removed',
              entry: this.createWatchedAssetEntry(root, scope, absolutePath, relativePath, assetType, exists),
            };
            onChange(event);
          }, DEBOUNCE_MS);

          debounceTimers.set(absolutePath, timer);
        });
        watchers.push(watcher);
      }
    }

    return {
      dispose: () => {
        watchers.forEach(w => w.close());
        debounceTimers.forEach(t => clearTimeout(t));
        debounceTimers.clear();
      }
    };
  }

  query(filter: AssetFilter): AssetEntry[] {
    if (!this.manifest) return [];
    
    return this.manifest.entries.filter(e => {
      if (filter.type && e.type !== filter.type) return false;
      if (filter.scope && e.scope !== filter.scope) return false;
      // pattern matching logic if needed
      return true;
    });
  }

  getMergedKKMd(): string | null {
    return this.mergedKKMd;
  }

  getMemories(): AssetEntry[] {
    return this.query({ type: 'memory' });
  }

  getManifest(): AssetManifest | null {
    return this.manifest;
  }

  private scanDirectoryAssets(
    root: string,
    scope: AssetScope,
    directory: string,
    classify: (relativePath: string) => AssetType | null
  ): AssetEntry[] {
    if (!existsSync(directory)) return [];

    const entries: AssetEntry[] = [];
    for (const absolutePath of this.walkFiles(directory)) {
      const relativePath = relative(root, absolutePath).replaceAll('\\', '/');
      const assetType = classify(relativePath);
      if (!assetType) continue;

      const entry = this.createAssetEntry(root, scope, absolutePath, assetType);
      if (entry) entries.push(entry);
    }

    return entries;
  }

  private walkFiles(directory: string): string[] {
    const files: string[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.walkFiles(absolutePath));
        continue;
      }

      if (entry.isFile()) {
        files.push(absolutePath);
      }
    }

    return files;
  }

  private detectAssetType(relativePath: string): AssetType | null {
    if (relativePath === 'KK.md') return 'kk_md';
    if (relativePath.startsWith('memories/') && relativePath.endsWith('.md') && !relativePath.endsWith('MEMORY.md')) {
      return 'memory';
    }
    if (relativePath === 'SKILL.md' || relativePath.endsWith('/SKILL.md')) return 'skill';
    if (relativePath.startsWith('commands/')) return 'command';
    return null;
  }

  private createAssetEntry(
    root: string,
    scope: AssetScope,
    absolutePath: string,
    type: AssetType
  ): AssetEntry | null {
    if (!existsSync(absolutePath)) return null;

    const relativePath = relative(root, absolutePath).replaceAll('\\', '/');
    const stat = statSync(absolutePath);
    const entry: AssetEntry = {
      id: `${scope}/${type}/${relativePath}`,
      type,
      scope,
      absolutePath,
      relativePath,
      lastModified: stat.mtimeMs,
    };

    if (type === 'command' || type === 'skill') {
      entry.content = readFileSync(absolutePath, 'utf-8');
    }

    return entry;
  }

  private createWatchedAssetEntry(
    root: string,
    scope: AssetScope,
    absolutePath: string,
    relativePath: string,
    type: AssetType,
    exists: boolean
  ): AssetEntry {
    if (!exists) {
      return {
        id: `${scope}/${type}/${relativePath}`,
        type,
        scope,
        absolutePath,
        relativePath,
        lastModified: 0,
      };
    }

    return this.createAssetEntry(root, scope, absolutePath, type) ?? {
      id: `${scope}/${type}/${relativePath}`,
      type,
      scope,
      absolutePath,
      relativePath,
      lastModified: 0,
    };
  }
}
