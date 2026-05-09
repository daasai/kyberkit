import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../config/sidecarUrl'

export interface SignoffTaskPayload {
  actuatorId?: string
  title?: string
  diff?: { added: string[]; removed: string[]; preview: string }
  bodyMarkdown?: string
  priorBodyMarkdown?: string
  sessionId?: string
}

export interface PendingSignoffTask {
  id: string
  spaceId: string
  state: 'awaiting-signoff' | 'running' | 'completed' | 'cancelled' | 'failed'
  skillName: string | null
  createdAt: string
  updatedAt: string
  payload: SignoffTaskPayload | null
  /** Convenience: pulled out of payload.sessionId. */
  sessionId?: string | null
}

/**
 * Subscribe to per-Space SSE and surface tasks that currently await sign-off.
 * Used by RightPanel inline card, DynamicIsland pulse, and LeftSidebar red dot.
 *
 * Spec: PRD §10.2 / signoff-contract.md §3.
 */
export function usePendingSignoffs(spaceId: string | null): {
  pending: PendingSignoffTask[]
  refresh: () => Promise<void>
  resolve: (taskId: string, decision: 'approved' | 'rejected') => Promise<void>
  pendingBySession: Map<string, PendingSignoffTask>
} {
  const [pending, setPending] = useState<PendingSignoffTask[]>([])
  const eventSourceRef = useRef<EventSource | null>(null)

  const refresh = useCallback(async () => {
    if (!spaceId) {
      setPending([])
      return
    }
    try {
      const res = await fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
      if (!res.ok) return
      const list = (await res.json()) as Array<{
        id: string
        space_id: string
        state: PendingSignoffTask['state']
        skill_name: string | null
        created_at: string
        updated_at: string
        payload: string | null
      }>
      const next = list
        .filter((t) => t.state === 'awaiting-signoff')
        .map<PendingSignoffTask>((t) => {
          let parsed: SignoffTaskPayload | null = null
          try {
            parsed = t.payload ? (JSON.parse(t.payload) as SignoffTaskPayload) : null
          } catch {
            parsed = null
          }
          return {
            id: t.id,
            spaceId: t.space_id,
            state: t.state,
            skillName: t.skill_name,
            createdAt: t.created_at,
            updatedAt: t.updated_at,
            payload: parsed,
            sessionId: parsed?.sessionId ?? null,
          }
        })
      setPending(next)
    } catch {
      // network errors leave the existing list intact
    }
  }, [spaceId])

  const resolve = useCallback(
    async (taskId: string, decision: 'approved' | 'rejected') => {
      if (!spaceId) return
      try {
        await fetch(`${SIDECAR_URL}/signoff/${taskId}${qsSpace(spaceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        })
      } finally {
        await refresh()
      }
    },
    [spaceId, refresh],
  )

  useEffect(() => {
    if (!spaceId) {
      setPending([])
      return
    }
    void refresh()
    if (typeof EventSource === 'undefined') return
    const es = new EventSource(`${SIDECAR_URL}/events/space${qsSpace(spaceId)}`)
    eventSourceRef.current = es
    const onMsg = (ev: MessageEvent) => {
      try {
        const evt = JSON.parse(ev.data) as { type?: string; space_id?: string }
        if (evt.space_id && evt.space_id !== spaceId) return
        if (
          evt.type === 'signoff_required' ||
          evt.type === 'task_progress' ||
          evt.type === 'task_completed' ||
          evt.type === 'task_cancelled'
        ) {
          void refresh()
        }
      } catch {
        // ignore non-JSON pings
      }
    }
    es.addEventListener('message', onMsg)
    return () => {
      es.removeEventListener('message', onMsg)
      es.close()
      eventSourceRef.current = null
    }
  }, [spaceId, refresh])

  const pendingBySession = useMemo(() => {
    const map = new Map<string, PendingSignoffTask>()
    for (const t of pending) {
      if (t.sessionId) map.set(t.sessionId, t)
    }
    return map
  }, [pending])

  return { pending, refresh, resolve, pendingBySession }
}
