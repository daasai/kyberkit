/**
 * Asset types and structures for the KyberKit User Asset System.
 * Sprint 2, Step 4.
 */

/** Asset type classification */
export type AssetType = 'kk_md' | 'memory' | 'skill' | 'command';

/** Asset scope — which level of the directory hierarchy it comes from */
export type AssetScope = 'user' | 'workspace' | 'project';

/** A single discovered asset entry */
export interface AssetEntry {
  /** Unique identifier: scope/type/relative-path */
  readonly id: string;
  /** Asset type */
  readonly type: AssetType;
  /** Source scope */
  readonly scope: AssetScope;
  /** Absolute filesystem path */
  readonly absolutePath: string;
  /** Relative path within the scope root */
  readonly relativePath: string;
  /** File content (lazy loaded on first access) */
  content?: string;
  /** Frontmatter metadata for memory entries */
  metadata?: Record<string, unknown>;
  /** Last modified timestamp */
  lastModified: number;
}

/** Asset directory paths configuration */
export interface AssetPaths {
  /** User-level: <cwd>/spaces/{userName}/ */
  user: string;
  /** Workspace-level: <cwd>/spaces/{userName}/workspaces/{workspaceId}/ (optional) */
  workspace?: string;
  /** Project-level: ./.kyberkit/ (optional) */
  project?: string;
}

/** Full asset manifest after scanning */
export interface AssetManifest {
  /** All discovered asset entries */
  entries: AssetEntry[];
  /** Index by type */
  byType: Map<AssetType, AssetEntry[]>;
  /** Scan timestamp */
  scannedAt: number;
}

/** File change event for watch() */
export interface AssetChangeEvent {
  type: 'added' | 'modified' | 'removed';
  entry: AssetEntry;
}

/** Query filter for asset lookup */
export interface AssetFilter {
  type?: AssetType;
  scope?: AssetScope;
  /** Glob pattern for relativePath matching */
  pattern?: string;
}
