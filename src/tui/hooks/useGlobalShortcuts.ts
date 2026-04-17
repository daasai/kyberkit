import { useInput, useApp } from 'ink';

export interface GlobalShortcutHandlers {
  onCancel: () => void;
  isBusy: boolean;
}

/**
 * Registers global keyboard shortcuts for the REPL:
 *   Ctrl+D  → exit the application
 *   Ctrl+C  → cancel the current turn (when busy)
 */
export function useGlobalShortcuts({ onCancel, isBusy }: GlobalShortcutHandlers) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'd') {
      exit();
      return;
    }
    if (key.ctrl && input === 'c' && isBusy) {
      onCancel();
      return;
    }
    // Ctrl+C when not busy → let the OS default (SIGINT) bubble through.
    // The process will exit cleanly.
  });
}
