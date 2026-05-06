/**
 * SessionContext — global session state for the Kevin UI.
 *
 * Holds the active session ID and the list of all sessions fetched from Sidecar.
 * Components use this to know which session to send messages to and which
 * artifact to display in the CenterPanel.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SIDECAR_URL } from '../config/sidecarUrl'
import { openAndFocusSpace, type SpaceSwitchOutcome } from '../lib/tauriSpace'

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  artifactPreview?: string
}

interface SessionContextType {
  sessions: SessionMeta[]
  activeSessionId: string | null
  setActiveSessionId: (id: string) => void
  createSession: () => Promise<string>
  deleteSession: (id: string) => Promise<void>
  refreshSessions: () => Promise<void>
  switchToSessionSpace: (id: string) => Promise<SpaceSwitchOutcome>
}

const SessionContext = createContext<SessionContextType | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  /** Always latest id for polling — avoids stale closure resetting selection every interval. */
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/sessions`)
      if (!res.ok) return
      const data: SessionMeta[] = await res.json()
      setSessions(data)
      const current = activeSessionIdRef.current
      // Auto-select newest only when nothing selected or current id no longer exists
      if (data.length > 0 && (current === null || !data.some((s) => s.id === current))) {
        setActiveSessionId(data[0].id)
      }
    } catch {
      // Sidecar not running yet
    }
  }, [])

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch(`${SIDECAR_URL}/sessions`, { method: 'POST' })
    const session: SessionMeta = await res.json()
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`${SIDECAR_URL}/sessions/${id}`, { method: 'DELETE' })
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (activeSessionIdRef.current === id) {
        setActiveSessionId(filtered[0]?.id ?? null)
      }
      return filtered
    })
  }, [])

  const switchToSessionSpace = useCallback(async (id: string): Promise<SpaceSwitchOutcome> => {
    const current = activeSessionIdRef.current
    if (current === id) return 'noop'
    const ok = await openAndFocusSpace(id)
    return ok ? 'focused' : 'failed'
  }, [])

  // Deep link: ?space=<sessionId> (e.g. second window from A1 switch)
  useEffect(() => {
    try {
      const sid = new URLSearchParams(window.location.search).get('space')
      if (sid) {
        setActiveSessionId(sid)
        activeSessionIdRef.current = sid
      }
    } catch {
      /* ignore */
    }
  }, [])

  // Poll sessions periodically so the sidebar stays fresh
  useEffect(() => {
    void refreshSessions()
    const interval = setInterval(() => {
      void refreshSessions()
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshSessions])

  return (
    <SessionContext.Provider value={{
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      deleteSession,
      refreshSessions,
      switchToSessionSpace,
    }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextType {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
