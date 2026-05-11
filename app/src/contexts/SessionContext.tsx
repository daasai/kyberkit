/**
 * SessionContext — global session state for the Kevin UI.
 *
 * Holds the active session ID and the list of all sessions fetched from Sidecar.
 * Components use this to know which session to send messages to and which
 * artifact to display in the CenterPanel.
 */

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { SIDECAR_URL, qsSpace } from '../config/sidecarUrl'
import { isUuidString } from '../lib/isUuid'
import { openAndFocusSpace, type SpaceSwitchOutcome } from '../lib/tauriSpace'

const SPACE_STORAGE_KEY = 'kevin:active-space-id'

export interface SpaceMeta {
  id: string
  label: string
  libraryId?: string
  mountPath?: string
}

function syncUrlSpaceId(spaceId: string): void {
  if (typeof window === 'undefined') return
  try {
    const u = new URL(window.location.href)
    if (!spaceId) u.searchParams.delete('space_id')
    else u.searchParams.set('space_id', spaceId)
    window.history.replaceState({}, '', u.toString())
  } catch {
    // ignore URL sync failures
  }
}

function readInitialSpaceId(): string {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('space_id')?.trim()
      if (q && isUuidString(q)) {
        localStorage.setItem(SPACE_STORAGE_KEY, q)
        return q
      }
      const stored = localStorage.getItem(SPACE_STORAGE_KEY)?.trim()
      if (stored && isUuidString(stored)) return stored
    }
  } catch { /* ignore */ }
  return ''
}

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  artifactPreview?: string
  pinned?: boolean
}

