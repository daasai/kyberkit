import React from 'react';
import { Box, Text } from 'ink';

export interface NarrationLine {
  readonly id: string;
  readonly text: string;
  readonly kind: 'starting' | 'progress' | 'recovering' | 'wrapping_up';
}

interface Props {
  lines: readonly NarrationLine[];
  /** Max visible lines before collapse summary. */
  maxVisible?: number;
}

export const ActivityPanel: React.FC<Props> = ({ lines, maxVisible = 3 }) => {
  if (lines.length === 0) return null;
  const hidden = Math.max(0, lines.length - maxVisible);
  const visible = lines.slice(-maxVisible);

  return (
    <Box flexDirection="column" marginBottom={0} paddingX={1}>
      {hidden > 0 ? (
        <Text dimColor>… 另有 {hidden} 条活动</Text>
      ) : null}
      {visible.map((l) => (
        <Box key={l.id}>
          <Text dimColor>· </Text>
          <Text color={l.kind === 'recovering' ? 'red' : 'gray'}>{l.text}</Text>
        </Box>
      ))}
    </Box>
  );
};
