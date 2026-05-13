import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ToolPermissionDecision, ToolPermissionPrompt } from '../../permission/ToolPermissionGate.js';

interface Props {
  prompt: ToolPermissionPrompt;
  onDecide: (decision: ToolPermissionDecision) => void;
}

/**
 * Ink Y/N gate for high-risk tools (wired from runtime.setToolPermissionHandler).
 */
export const ToolPermissionOverlay: React.FC<Props> = ({ prompt, onDecide }) => {
  useInput(
    (input, key) => {
      if (key.escape) {
        onDecide('deny');
        return;
      }
      const c = input.toLowerCase();
      if (c === 'y' || input === ' ') {
        onDecide('allow');
        return;
      }
      if (c === 'n') {
        onDecide('deny');
      }
    },
    { isActive: true },
  );

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} paddingY={0} marginBottom={1}>
      <Text bold color="yellow">
        Tool permission
      </Text>
      <Text>
        {prompt.risk} · {prompt.summary}
      </Text>
      <Text dimColor>{prompt.inputPreview}</Text>
      <Text dimColor>Y allow · N deny · Esc deny</Text>
    </Box>
  );
};
