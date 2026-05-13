import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { truncate } from '../utils/format.js';
import { ToolCallRenderer } from './ToolCallRenderer.js';
import type { TurnState } from '../state/sessionReducer.js';
import { buildToolDisplayGroups, type ToolDisplayGroup } from '../utils/toolDisplayGroups.js';
import { TurnSummaryCard } from './TurnSummaryCard.js';

interface Props {
  turn: TurnState;
  displayMode: 'compact' | 'verbose';
}

function renderGroup(g: ToolDisplayGroup, compact: boolean, key: string) {
  if (g.kind === 'single') {
    return <ToolCallRenderer key={key} toolCall={g.toolCall} compact={compact} />;
  }
  const rec = g.recoveredBy ? ` → ${g.recoveredBy}` : '';
  return (
    <Box key={key} marginLeft={2}>
      <Text color="red">
        ✗ {g.toolName} ×{g.errorCount}
      </Text>
      {g.recoveredBy ? (
        <Text color="green">
          {' '}
          recovered{rec}
        </Text>
      ) : null}
    </Box>
  );
}

export const TurnRenderer: React.FC<Props> = ({ turn, displayMode }) => {
  const compact = displayMode === 'compact';
  const groups = buildToolDisplayGroups(turn.toolCalls, compact);

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* User input */}
      <Box>
        <Text color="cyan" bold>
          You:{' '}
        </Text>
        <Text>{turn.userInput}</Text>
      </Box>

      {/* Thinking block (dim italic, truncated) */}
      {turn.thinking.length > 0 && (
        <Box marginLeft={2} marginTop={0}>
          <Text dimColor italic>
            💭 {truncate(turn.thinking, 300)}
          </Text>
        </Box>
      )}

      {/* Tool calls */}
      {groups.map((g, i) => renderGroup(g, compact, `g-${turn.turnNumber}-${i}`))}

      {/* Assistant text output */}
      {turn.assistantText.length > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Box>
            <Text color="green" bold>
              Kyber:{' '}
            </Text>
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

      {/* Sprint 3.5 §5 — deliverables dashboard, rendered only for completed turns. */}
      {turn.turnSummary && turn.status !== 'streaming' && (
        <TurnSummaryCard summary={turn.turnSummary} />
      )}

      {/* Error banner */}
      {turn.status === 'error' && turn.error && (
        <Box marginTop={0}>
          <Text color="red">⚠ {turn.error}</Text>
        </Box>
      )}
    </Box>
  );
};
