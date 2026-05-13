import { Command, CommandContext, CommandResult } from '../types/command.js';

/**
 * CommandRegistry — handles registration, parsing, and execution of slash commands.
 * Sprint 2, Step 6.
 */
export class CommandRegistry {
  private commands = new Map<string, Command>();

  /** Register a command. */
  register(command: Command): this {
    this.commands.set(command.name, command);
    return this;
  }

  /** Check if a raw input string is a command. */
  isCommand(input: string): boolean {
    return input.trimStart().startsWith('/');
  }

  /** Parse a command input into its name and raw arguments. */
  parseInput(input: string): { name: string; rawArgs: string } | null {
    const trimmed = input.trimStart();
    if (!trimmed.startsWith('/')) return null;

    const withoutSlash = trimmed.slice(1);
    const spaceIndex = withoutSlash.indexOf(' ');

    if (spaceIndex === -1) {
      return { name: withoutSlash, rawArgs: '' };
    }

    return {
      name: withoutSlash.slice(0, spaceIndex),
      rawArgs: withoutSlash.slice(spaceIndex + 1).trim()
    };
  }

  /** Execute a command string. */
  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    const parsed = this.parseInput(input);
    if (!parsed) {
      return { output: 'Invalid command format', success: false, continueConversation: false };
    }

    const command = this.commands.get(parsed.name);
    if (!command) {
      return { 
        output: `Unknown command: /${parsed.name}\nUse /help to see available commands.`, 
        success: false, 
        continueConversation: false 
      };
    }

    // Check if enabled (permission/context check)
    if (command.isEnabled && !command.isEnabled(context)) {
      return { 
        output: `Command /${parsed.name} is not available in the current context.`, 
        success: false, 
        continueConversation: false 
      };
    }

    // Parse arguments or pass raw
    const args = command.parse ? command.parse(parsed.rawArgs) : { _raw: parsed.rawArgs };

    try {
      return await command.execute(args, context);
    } catch (error: any) {
      return { 
        output: `Command execution failed: ${error.message}`, 
        success: false, 
        continueConversation: false 
      };
    }
  }

  /** List all registered commands. */
  list(): Command[] {
    return Array.from(this.commands.values());
  }
}
