import type { Command, CommandResult } from '../../types/command.js';
import type { AssetEntry } from '../../types/assets.js';
import type { LongTermMemory } from '../../memory/LongTermMemory.js';
import { randomUUID } from 'crypto';

/**
 * `/memory` — list, add, or remove long-term memories.
 *
 * Sprint 2 shipped `list`. Sprint 4 adds `add` / `remove` backed by
 * `LongTermMemory` (Markdown store). When a runtime does not provide a
 * long-term memory instance (e.g. pure asset-registry scenarios), only
 * `list` is available.
 */
export class MemoryCommand implements Command {
  readonly name = 'memory';
  readonly description = 'List, add, or remove long-term memories';
  readonly subcommands = ['list', 'add', 'remove'];

  constructor(
    private readonly getMemories: () => AssetEntry[],
    private readonly getLongTerm?: () => LongTermMemory | undefined,
  ) {}

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const raw = ((args._raw as string) || '').trim();

    if (raw.startsWith('add ') || raw === 'add') {
      return this.executeAdd(raw.slice('add'.length).trim());
    }

    if (raw.startsWith('remove ') || raw === 'remove') {
      return this.executeRemove(raw.slice('remove'.length).trim());
    }

    if (raw.startsWith('list') || raw === '') {
      return this.executeList();
    }

    return this.usage();
  }

  private executeList(): CommandResult {
    const memories = this.getMemories();
    if (memories.length === 0) {
      return { output: 'No memories found.', success: true, continueConversation: false };
    }

    const lines = ['# Discovered Memories', ''];
    for (const m of memories) {
      const title = (m.metadata?.title as string | undefined) ?? m.id;
      const cat = (m.metadata?.category as string | undefined) ?? 'unknown';
      lines.push(`- [${m.scope}] **${title}** _(${cat})_ — \`${m.absolutePath}\``);
    }
    return { output: lines.join('\n'), success: true, continueConversation: false };
  }

  private async executeAdd(body: string): Promise<CommandResult> {
    const lt = this.getLongTerm?.();
    if (!lt) {
      return {
        output: 'Long-term memory is not available in this session.',
        success: false,
        continueConversation: false,
      };
    }
    if (body.length === 0) {
      return {
        output: 'Usage: /memory add <text>',
        success: false,
        continueConversation: false,
      };
    }

    const title = body.split('\n')[0].trim().slice(0, 60) || 'memory';
    const id = randomUUID();
    await lt.writeEntry({
      id,
      category: 'user',
      content: body,
      timestamp: Date.now(),
      title,
      source: 'manual',
    });

    return {
      output: `Saved memory "${title}" to .kyberkit/memories/user/ (${id.slice(0, 8)}).`,
      success: true,
      continueConversation: false,
    };
  }

  private async executeRemove(idOrTitle: string): Promise<CommandResult> {
    const lt = this.getLongTerm?.();
    if (!lt) {
      return {
        output: 'Long-term memory is not available in this session.',
        success: false,
        continueConversation: false,
      };
    }
    if (idOrTitle.length === 0) {
      return {
        output: 'Usage: /memory remove <id-prefix-or-title>',
        success: false,
        continueConversation: false,
      };
    }

    const all = await lt.list();
    const query = idOrTitle.toLowerCase();
    const target = all.find((m) => m.id.startsWith(idOrTitle))
      ?? all.find((m) => (m.metadata?.title as string | undefined)?.toLowerCase() === query);

    if (!target) {
      return {
        output: `No memory matches "${idOrTitle}".`,
        success: false,
        continueConversation: false,
      };
    }

    const removed = await lt.remove(target.id);
    if (!removed) {
      return {
        output: `Failed to remove memory ${target.id.slice(0, 8)}.`,
        success: false,
        continueConversation: false,
      };
    }

    const title = (target.metadata?.title as string | undefined) ?? target.id;
    return {
      output: `Removed memory "${title}" (${target.id.slice(0, 8)}).`,
      success: true,
      continueConversation: false,
    };
  }

  private usage(): CommandResult {
    return {
      output: 'Usage: /memory [list|add <text>|remove <id-or-title>]',
      success: false,
      continueConversation: false,
    };
  }
}
