import { existsSync } from 'fs';
import { join } from 'path';
import { Command, CommandContext, CommandResult } from '../../types/command.js';
import { KyberAnalyticsDb } from '../../observability/KyberAnalyticsDb.js';
import { parseSinceToMs } from '../../observability/parseSince.js';

/**
 * `/stats` — aggregate recent trajectory rows for the current agent session.
 */
export class StatsCommand implements Command {
  readonly name = 'stats';
  readonly description = 'Show trajectory stats for this session (local SQLite)';

  parse(input: string): Record<string, unknown> {
    return { window: input.trim() || '7d' };
  }

  async execute(args: Record<string, unknown>, context: CommandContext): Promise<CommandResult> {
    const agentId = context.agentId;
    if (!agentId) {
      return { output: 'No agent id in context.', success: false, continueConversation: false };
    }
    const windowRaw = typeof args.window === 'string' ? args.window : '7d';
    const sinceMs = parseSinceToMs(windowRaw);
    const dbPath = join(context.cwd, '.kyberkit', 'runtime', `${agentId}.trajectory.sqlite`);
    if (!existsSync(dbPath)) {
      return {
        output: `No trajectory database at \`${dbPath}\`. Complete a few turns with telemetry enabled, or set KYBER_TELEMETRY_TRAJECTORY_ENABLED=true.`,
        success: false,
        continueConversation: false,
      };
    }

    const db = new KyberAnalyticsDb(dbPath);
    try {
      const st = db.queryTurnStats(agentId, sinceMs);
      const tools = db.queryToolErrors(agentId, sinceMs, 8);
      const lines = [
        '# Trajectory stats',
        '',
        `- **Window**: last ${windowRaw}`,
        `- **Turns recorded**: ${st.turnCount}`,
        `- **Avg turn duration**: ${(st.avgDurationMs / 1000).toFixed(1)}s`,
        `- **Avg tool calls / turn**: ${st.avgToolCalls.toFixed(2)}`,
        `- **Correction rate** (follow-up flagged): ${(st.correctionRate * 100).toFixed(1)}%`,
        `- **Interrupt rate**: ${(st.interruptRate * 100).toFixed(1)}%`,
        '',
        '## Tool error counts (top)',
      ];
      if (tools.length === 0) {
        lines.push('_(no tool steps in window)_');
      } else {
        for (const t of tools) {
          const rate = t.runs ? ((t.fails / t.runs) * 100).toFixed(0) : '0';
          lines.push(`- **${t.tool_name}**: ${t.fails} fails / ${t.runs} runs (${rate}% fail)`);
        }
      }
      return { output: lines.join('\n'), success: true, continueConversation: false };
    } finally {
      db.close();
    }
  }
}
