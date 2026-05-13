import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * CompactCommand — manual context compression trigger.
 * If no runtime compactor is injected, returns a helpful fallback message.
 */
export class CompactCommand implements Command {
  readonly name = 'compact';
  readonly description = 'Compress conversation context and show token savings';

  constructor(
    private readonly compactNow?: () => Promise<{
      strategy: string;
      tokensBefore: number;
      tokensAfter: number;
      summaryLength?: number;
    } | null>,
  ) {}

  async execute(_args: Record<string, unknown>, _context: CommandContext): Promise<CommandResult> {
    if (!this.compactNow) {
      return {
        output: 'Compaction is enabled for auto-guard mode. Manual /compact binding is not attached in this surface yet.',
        success: true,
        continueConversation: false,
      };
    }

    const result = await this.compactNow();
    if (!result) {
      return {
        output: 'No compaction needed right now.',
        success: true,
        continueConversation: false,
      };
    }

    const saved = result.tokensBefore - result.tokensAfter;
    return {
      output: [
        `Context compacted via ${result.strategy}.`,
        `before: ~${result.tokensBefore} tokens`,
        `after:  ~${result.tokensAfter} tokens`,
        `saved:  ~${saved} tokens`,
      ].join('\n'),
      success: true,
      continueConversation: false,
    };
  }
}
