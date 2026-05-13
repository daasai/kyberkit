import React from 'react';
import type { KyberRuntime } from '../../runtime/KyberRuntime.js';
import type { AgentSession } from '../../runtime/AgentSession.js';

export interface SessionContextValue {
  runtime: KyberRuntime;
  session: AgentSession;
}

export const SessionContext = React.createContext<SessionContextValue | null>(null);

export function useSessionContext(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSessionContext must be used inside <SessionContext.Provider>');
  return ctx;
}
