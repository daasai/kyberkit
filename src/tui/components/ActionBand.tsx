import React from 'react';
import { Box, Text } from 'ink';
import { formatTokens, estimateCost, formatCost, formatDurationMs } from '../utils/format.js';
import type { CumulativeUsage } from '../../types/agent-events.js';

/**
 * ActionBand — Sprint 3.5 §3.2 bottom band.
 *
 * Context-sensitive one-line strip above the PromptInput. Replaces StatusBar
 * and absorbs its usage/cost summary. Purpose is "告诉用户下一步可以/应该做什么"
 * rather than merely displaying state.
 */
interface Props {
  cumulative: CumulativeUsage;
  isBusy: boolean;
  model: string;
  /** Elapsed ms since the active turn started. */
  elapsedTurnMs?: number;
  /** Number of tool calls so far in the active turn. */
  toolsThisTurn?: number;
  /** Age of the last AgentEvent (for stall hint). */
  lastEventAgeMs?: number;
  /** compact | verbose indicator (drives the "v 切换" hint). */
  displayMode?: 'compact' | 'verbose';
  /** Whether a tool permission prompt is waiting for user input. */
  awaitingPermission?: boolean;
}

export const ActionBand: React.FC<Props> = ({
  cumulative,
  isBusy,
  model,
  elapsedTurnMs,
  toolsThisTurn,
  lastEventAgeMs,
  displayMode = 'compact',
  awaitingPermission = false,
}) => {
  const cost = estimateCost(cumulative);
  const stallHint =
    isBusy && lastEventAgeMs != null && lastEventAgeMs > 8000
      ? ` · 等待 ${formatDurationMs(lastEventAgeMs)}`
      : '';

  // Left column — contextual status / prompt.
  let leftContent: React.ReactNode;
  if (awaitingPermission) {
    leftContent = <Text color="yellow">等待授权：y 允许 / n 拒绝 / Esc 取消</Text>;
  } else if (isBusy) {
    const bits: string[] = [];
    if (elapsedTurnMs != null) bits.push(formatDurationMs(elapsedTurnMs));
    if (toolsThisTurn != null) bits.push(`${toolsThisTurn} 工具`);
    leftContent = (
      <Box>
        <Text color="yellow">● 运行中</Text>
        <Text dimColor>
          {bits.length > 0 ? ` · ${bits.join(' · ')}` : ''}
          {stallHint}
        </Text>
        <Text dimColor> · Ctrl+C 中断</Text>
      </Box>
    );
  } else {
    leftContent = (
      <Box>
        <Text color="green">● 就绪</Text>
        <Text dimColor> · 输入消息 / 或 / 开启命令 · v 切换显示</Text>
      </Box>
    );
  }

  // Right column — cost / tokens / model.
  const rightBits: string[] = [];
  rightBits.push(model);
  rightBits.push(`turns=${cumulative.turnCount}`);
  rightBits.push(`in=${formatTokens(cumulative.totalInputTokens)}`);
  rightBits.push(`out=${formatTokens(cumulative.totalOutputTokens)}`);
  rightBits.push(formatCost(cost));
  if (isBusy) {
    rightBits.push(`${displayMode === 'verbose' ? 'verbose' : 'compact'}`);
  }

  return (
    <Box
      borderStyle="single"
      borderTop
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      paddingX={1}
    >
      <Box width="100%" justifyContent="space-between">
        <Box flexGrow={1}>{leftContent}</Box>
        <Box flexShrink={0}>
          <Text dimColor>{rightBits.join(' · ')}</Text>
        </Box>
      </Box>
    </Box>
  );
};
