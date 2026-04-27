import React from 'react';
import { Box, Text } from 'ink';
import type { TurnState } from '../state/sessionReducer.js';
import { TranscriptView } from './TranscriptView.js';
import { ActivityPanel } from './ActivityPanel.js';

/**
 * NarrativeBand — Sprint 3.5 §3.2 middle band.
 *
 * Holds the "past / current / main" stream. Completed turns live in the
 * underlying TranscriptView's <Static>; the active-turn live overlay (plan
 * steps + narration lines + assistant output) is rendered here directly so
 * it shares the same vertical column.
 */
interface Props {
  turns: TurnState[];
  activeTurn: TurnState | undefined;
  displayMode: 'compact' | 'verbose';
  isBusy: boolean;
}

export const NarrativeBand: React.FC<Props> = ({ turns, activeTurn, displayMode, isBusy }) => {
  return (
    <Box flexDirection="column" flexGrow={1}>
      <TranscriptView turns={turns} displayMode={displayMode} />

      {isBusy && activeTurn?.taskPlan?.steps.length ? (
        <Box
          flexDirection="column"
          marginLeft={2}
          marginBottom={0}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text bold color="cyan">
              计划
            </Text>
            <Text dimColor>
              {activeTurn.taskPlan.source === 'model' ? 'model' : 'auto'}
            </Text>
          </Box>
          {activeTurn.taskPlan.steps.map((s) => {
            const mark =
              s.status === 'done'
                ? '✓'
                : s.status === 'active'
                  ? '›'
                  : s.status === 'failed'
                    ? '✗'
                    : '○';
            const dim = s.status === 'pending';
            return (
              <Box key={s.id}>
                <Text color={s.status === 'active' ? 'yellow' : dim ? 'gray' : 'white'}>
                  {mark} {s.title}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}

      {isBusy && activeTurn?.narrations?.length ? (
        <ActivityPanel lines={activeTurn.narrations} />
      ) : null}
    </Box>
  );
};
