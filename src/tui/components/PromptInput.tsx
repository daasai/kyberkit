import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
  disabled: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  history: string[];
  commandSuggestions: string[];
}

export const PromptInput: React.FC<Props> = ({
  disabled,
  onSubmit,
  onCancel,
  history,
  commandSuggestions,
}) => {
  const [value, setValue] = useState('');
  const [historyIdx, setHistoryIdx] = useState(history.length);

  // Sync historyIdx ceiling when history grows
  const effectiveHistory = history;

  useInput((input, key) => {
    if (disabled) return;

    // Ctrl+C: clear input first, then cancel if already empty
    if (key.ctrl && input === 'c') {
      if (value.length > 0) {
        setValue('');
        return;
      }
      onCancel?.();
      return;
    }

    // Esc: clear input
    if (key.escape) {
      setValue('');
      return;
    }

    // ↑ history navigation
    if (key.upArrow && effectiveHistory.length > 0) {
      const next = Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setValue(effectiveHistory[next] ?? '');
      return;
    }

    // ↓ history navigation
    if (key.downArrow) {
      const next = Math.min(effectiveHistory.length, historyIdx + 1);
      setHistoryIdx(next);
      setValue(next < effectiveHistory.length ? (effectiveHistory[next] ?? '') : '');
      return;
    }
  });

  const handleSubmit = useCallback(
    (v: string) => {
      if (!disabled && v.trim()) {
        onSubmit(v.trim());
        setValue('');
        setHistoryIdx(history.length + 1);
      }
    },
    [disabled, onSubmit, history.length],
  );

  // Show command completions when input starts with "/"
  const isCommand = value.startsWith('/');
  const candidates = isCommand
    ? commandSuggestions.filter(c => c.startsWith(value.slice(1))).slice(0, 5)
    : [];

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={disabled ? 'gray' : 'cyan'}>{'▶ '}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={
            disabled ? '(agent is thinking…)' : 'Type a message, or / for commands'
          }
        />
      </Box>

      {candidates.length > 0 && (
        <Box marginLeft={2}>
          <Text dimColor>{'  '}{candidates.map(c => `/${c}`).join('  ')}</Text>
        </Box>
      )}
    </Box>
  );
};
