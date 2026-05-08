/**
 * SessionContext — global session state for the Kevin UI.
 *
 * Holds the active session ID and the list of all sessions fetched from Sidecar.
 * Components use this to know which session to send messages to and which
 * artifact to display in the CenterPanel.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SIDECAR_URL, qsSpace } from '../config/sidecarUrl'
import { openAndFocusSpace, type SpaceSwitchOutcome } from '../lib/tauriSpace'

const SPACE_STORAGE_KEY = 'kevin:active-space-id'

export interface SpaceMeta {
  id: string
  label: string
}

function readInitialSpaceId(): string {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('space_id')?.trim()
      if (q) {
        localStorage.setItem(SPACE_STORAGE_KEY, q)
        return q
      }
      return localStorage.getItem(SPACE_STORAGE_KEY) || 'default'
    }
  } catch { /* ignore */ }
  return 'default'
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  artifactPreview?: string
}

interface SessionContextType {
  spaceId: string
  setSpaceId: (id: string) => void
  spaces: SpaceMeta[]
  refreshSpaces: () => Promise<void>
  sessions: SessionMeta[]
  activeSessionId: string | null
  setActiveSessionId: (id: string) => void
  createSession: () => Promise<string>
  deleteSession: (id: string) => Promise<void>
  refreshSessions: () => Promise<void>
  /** Opens another Space in a separate window (Tauri) or tab (browser); does not change current window's spaceId. */
  openSpaceInNewWindow: (spaceId: string) => Promise<SpaceSwitchOutcome>
}

const SessionContext = createContext<SessionContextType | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [spaceId, setSpaceIdState] = useState<string>(readInitialSpaceId)
  const [spaces, setSpaces] = useState<SpaceMeta[]>([])
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  /** Always latest id for polling — avoids stale closure resetting selection every interval. */
  const activeSessionIdRef = useRef<string | null>(null)
  activeSessionIdRef.current = activeSessionId

  const setSpaceId = useCallback((id: string) => {
    try { localStorage.setItem(SPACE_STORAGE_KEY, id) } catch { /* ignore */ }
    setSpaceIdState(id)
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/sessions${qsSpace(spaceId)}`)
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
  }, [spaceId])

  const refreshSpaces = useCallback(async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/spaces`)
      if (!res.ok) {
        setSpaces([{ id: 'default', label: '默认 Space' }])
        return
      }
      const data = (await res.json()) as SpaceMeta[]
      const next =
        Array.isArray(data) && data.length > 0
          ? data
          : [{ id: 'default', label: '默认 Space' }]
      setSpaces(next)
    } catch {
      setSpaces([{ id: 'default', label: '默认 Space' }])
    }
  }, [])

  const createSession = useCallback(async (): Promise<string> => {
    const res = await fetch(`${SIDECAR_URL}/sessions${qsSpace(spaceId)}`, { method: 'POST' })
    const session: SessionMeta = await res.json()
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [spaceId])

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

  const openSpaceInNewWindow = useCallback(async (targetSpaceId: string): Promise<SpaceSwitchOutcome> => {
    const ok = await openAndFocusSpace(targetSpaceId)
    return ok ? 'focused' : 'failed'
  }, [])

  useEffect(() => {
    void refreshSpaces()
  }, [refreshSpaces])

  // Refresh when space changes (same dependency chain as polling)
  useEffect(() => {
    void refreshSessions()
  }, [refreshSessions])

  // Poll sessions periodically so the sidebar stays fresh
  useEffect(() => {
    const interval = setInterval(() => {
      void refreshSessions()
    }, 5000)
    return () => clearInterval(interval)
  }, [refreshSessions])

  return (
    <SessionContext.Provider value={{
      spaceId,
      setSpaceId,
      spaces,
      refreshSpaces,
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      deleteSession,
      refreshSessions,
      openSpaceInNewWindow,
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
