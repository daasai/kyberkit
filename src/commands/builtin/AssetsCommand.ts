import type { Command, CommandResult } from '../../types/command.js';
import type { AssetEntry, AssetScope } from '../../types/assets.js';

/**
 * Sprint 3.5 §6.2 — `/assets` Command.
 *
 * Shows a grouped view of the AssetRegistry manifest (memories by scope +
 * category, skills, commands). Data comes straight from `AssetRegistry.query()`
 * — no new sources — so counts match the prompt assembler exactly.
 */
export class AssetsCommand implements Command {
  readonly name = 'assets';
  readonly description = '查看 Agent 正在变成的样子（Memories / Skills / Commands）';
  readonly subcommands = ['list'];

  constructor(private readonly getAssets: () => readonly AssetEntry[]) {}

  async execute(_args: Record<string, unknown>): Promise<CommandResult> {
    const entries = this.getAssets();
    if (entries.length === 0) {
      return {
        output: '尚未发现任何资产。首次对话后，Agent 将开始自动沉淀 Memory 与 Skill。',
        success: true,
        continueConversation: false,
      };
    }

    const memories = entries.filter(e => e.type === 'memory');
    const skills = entries.filter(e => e.type === 'skill');
    const commands = entries.filter(e => e.type === 'command');

    const lines: string[] = [];
    lines.push('┌─ 你的 Agent 正在变成 ... ───────────────────────────┐');

    lines.push('');
    lines.push(`  Memories (${memories.length})`);
    const byCategory = groupByCategory(memories);
    for (const [cat, list] of byCategory) {
      const pad = cat.padEnd(10);
      lines.push(`   ${pad}${String(list.length).padStart(2)}  ${describeCategory(cat)}`);
    }

    if (skills.length > 0) {
      lines.push('');
      lines.push(`  Skills (${skills.length})`);
      for (const s of skills) {
        const title = titleOf(s);
        lines.push(`   ✓ ${title}`);
      }
    }

    if (commands.length > 0) {
      lines.push('');
      lines.push(`  Commands (${commands.length} 自定义)`);
      const names = commands.map(c => `/${titleOf(c)}`).join('   ');
      lines.push(`   ${names}`);
    }

    lines.push('');
    lines.push('└───────────────────────────────────────────────────┘');

    return {
      output: lines.join('\n'),
      success: true,
      continueConversation: false,
    };
  }
}

function groupByCategory(memories: readonly AssetEntry[]): Map<string, AssetEntry[]> {
  const out = new Map<string, AssetEntry[]>();
  for (const m of memories) {
    const cat =
      (m.metadata?.category as string | undefined) ??
      (m.scope as AssetScope) ??
      'unknown';
    const arr = out.get(cat) ?? [];
    arr.push(m);
    out.set(cat, arr);
  }
  return out;
}

function describeCategory(cat: string): string {
  switch (cat) {
    case 'user':
      return '偏好与写作风格';
    case 'project':
      return '项目上下文与约定';
    case 'reference':
      return '外部引用片段';
    case 'workspace':
      return '工作区级';
    default:
      return '';
  }
}

function titleOf(entry: AssetEntry): string {
  const title = entry.metadata?.title as string | undefined;
  if (title && title.trim().length > 0) return title.trim();
  return entry.relativePath.replace(/^(skills|commands)\//, '').replace(/\/SKILL\.md$/, '');
}
