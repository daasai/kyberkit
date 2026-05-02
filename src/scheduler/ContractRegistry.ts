/**
 * ContractRegistry — 3.0 P1
 *
 * Runtime lifecycle manager for all active TaskPermissionContracts.
 * Handles state transitions, persists to JSON, and emits lifecycle events.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TypedEventBus } from '../observability/TypedEventBus.js';
import type { KyberEvents } from '../types/events.js';
import {
  type ContractStatus,
  type ContractType,
  type TaskPermissionContract,
  TaskPermissionContractSchema,
} from '../permission/TaskPermissionContract.js';

export interface ContractFilter {
  readonly contractType?: ContractType;
  readonly status?: ContractStatus;
}

export interface ContractRegistryDeps {
  readonly registryPath: string;
  readonly eventBus: TypedEventBus<KyberEvents>;
}

export class ContractRegistry {
  private readonly contracts = new Map<string, TaskPermissionContract>();
  private saveScheduled = false;

  constructor(private readonly deps: ContractRegistryDeps) {}

  /** Load persisted contracts from disk. Call once on startup. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.deps.registryPath, 'utf-8');
      const records = JSON.parse(raw) as unknown[];
      for (const record of records) {
        try {
          const contract = TaskPermissionContractSchema.parse(record);
          this.contracts.set(contract.taskId, contract);
        } catch {
          // Skip malformed entries silently; they may come from an older schema version
        }
      }
    } catch {
      // File not found or unreadable — start empty
    }
  }

  /** Activate a contract (draft → active or paused → active). */
  activate(contract: TaskPermissionContract): void {
    const updated: TaskPermissionContract = { ...contract, status: 'active', updatedAt: Date.now() };
    this.contracts.set(updated.taskId, updated);
    this.scheduleSave();
    this.deps.eventBus.emit('contract.activated', {
      contractId: updated.taskId,
      contractType: updated.contractType as 'ad_hoc' | 'recurring' | 'triggered',
    });
  }

  /** Pause an active contract. */
  pause(contractId: string, reason: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== 'active') return;
    const updated: TaskPermissionContract = { ...contract, status: 'paused', updatedAt: Date.now() };
    this.contracts.set(contractId, updated);
    this.scheduleSave();
    this.deps.eventBus.emit('contract.paused', { contractId, reason });
  }

  /** Revoke a contract permanently. */
  revoke(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract) return;
    const updated: TaskPermissionContract = { ...contract, status: 'revoked', updatedAt: Date.now() };
    this.contracts.set(contractId, updated);
    this.scheduleSave();
    this.deps.eventBus.emit('contract.revoked', { contractId });
  }

  /** Mark a contract as expired (typically called by RecurringScheduler). */
  expire(contractId: string): void {
    const contract = this.contracts.get(contractId);
    if (!contract || contract.status !== 'active') return;
    const updated: TaskPermissionContract = { ...contract, status: 'expired', updatedAt: Date.now() };
    this.contracts.set(contractId, updated);
    this.scheduleSave();
    this.deps.eventBus.emit('contract.expired', { contractId });
  }

  get(contractId: string): TaskPermissionContract | undefined {
    return this.contracts.get(contractId);
  }

  list(filter?: ContractFilter): TaskPermissionContract[] {
    const all = Array.from(this.contracts.values());
    return all.filter((c) => {
      if (filter?.contractType && c.contractType !== filter.contractType) return false;
      if (filter?.status && c.status !== filter.status) return false;
      return true;
    });
  }

  /** Persist state to disk immediately. */
  async save(): Promise<void> {
    const dir = dirname(this.deps.registryPath);
    await mkdir(dir, { recursive: true });
    const records = Array.from(this.contracts.values());
    await writeFile(this.deps.registryPath, JSON.stringify(records, null, 2), 'utf-8');
  }

  /** Flush on next microtask (deduplicates multiple rapid changes). */
  private scheduleSave(): void {
    if (this.saveScheduled) return;
    this.saveScheduled = true;
    Promise.resolve().then(async () => {
      this.saveScheduled = false;
      await this.save().catch(() => undefined);
    });
  }
}
