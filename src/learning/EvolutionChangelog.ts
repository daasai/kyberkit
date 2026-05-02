import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export interface EvolutionEntry {
  readonly taskId: string;
  readonly mission: string;
  readonly toolCalls: number;
  /** Breakdown of tool names → call counts, e.g. { read_file: 4, bash: 2 } */
  readonly toolBreakdown: Readonly<Record<string, number>>;
  readonly rollbackCheckpointId?: string;
  readonly timestamp: number;
}

/**
 * EvolutionChangelog — 3.0 P0.5
 *
 * Appends human-readable Markdown entries to an evolution changelog file.
 * File is auto-created on first write; entries are appended in reverse-chronological
 * order (newest at the top is added by prepending the header block, while
 * subsequent entries are appended; simplest strategy without full file rewrite).
 *
 * Format per entry:
 * ```
 * ## 2026-05-02T13:38:00+08:00
 * **任务**: 构建用户认证模块 (`task-abc`)
 * **工具调用**: 12 次 (read_file ×4, write_file ×5, bash ×3)
 * **回滚点**: `checkpoint-xyz`
 * ---
 * ```
 */
export class EvolutionChangelog {
  constructor(readonly path: string) {}

  async appendEntry(entry: EvolutionEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });

    const ts = new Date(entry.timestamp).toISOString();
    const breakdown = Object.entries(entry.toolBreakdown)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name} ×${count}`)
      .join(', ');
    const rollback = entry.rollbackCheckpointId
      ? `\n**回滚点**: \`${entry.rollbackCheckpointId}\``
      : '';

    const block =
      `## ${ts}\n\n` +
      `**任务**: ${entry.mission} (\`${entry.taskId}\`)  \n` +
      `**工具调用**: ${entry.toolCalls} 次${breakdown ? ` (${breakdown})` : ''}${rollback}\n\n` +
      `---\n\n`;

    await appendFile(this.path, block, 'utf-8');
  }
}
