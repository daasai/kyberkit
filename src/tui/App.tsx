import React from 'react';
import { Box } from 'ink';
import { SessionContext } from './contexts/SessionContext.js';
import { REPL } from './REPL.js';
import type { KyberRuntime } from '../runtime/KyberRuntime.js';
import type { AgentSession } from '../runtime/AgentSession.js';

export interface AppProps {
  runtime: KyberRuntime;
  session: AgentSession;
}

export const App: React.FC<AppProps> = ({ runtime, session }) => (
  <SessionContext.Provider value={{ runtime, session }}>
    <Box flexDirection="column" width="100%">
      <REPL />
    </Box>
  </SessionContext.Provider>
);
