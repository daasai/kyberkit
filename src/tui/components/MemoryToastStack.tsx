import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { MemoryToast } from '../state/sessionReducer.js';

/** 3 s visibility window per design spec §6.1. */
const TOAST_WINDOW_MS = 3000;
/** Ghost message after revert resolves, before final dismiss. */
const REVERTED_GHOST_MS = 1500;

interface Props {
  toasts: readonly MemoryToast[];
  onRevert: (toastId: string) => void;
  onDismiss: (toastId: string) => void;
}

/**
 * Sprint 3.5 §6.1 — "已记住" toast stack.
 *
 * Renders the oldest toast on top; Ctrl+Z targets the oldest toast. Auto-
 * dismisses after 3 s unless the user pressed Ctrl+Z (then it becomes a
 * transient "已撤回" ghost before vanishing).
 */
export const MemoryToastStack: React.FC<Props> = ({ toasts, onRevert, onDismiss }) => {
  // Re-render every 500 ms so the countdown ticks without event plumbing.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(id);
  }, [toasts.length]);

  // Auto-dismiss driver.
  useEffect(() => {
    const now = Date.now();
    const timers: NodeJS.Timeout[] = [];
    for (const t of toasts) {
      if (t.reverted) {
        const remaining = Math.max(0, REVERTED_GHOST_MS - (now - t.shownAt - TOAST_WINDOW_MS));
        timers.push(setTimeout(() => onDismiss(t.id), remaining));
        continue;
      }
      if (t.reverting) continue;
      const remaining = Math.max(0, TOAST_WINDOW_MS - (now - t.shownAt));
      timers.push(setTimeout(() => onDismiss(t.id), remaining));
    }
    return () => {
      for (const tm of timers) clearTimeout(tm);
    };
  }, [toasts, onDismiss]);

  // Ctrl+Z reverts the oldest toast that is still in the 3 s window.
  useInput((input, key) => {
    if (!key.ctrl) return;
    if (input !== 'z') return;
    const target = toasts.find(t => !t.reverting && !t.reverted);
    if (target) onRevert(target.id);
  });

  if (toasts.length === 0) return null;

  const now = Date.now();
  return (
    <Box flexDirection="column">
      {toasts.map(t => {
        if (t.reverted) {
          return (
            <Box key={t.id} marginTop={0}>
              <Text dimColor>↩ 已撤回: "{t.title}"</Text>
            </Box>
          );
        }
        if (t.reverting) {
          return (
            <Box key={t.id} marginTop={0}>
              <Text color="yellow">… 正在撤回 "{t.title}"</Text>
            </Box>
          );
        }
        const remainingMs = Math.max(0, TOAST_WINDOW_MS - (now - t.shownAt));
        const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
        return (
          <Box key={t.id} marginTop={0}>
            <Text>
              <Text color="cyan">🧠 已记住: </Text>
              <Text>"{t.title}"</Text>
              <Text dimColor>   [Ctrl+Z 撤回 · {seconds}s · {t.category}]</Text>
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
