import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { truncate } from '../utils/format.js';
import { ToolCallRenderer } from './ToolCallRenderer.js';
import type { TurnState } from '../state/sessionReducer.js';

interface Props {
  turn: TurnState;
}

export const TurnRenderer: React.FC<Props> = ({ turn }) => (
  <Box flexDirection="column" marginBottom={1}>
    {/* User input */}
    <Box>
      <Text color="cyan" bold>You: </Text>
      <Text>{turn.userInput}</Text>
    </Box>

    {/* Thinking block (dim italic, truncated) */}
    {turn.thinking.length > 0 && (
      <Box marginLeft={2} marginTop={0}>
        <Text dimColor italic>💭 {truncate(turn.thinking, 300)}</Text>
      </Box>
    )}

    {/* Tool calls */}
    {turn.toolCalls.map(tc => (
      <ToolCallRenderer key={tc.toolUseId} toolCall={tc} />
    ))}

    {/* Assistant text output */}
    {turn.assistantText.length > 0 && (
      <Box flexDirection="column" marginTop={0}>
        <Box>
          <Text color="green" bold>Kyber: </Text>
        </Box>
        <Box marginLeft={2}>
          <Text>{turn.assistantText}</Text>
        </Box>
      </Box>
    )}

    {/* Spinner shown while streaming with no output yet */}
    {turn.status === 'streaming' &&
      turn.assistantText.length === 0 &&
      turn.thinking.length === 0 &&
      turn.toolCalls.length === 0 && (
        <Box marginLeft={2}>
          <Spinner type="dots" />
          <Text dimColor> thinking…</Text>
        </Box>
      )}

    {/* Error banner */}
    {turn.status === 'error' && turn.error && (
      <Box marginTop={0}>
        <Text color="red">⚠ {turn.error}</Text>
      </Box>
    )}
  </Box>
);
