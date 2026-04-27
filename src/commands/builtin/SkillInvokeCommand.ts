import { Command, CommandContext, CommandResult } from '../../types/command.js';

/**
 * Injects a skill body as the next user turn so the model can follow the workflow.
 */
export class SkillInvokeCommand implements Command {
  constructor(
    readonly name: string,
    readonly description: string,
    private readonly body: string,
  ) {}

  async execute(_args: Record<string, unknown>, _ctx: CommandContext): Promise<CommandResult> {
    const userText = [
      'Follow this skill workflow (injected via /' + this.name + '):',
      '',
      this.body,
    ].join('\n');
    return {
      output: `Injected skill **${this.name}** into the conversation.`,
      success: true,
      continueConversation: false,
      followUpWithAgent: { userText },
    };
  }
}
