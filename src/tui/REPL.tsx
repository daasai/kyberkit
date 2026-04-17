import React, { useCallback } from 'react';
import { Box, useApp } from 'ink';
import { useSession } from './hooks/useSession.js';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts.js';
import { TranscriptView } from './components/TranscriptView.js';
import { StatusBar } from './components/StatusBar.js';
import { PromptInput } from './components/PromptInput.js';
import { useSessionContext } from './contexts/SessionContext.js';

export const REPL: React.FC = () => {
  const { runtime } = useSessionContext();
  const { state, send, cancel, isBusy } = useSession();
  const { exit } = useApp();

  // Build command suggestion list for PromptInput autocomplete
  const commandSuggestions = React.useMemo(() => {
    try {
      const ws = runtime.getActiveWorkspace?.();
      const cmds = ws?.commandRegistry?.list() ?? [];
      return [...cmds.map(c => c.name), 'quit', 'exit'];
    } catch {
      return ['help', 'cost', 'memory', 'compact', 'quit', 'exit'];
    }
  }, [runtime]);

  useGlobalShortcuts({ onCancel: cancel, isBusy });

  const handleSubmit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === '/quit' || trimmed === '/exit' || trimmed === 'quit') {
        exit();
        return;
      }
      send(trimmed);
    },
    [send, exit],
  );

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Scrolling transcript area */}
      <Box flexDirection="column" flexGrow={1}>
        <TranscriptView turns={state.turns} />
      </Box>

      {/* Status bar */}
      <StatusBar cumulative={state.cumulative} isBusy={isBusy} />

      {/* Input field */}
      <PromptInput
        disabled={isBusy}
        onSubmit={handleSubmit}
        onCancel={cancel}
        history={state.inputHistory}
        commandSuggestions={commandSuggestions}
      />
    </Box>
  );
};
