import { writeFile, readFile, rename, unlink, readdir, mkdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { Checkpoint, CheckpointProvider, CheckpointId } from '../types/checkpoint.js';

/**
 * [R2.1] JsonCheckpointProvider - Flat-file persistence for snapshots.
 * [C3]: Implements atomic "write-then-rename" pattern to ensure crash-safety.
 * Borrowed from CC's SessionMemory.save().
 */
export class JsonCheckpointProvider implements CheckpointProvider {
  constructor(private readonly baseDir: string) {}

  /** 
   * [C3]: Atomic save ensures we don't end up with partial/corrupt files 
   * if the process crashes during writing.
   */
  async save(checkpoint: Checkpoint): Promise<void> {
    const filePath = this.getFilePath(checkpoint.id);
    const tempPath = `${filePath}.tmp`;

    await mkdir(dirname(filePath), { recursive: true });

    try {
      const data = JSON.stringify(checkpoint, null, 2);
      // 1. Write to temporary file
      await writeFile(tempPath, data, 'utf-8');
      // 2. Rename to final destination (atomic on most OSes)
      await rename(tempPath, filePath);
    } catch (error) {
      // Cleanup temp if it exists
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  async restore(id: CheckpointId): Promise<Checkpoint> {
    const filePath = this.getFilePath(id);
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Checkpoint "${id}" not found.`);
      }
      throw error;
    }
  }

  async list(agentId: string): Promise<CheckpointId[]> {
    try {
      const files = await readdir(this.baseDir);
      return files
        .filter(f => f.startsWith(`${agentId}-`) && f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (e) {
      return [];
    }
  }

  async delete(id: CheckpointId): Promise<void> {
    await unlink(this.getFilePath(id)).catch(() => {});
  }

  /** Prune old checkpoints by count or age. */
  async prune(agentId: string, maxSnapshots: number, maxAgeMs: number): Promise<number> {
    const ids = await this.list(agentId);
    const stats: Array<{ id: string; mtime: number }> = [];

    for (const id of ids) {
      const s = await stat(this.getFilePath(id));
      stats.push({ id, mtime: s.mtimeMs });
    }

    // Sort by recency (newest first)
    stats.sort((a, b) => b.mtime - a.mtime);
    const now = Date.now();
    let count = 0;

    for (let i = 0; i < stats.length; i++) {
      const item = stats[i];
      const tooOld = (now - item.mtime) > maxAgeMs;
      const exceedsMax = i >= maxSnapshots;

      if (tooOld || exceedsMax) {
        await this.delete(item.id);
        count++;
      }
    }
    return count;
  }

  private getFilePath(id: CheckpointId): string {
    return join(this.baseDir, `${id}.json`);
  }
}
