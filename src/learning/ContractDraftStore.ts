import { mkdir, writeFile, readFile, readdir } from 'fs/promises';
import { join } from 'path';
import type { TaskPermissionContract } from '../permission/TaskPermissionContract.js';

export interface SkillChainStep {
  readonly order: number;
  readonly skillName: string;
  readonly description: string;
}

export interface DecompositionDraft {
  readonly draftId: string;
  readonly goal: string;
  readonly summary: string;
  readonly skillChain: SkillChainStep[];
  readonly contract: TaskPermissionContract;
  readonly createdAt: number;
}

/**
 * ContractDraftStore — 3.0 P0.5
 *
 * Persists DecompositionDraft objects as JSON files under
 * `<draftsDir>/<draftId>.json`. The drafts directory is auto-created on first write.
 */
export class ContractDraftStore {
  constructor(readonly draftsDir: string) {}

  async save(draft: DecompositionDraft): Promise<string> {
    await mkdir(this.draftsDir, { recursive: true });
    const path = join(this.draftsDir, `${draft.draftId}.json`);
    await writeFile(path, JSON.stringify(draft, null, 2), 'utf-8');
    return path;
  }

  async load(draftId: string): Promise<DecompositionDraft | null> {
    try {
      const raw = await readFile(join(this.draftsDir, `${draftId}.json`), 'utf-8');
      return JSON.parse(raw) as DecompositionDraft;
    } catch {
      return null;
    }
  }

  async listAll(): Promise<DecompositionDraft[]> {
    try {
      const entries = await readdir(this.draftsDir);
      const results: DecompositionDraft[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        const id = entry.slice(0, -5);
        const draft = await this.load(id);
        if (draft) results.push(draft);
      }
      return results.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }
}
