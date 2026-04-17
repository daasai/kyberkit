import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * CompactCommand — placeholder for context compression.
 * Real implementation scheduled for Sprint 4.
 * Sprint 2, Step 6.
 */
export class CompactCommand implements Command {
  readonly name = 'compact';
  readonly description = 'Compress conversation context (Sprint 4)';

  async execute(): Promise<CommandResult> {
    return {
      output: 'The /compact command is a placeholder for Sprint 4 context compression features.',
      success: true,
      continueConversation: false
    };
  }
}
