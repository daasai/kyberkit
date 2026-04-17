import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { formatTokens, estimateCost, formatCost } from '../utils/format.js';
import { useSessionContext } from '../contexts/SessionContext.js';
import type { CumulativeUsage } from '../../types/agent-events.js';

interface Props {
  cumulative: CumulativeUsage;
  isBusy: boolean;
}

export const StatusBar: React.FC<Props> = ({ cumulative, isBusy }) => {
  const { runtime } = useSessionContext();
  const config = runtime.getConfig();
  const model = config.model.name;
  const workspaceId = runtime.getActiveWorkspace?.()?.config?.workspaceId ?? 'default';
  const cost = estimateCost(cumulative);

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
        {/* Left: model + workspace */}
        <Box>
          <Text bold>{model}</Text>
          <Text dimColor> · ws=</Text>
          <Text>{workspaceId}</Text>
        </Box>

        {/* Center: token stats */}
        <Box>
          <Text dimColor>
            {`turns=${cumulative.turnCount} · `}
            {`in=${formatTokens(cumulative.totalInputTokens)} · `}
            {`out=${formatTokens(cumulative.totalOutputTokens)} · `}
            {`cache-r=${formatTokens(cumulative.totalCacheReadTokens)} · `}
            {formatCost(cost)}
          </Text>
        </Box>

        {/* Right: status indicator */}
        <Box>
          {isBusy ? (
            <Text color="yellow"><Spinner type="dots" /> busy</Text>
          ) : (
            <Text color="green">ready</Text>
          )}
        </Box>
      </Box>
    </Box>
  );
};
