import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse, stringify } from 'yaml';
import type { PermissionLevel } from './PermissionPolicy.js';

/**
 * Sprint 3.5 §4.2 — Grant scope decided by the user in the batch auth card.
 */
export type PermitScope = 'task' | 'session' | 'persistent';

/**
 * A single grant record. Matches tool calls whose classification level is at
 * or below `maxLevel` AND whose `toolName` matches `toolName` (or "*" for any).
 *
 * Optional `taskId` narrows the grant to a single task (for "本次任务" scope).
 */
export interface PermitGrant {
  readonly scope: PermitScope;
  readonly toolName: string | '*';
  readonly maxLevel: PermissionLevel;
  readonly taskId?: string;
  readonly grantedAt: number;
  readonly reason?: string;
}

/** Snapshot of all grants — used by /permit command and IdentityBand. */
export interface PermitSnapshot {
  readonly taskGrants: readonly PermitGrant[];
  readonly sessionGrants: readonly PermitGrant[];
  readonly persistentGrants: readonly PermitGrant[];
}

const LEVEL_ORDER: Record<PermissionLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };

/**
 * In-memory grant store.
 *
 * Sprint 3.5 Step 2 delivers task + session scope in memory; persistent scope
 * accepts programmatic add (for KK.md / permit.yaml loading in a later Step)
 * but does not yet auto-load from disk.
 */
export interface PermitStoreOptions {
  /** Fires after a non-load-time persistent grant is added (for analytics / bus). */
  onPersistentChanged?: (g: PermitGrant) => void;
}

type YamlFile = { version: number; grants: Array<{ toolName: string; maxLevel: PermissionLevel; grantedAt: number; reason?: string }> };

export class PermitStore {
  private taskGrants: PermitGrant[] = [];
  private sessionGrants: PermitGrant[] = [];
  private persistentGrants: PermitGrant[] = [];
  private currentTaskId: string | null = null;
  private persistPath: string | null = null;
  private duringDiskLoad = false;
  private readonly onPersistentChanged?: (g: PermitGrant) => void;

  constructor(options?: PermitStoreOptions) {
    this.onPersistentChanged = options?.onPersistentChanged;
  }

  /**
   * Record a new grant. For task scope, pins the grant to the current task id
   * (if any) so that `onTaskComplete` can evict it.
   */
  addGrant(grant: Omit<PermitGrant, 'grantedAt'>): void {
    const g: PermitGrant = {
      ...grant,
      grantedAt: Date.now(),
      taskId: grant.scope === 'task' ? (grant.taskId ?? this.currentTaskId ?? undefined) : undefined,
    };
    if (g.scope === 'task') this.taskGrants.push(g);
    else if (g.scope === 'session') this.sessionGrants.push(g);
    else {
      this.persistentGrants.push(g);
      this.persistGrantSideEffects(g);
    }
  }

  private persistGrantSideEffects(g: PermitGrant): void {
    if (g.scope !== 'persistent' || this.duringDiskLoad) return;
    this.saveToDisk();
    this.onPersistentChanged?.(g);
  }

  /** Set `.kyberkit/permit.yaml` path and (optionally) load existing grants. */
  setPersistencePath(absolutePath: string): void {
    this.persistPath = absolutePath;
  }

  /** Merge YAML persistent grants into memory. Does not clear existing. */
  loadFromDisk(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    this.duringDiskLoad = true;
    this.persistentGrants = [];
    try {
      const raw = readFileSync(this.persistPath, 'utf-8');
      const doc = parse(raw) as YamlFile;
      if (!doc?.grants || !Array.isArray(doc.grants)) return;
      for (const row of doc.grants) {
        if (!row?.toolName || !row.maxLevel) continue;
        this.persistentGrants.push({
          scope: 'persistent',
          toolName: row.toolName,
          maxLevel: row.maxLevel,
          grantedAt: typeof row.grantedAt === 'number' ? row.grantedAt : Date.now(),
          reason: row.reason,
        });
      }
    } finally {
      this.duringDiskLoad = false;
    }
  }

  saveToDisk(): void {
    if (!this.persistPath) return;
    mkdirSync(dirname(this.persistPath), { recursive: true });
    const doc: YamlFile = {
      version: 1,
      grants: this.persistentGrants.map((g) => ({
        toolName: g.toolName,
        maxLevel: g.maxLevel,
        grantedAt: g.grantedAt,
        reason: g.reason,
      })),
    };
    writeFileSync(this.persistPath, stringify(doc), 'utf-8');
  }

  /** Remove a persistent grant by tool name. Returns true if a row was removed. */
  revokePersistent(toolName: string): boolean {
    const before = this.persistentGrants.length;
    this.persistentGrants = this.persistentGrants.filter(
      (g) => g.toolName !== toolName,
    );
    if (this.persistentGrants.length < before) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  /** Called by the permission middleware each time a TaskPlanEvent.taskId is observed. */
  setCurrentTask(taskId: string | null): void {
    if (this.currentTaskId !== null && taskId !== null && this.currentTaskId !== taskId) {
      this.evictTaskGrants();
    }
    this.currentTaskId = taskId;
  }

  /** Called when NarratorMiddleware emits `task_complete`. */
  onTaskComplete(taskId: string): void {
    this.taskGrants = this.taskGrants.filter((g) => g.taskId !== taskId);
    if (this.currentTaskId === taskId) this.currentTaskId = null;
  }

  getCurrentTaskId(): string | null {
    return this.currentTaskId;
  }

  private evictTaskGrants(): void {
    if (this.currentTaskId === null) return;
    const tid = this.currentTaskId;
    this.taskGrants = this.taskGrants.filter((g) => g.taskId !== tid);
  }

  /**
   * Check whether a classified call is already permitted by any active grant.
   * Returns the granting scope (to help audit / UI messaging) or null.
   */
  check(toolName: string, level: PermissionLevel): PermitScope | null {
    const match = (g: PermitGrant) =>
      (g.toolName === '*' || g.toolName === toolName) &&
      LEVEL_ORDER[level] <= LEVEL_ORDER[g.maxLevel] &&
      (g.scope !== 'task' || g.taskId === undefined || g.taskId === this.currentTaskId);

    if (this.taskGrants.some(match)) return 'task';
    if (this.sessionGrants.some(match)) return 'session';
    if (this.persistentGrants.some(match)) return 'persistent';
    return null;
  }

  /** Clear every grant in the given scope (e.g. `/permit clear task`). */
  clearScope(scope: PermitScope): number {
    const prev =
      scope === 'task'
        ? this.taskGrants.length
        : scope === 'session'
          ? this.sessionGrants.length
          : this.persistentGrants.length;
    if (scope === 'task') this.taskGrants = [];
    else if (scope === 'session') this.sessionGrants = [];
    else {
      this.persistentGrants = [];
      this.saveToDisk();
    }
    return prev;
  }

  snapshot(): PermitSnapshot {
    return {
      taskGrants: [...this.taskGrants],
      sessionGrants: [...this.sessionGrants],
      persistentGrants: [...this.persistentGrants],
    };
  }

  /**
   * High-level "mode label" for IdentityBand. Returns:
   *   - "持久" when any persistent grants exist
   *   - "会话" when session-scope grants active
   *   - "任务" when task-scope grants active
   *   - "严格" otherwise
   */
  modeLabel(): string {
    if (this.persistentGrants.length > 0) return '持久';
    if (this.sessionGrants.length > 0) return '会话';
    if (this.taskGrants.length > 0) return '任务';
    return '严格';
  }
}
