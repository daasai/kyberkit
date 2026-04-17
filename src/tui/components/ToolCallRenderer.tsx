import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { truncate, previewJson } from '../utils/format.js';
import type { ToolCallState } from '../state/sessionReducer.js';

const STATUS_ICON: Record<ToolCallState['status'], string> = {
  pending: '⏳',
  running: '⚙',
  done: '✓',
  error: '✗',
};

const STATUS_COLOR: Record<ToolCallState['status'], string> = {
  pending: 'yellow',
  running: 'yellow',
  done: 'green',
  error: 'red',
};

interface Props {
  toolCall: ToolCallState;
}

export const ToolCallRenderer: React.FC<Props> = ({ toolCall }) => {
  const color = STATUS_COLOR[toolCall.status];
  const icon = STATUS_ICON[toolCall.status];

  return (
    <Box flexDirection="column" marginLeft={2} marginTop={0} marginBottom={0}>
      <Box>
        {toolCall.status === 'running' ? (
          <Text color="yellow"><Spinner type="dots" /> </Text>
        ) : (
          <Text color={color as any}>{icon} </Text>
        )}
        <Text color={color as any} bold>tool: </Text>
        <Text bold>{toolCall.toolName}</Text>
      </Box>

      {toolCall.input !== undefined && (
        <Box marginLeft={3}>
          <Text dimColor>in: {previewJson(toolCall.input, 160)}</Text>
        </Box>
      )}

      {toolCall.result !== undefined && (
        <Box marginLeft={3}>
          <Text color={toolCall.isError ? 'red' : 'gray'}>
            {toolCall.isError ? 'err: ' : 'out: '}
            {truncate(toolCall.result, 240)}
          </Text>
        </Box>
      )}
    </Box>
  );
};
