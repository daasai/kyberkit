import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * CostCommand — shows token usage and estimated cost for the current session.
 * Sprint 2, Step 6.
 */
export class CostCommand implements Command {
  readonly name = 'cost';
  readonly description = 'Show token usage and estimated cost';

  async execute(args: Record<string, unknown>, context: CommandContext): Promise<CommandResult> {
    if (!context.cumulative) {
      return { 
        output: 'Usage data not available in this context.', 
        success: false, 
        continueConversation: false 
      };
    }

    const { cumulative } = context;
    const lines = [
      '# Session Usage & Cost',
      '',
      `- **Turns**: ${cumulative.turnCount}`,
      `- **Input Tokens**: ${cumulative.totalInputTokens}`,
      `- **Output Tokens**: ${cumulative.totalOutputTokens}`,
      `- **Cache Hits**: ${cumulative.totalCacheReadTokens} tokens`,
      `- **Cache Writes**: ${cumulative.totalCacheCreationTokens} tokens`,
    ];

    // Simple estimation (placeholder prices per 1M tokens)
    const inPrice = 3.0; // $3.00 / 1M input
    const outPrice = 15.0; // $15.00 / 1M output
    const estCost = ((cumulative.totalInputTokens * inPrice) + (cumulative.totalOutputTokens * outPrice)) / 1_000_000;
    
    lines.push('', `**Estimated Cost**: $${estCost.toFixed(4)}`);

    return {
      output: lines.join('\n'),
      success: true,
      continueConversation: false
    };
  }
}