interface SessionContextType {
  spaceId: string
  setSpaceId: (id: string) => void
  spaces: SpaceMeta[]
  refreshSpaces: () => Promise<SpaceMeta[]>
  createSpaceLibrary: (mountPath: string, displayName?: string) => Promise<SpaceMeta>
  updateSpaceDisplayName: (spaceId: string, displayName: string) => Promise<void>
  deleteSpace: (spaceId: string) => Promise<void>
  sessions: SessionMeta[]
  activeSessionId: string | null
  setActiveSessionId: (id: string) => void
  createSession: () => Promise<string>
  deleteSession: (id: string) => Promise<void>
  refreshSessions: () => Promise<void>
  pinSession: (id: string, pinned: boolean) => Promise<void>
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
    try {
      if (id) localStorage.setItem(SPACE_STORAGE_KEY, id)
      else localStorage.removeItem(SPACE_STORAGE_KEY)
    } catch { /* ignore */ }
    // Prevent stale session id from leaking across spaces.
    setActiveSessionId(null)
    setSessions([])
    syncUrlSpaceId(id)
    setSpaceIdState(id)
  }, [])

  const refreshSessions = useCallback(async () => {
    if (!spaceId) return
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

  const pinSession = useCallback(
    async (id: string, pinned: boolean) => {
      if (!spaceId) return
      const res = await fetch(`${SIDECAR_URL}/sessions/${id}${qsSpace(spaceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      })
      if (!res.ok) return
      await refreshSessions()
    },
    [spaceId, refreshSessions],
  )

  const refreshSpaces = useCallback(async (): Promise<SpaceMeta[]> => {
    try {
      const res = await fetch(`${SIDECAR_URL}/spaces`)
      if (!res.ok) {
        setSpaces([])
        return []
      }
      const data = (await res.json()) as Array<{
        id?: string
        label?: string
        libraryId?: string
        mountPath?: string
      }>
      const next = Array.isArray(data)
        ? data
            .filter((row) => typeof row?.id === 'string' && row.id.trim().length > 0)
            .map((row) => ({
              id: String(row.id).trim(),
              label: typeof row.label === 'string' && row.label.trim() ? row.label.trim() : String(row.id).trim(),
              libraryId: typeof row.libraryId === 'string' ? row.libraryId : undefined,
              mountPath: typeof row.mountPath === 'string' ? row.mountPath : undefined,
            }))
        : []
      setSpaces(next)
      return next
    } catch {
      setSpaces([])
      return []
    }
  }, [])

  const createSession = useCallback(async (): Promise<string> => {
    if (!spaceId) throw new Error('No active Space')
    const res = await fetch(`${SIDECAR_URL}/sessions${qsSpace(spaceId)}`, { method: 'POST' })
    const session: SessionMeta = await res.json()
    setSessions(prev => [session, ...prev])
    setActiveSessionId(session.id)
    return session.id
  }, [spaceId])

  const createSpaceLibrary = useCallback(async (mountPath: string, displayName?: string): Promise<SpaceMeta> => {
    const body = JSON.stringify({
      mountPath: mountPath.trim(),
      displayName: displayName?.trim() || undefined,
    })
    let res = await fetch(`${SIDECAR_URL}/registry/spaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    // Compatibility fallback for old sidecar builds that do not expose /registry/spaces yet.
    if (res.status === 404) {
      res = await fetch(`${SIDECAR_URL}/registry/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
    }
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      spaceId?: string
      displayName?: string
      libraryId?: string
      mountPath?: string
    }
    if (!res.ok || !data.spaceId || !isUuidString(data.spaceId)) {
      const msg = typeof data.error === 'string' ? data.error : `Create space failed (${res.status})`
      throw new Error(msg)
    }
    const next: SpaceMeta = {
      id: data.spaceId,
      label: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : data.spaceId,
      libraryId: typeof data.libraryId === 'string' ? data.libraryId : undefined,
      mountPath: typeof data.mountPath === 'string' ? data.mountPath : undefined,
    }
    setSpaces((prev) => [next, ...prev.filter((s) => s.id !== next.id)])
    setSpaceId(next.id)
    return next
  }, [setSpaceId])

  const updateSpaceDisplayName = useCallback(async (targetSpaceId: string, displayName: string) => {
    const res = await fetch(`${SIDECAR_URL}/registry/spaces/${targetSpaceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    })
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) {
      const msg = typeof data.error === 'string' ? data.error : `Rename failed (${res.status})`
      throw new Error(msg)
    }
    await refreshSpaces()
  }, [refreshSpaces])

  const deleteSpace = useCallback(
    async (targetSpaceId: string) => {
      const res = await fetch(`${SIDECAR_URL}/registry/spaces/${targetSpaceId}`, { method: 'DELETE' })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : `Delete Space failed (${res.status})`
        throw new Error(msg)
      }
      const wasCurrent = targetSpaceId === spaceId
      const next = await refreshSpaces()
      if (wasCurrent) {
        const first = next[0]?.id ?? ''
        if (first) setSpaceId(first)
        else setSpaceId('')
      }
    },
    [spaceId, refreshSpaces, setSpaceId],
  )

  const deleteSession = useCallback(async (id: string) => {
    if (!spaceId) return
    await fetch(`${SIDECAR_URL}/sessions/${id}${qsSpace(spaceId)}`, { method: 'DELETE' })
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id)
      if (activeSessionIdRef.current === id) {
        setActiveSessionId(filtered[0]?.id ?? null)
      }
      return filtered
    })
  }, [spaceId])

  const openSpaceInNewWindow = useCallback(async (targetSpaceId: string): Promise<SpaceSwitchOutcome> => {
    const ok = await openAndFocusSpace(targetSpaceId)
    return ok ? 'focused' : 'failed'
  }, [])

  useEffect(() => {
    void refreshSpaces()
  }, [refreshSpaces])

  /** Pick first Space when URL/storage missing or stale (after onboarding). */
  useEffect(() => {
    if (spaces.length === 0) return
    const known = spaces.some((s) => s.id === spaceId)
    if (!spaceId || !known) {
      setSpaceId(spaces[0].id)
    }
  }, [spaces, spaceId, setSpaceId])

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
      createSpaceLibrary,
      updateSpaceDisplayName,
      deleteSpace,
      sessions,
      activeSessionId,
      setActiveSessionId,
      createSession,
      deleteSession,
      refreshSessions,
      pinSession,
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
