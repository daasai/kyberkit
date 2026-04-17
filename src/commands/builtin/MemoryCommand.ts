import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * MemoryCommand — lists memories discovered by the AssetRegistry.
 * Sprint 2, Step 6.
 */
export class MemoryCommand implements Command {
  readonly name = 'memory';
  readonly description = 'Manage user memories';
  readonly subcommands = ['list'];

  constructor(private readonly getMemories: () => import('../../types/assets.js').AssetEntry[]) {}

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const raw = (args._raw as string) || '';
    
    if (raw.startsWith('list') || raw === '') {
      const memories = this.getMemories();
      if (memories.length === 0) return { output: 'No memories found.', success: true, continueConversation: false };

      const lines = ['# Discovered Memories', ''];
      for (const m of memories) {
        lines.push(`- [${m.scope}] **${m.id}** (${m.absolutePath})`);
      }
      return { output: lines.join('\n'), success: true, continueConversation: false };
    }

    return { 
      output: 'Usage: /memory list', 
      success: false, 
      continueConversation: false 
    };
  }
}
