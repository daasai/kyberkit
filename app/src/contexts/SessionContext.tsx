/**
 * SessionContext — global session state for the Kevin UI.
 *
 * Holds the active session ID and the list of all sessions fetched from Sidecar.
 * Components use this to know which session to send messages to and which
 * artifact to display in the CenterPanel.
 */

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { SIDECAR_URL } from '../config/sidecarUrl'

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
}

const SessionContext = createContext<SessionContextType | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/sessions`)
      if (!res.ok) return
      const data: SessionMeta[] = await res.json()
      setSessions(data)
      // Auto-select the most recent session if none active
      if (data.length > 0 && (activeSessionId === null || !data.find(s => s.id === activeSessionId))) {
        setActiveSessionId(data[0].id)
      }
    } catch {
      // Sidecar not running yet
    }
  }, [activeSessionId])

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch(`${SIDECAR_URL}/sessions`, { method: 'POST' })
    const session: SessionMeta = await res.json()
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [])

  const deleteSession = useCallback(async (id: string) => {
    await fetch(`${SIDECAR_URL}/sessions/${id}`, { method: 'DELETE' })
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSessionId === id) {
      setActiveSessionId(sessions.find(s => s.id !== id)?.id ?? null)
    }
  }, [activeSessionId, sessions])

  // Poll sessions periodically so the sidebar stays fresh
  useEffect(() => {
    refreshSessions()
    const interval = setInterval(refreshSessions, 5000)
    return () => clearInterval(interval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SessionContext.Provider value={{
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      deleteSession,
      refreshSessions,
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
