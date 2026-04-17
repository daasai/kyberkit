import React from 'react';
import { Box, Static } from 'ink';
import { TurnRenderer } from './TurnRenderer.js';
import type { TurnState } from '../state/sessionReducer.js';

interface Props {
  turns: TurnState[];
}

/**
 * TranscriptView renders the conversation history.
 *
 * Completed turns are wrapped in Ink's <Static> so they are rendered exactly
 * once and never re-rendered, keeping scrollback performance O(1) regardless
 * of how many turns have accumulated.
 *
 * The active (streaming) turn is rendered outside <Static> to allow
 * incremental updates on every text_delta event.
 */
export const TranscriptView: React.FC<Props> = ({ turns }) => {
  const completed = turns.filter(t => t.status === 'done' || t.status === 'error');
  const active = turns.find(
    t => t.status === 'streaming' || t.status === 'executing_tools',
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={completed}>
        {t => <TurnRenderer key={t.turnNumber} turn={t} />}
      </Static>
      {active && <TurnRenderer key={active.turnNumber} turn={active} />}
    </Box>
  );
};
