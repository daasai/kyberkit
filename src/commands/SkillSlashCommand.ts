import type { Command, CommandContext, CommandResult } from '../types/command.js';
import type { SkillMeta } from '../tools/skills/SkillMeta.js';

/**
 * /{skillName} — injects the SKILL.md body as the next user turn for the agent.
 */
export class SkillSlashCommand implements Command {
  readonly name: string;
  readonly description: string;

  constructor(private readonly meta: SkillMeta) {
    this.name = meta.name;
    this.description = meta.description || `Skill: ${meta.name}`;
  }

  async execute(_args: Record<string, unknown>, _context: CommandContext): Promise<CommandResult> {
    const preamble =
      `Follow this workflow (skill: ${this.meta.name}). Use available tools to complete the task.\n\n`;
    return {
      output: `Injected skill "${this.meta.name}" into the agent context.`,
      success: true,
      continueConversation: true,
      followUpWithAgent: { userText: preamble + this.meta.body },
    };
  }
}
