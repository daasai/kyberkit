import type { Command, CommandResult } from '../../types/command.js';

/**
 * HelpCommand — lists all available / commands.
 * Sprint 2, Step 6.
 */
export class HelpCommand implements Command {
  readonly name = 'help';
  readonly description = '列出全部斜杠命令';

  constructor(private readonly getCommands: () => Command[]) {}

  async execute(): Promise<CommandResult> {
    const commands = this.getCommands();
    const w = Math.max(4, ...commands.map(c => c.name.length), 'quit'.length, 'exit'.length);
    const lines: string[] = [
      '可用命令（在终端中直接显示，无 Markdown 渲染）',
      '─'.repeat(Math.min(48, w + 24)),
    ];

    for (const cmd of commands) {
      lines.push(`/${cmd.name.padEnd(w)}  ${cmd.description}`);
    }
    lines.push(`/${'quit'.padEnd(w)}  退出 TUI（也可直接输入 quit）`);
    lines.push(`/${'exit'.padEnd(w)}  退出 TUI`);
    lines.push('');
    lines.push('提示：输入 / 前缀可浏览补全；空行按 v 切换简洁/详细工具展示。');

    return {
      output: lines.join('\n'),
      success: true,
      continueConversation: false,
    };
  }
}
