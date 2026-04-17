import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * HelpCommand — lists all available / commands.
 * Sprint 2, Step 6.
 */
export class HelpCommand implements Command {
  readonly name = 'help';
  readonly description = 'Show all available commands';

  constructor(private readonly getCommands: () => Command[]) {}

  async execute(): Promise<CommandResult> {
    const commands = this.getCommands();
    const lines = ['# Available Commands', ''];
    
    for (const cmd of commands) {
      lines.push(`- **/${cmd.name}**: ${cmd.description}`);
    }

    return {
      output: lines.join('\n'),
      success: true,
      continueConversation: false
    };
  }
}
