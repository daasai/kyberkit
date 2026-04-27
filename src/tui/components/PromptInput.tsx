import { useState, useCallback, useMemo, useEffect, type FC } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

const COMPLETION_VISIBLE = 10;

export interface CommandEntry {
  readonly name: string;
  readonly description: string;
}

interface Props {
  disabled: boolean;
  /** When true, main line is disabled because a tool-permission gate is open (Y/N handled above). */
  awaitingToolPermission?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  history: string[];
  commandEntries: readonly CommandEntry[];
  /** Empty-line `v` toggles compact/verbose tool rows (handled here so typing "have" still works). */
  onToggleDisplayMode?: () => void;
}

export const PromptInput: FC<Props> = ({
  disabled,
  awaitingToolPermission,
  onSubmit,
  onCancel,
  history,
  commandEntries,
  onToggleDisplayMode,
}) => {
  const [value, setValue] = useState('');
  const [historyIdx, setHistoryIdx] = useState(history.length);
  const [highlightIdx, setHighlightIdx] = useState(0);

  const effectiveHistory = history;

  const raw = value.trimStart();
  const isCommand = raw.startsWith('/');
  const prefix = isCommand ? raw.slice(1) : '';

  const filtered = useMemo(
    () => commandEntries.filter(e => e.name.startsWith(prefix)),
    [commandEntries, prefix],
  );

  useEffect(() => {
    setHighlightIdx(0);
  }, [value]);

  useInput((input, key) => {
    if (disabled) return;

    const rawNow = value.trimStart();
    const cmdNow = rawNow.startsWith('/');
    const prefNow = cmdNow ? rawNow.slice(1) : '';
    const filtNow = commandEntries.filter(e => e.name.startsWith(prefNow));

    if (
      onToggleDisplayMode &&
      (input === 'v' || input === 'V') &&
      value.length === 0 &&
      !key.ctrl &&
      !key.meta
    ) {
      onToggleDisplayMode();
      return;
    }

    if (cmdNow && filtNow.length > 0 && (key.upArrow || key.downArrow)) {
      if (key.upArrow) {
        setHighlightIdx(h => Math.max(0, h - 1));
      }
      if (key.downArrow) {
        setHighlightIdx(h => Math.min(filtNow.length - 1, h + 1));
      }
      return;
    }

    if (key.ctrl && input === 'c') {
      if (value.length > 0) {
        setValue('');
        return;
      }
      onCancel?.();
      return;
    }

    if (key.escape) {
      setValue('');
      return;
    }

    if (key.upArrow && effectiveHistory.length > 0) {
      const next = Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setValue(effectiveHistory[next] ?? '');
      return;
    }

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

  const safeHighlight = Math.min(
    highlightIdx,
    Math.max(0, filtered.length - 1),
  );
  const windowStart =
    filtered.length <= COMPLETION_VISIBLE
      ? 0
      : Math.min(
          Math.max(0, safeHighlight - Math.floor(COMPLETION_VISIBLE / 2)),
          Math.max(0, filtered.length - COMPLETION_VISIBLE),
        );
  const visible = filtered.slice(windowStart, windowStart + COMPLETION_VISIBLE);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={disabled ? 'gray' : 'cyan'}>{'▶ '}</Text>
        <TextInput
          focus={!disabled}
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={
            disabled
              ? awaitingToolPermission
                ? '(use Y / N / Esc in Tool permission above — prompt paused)'
                : '(agent is thinking…)'
              : 'Type a message, or / for commands'
          }
        />
      </Box>

      {isCommand && filtered.length > 0 ? (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          <Text dimColor>
            {`  ↑↓ 浏览 · ${filtered.length} 个命令`}
            {filtered.length > COMPLETION_VISIBLE
              ? ` · 窗口 ${windowStart + 1}-${windowStart + visible.length}`
              : ''}
          </Text>
          {visible.map((e, i) => {
            const row = windowStart + i;
            const active = row === safeHighlight;
            return (
              <Box key={`${e.name}-${row}`}>
                <Text color={active ? 'cyan' : undefined} bold={active}>
                  {'  '}
                  {`/${e.name}`}
                  <Text dimColor>{`  ${e.description}`}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
};
