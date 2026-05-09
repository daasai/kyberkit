import type { SkillSuggestionPayload } from '../src/types/skill-suggestion.js'
import type { TypedEventBus } from '../src/events/EventBus.js'
import type { KyberEvents } from '../src/types/events.js'

export interface SkillSuggestedSsePayload {
  type: 'skill.suggested'
  sessionId?: string
  spaceId?: string
  title: string
  summary?: string
  sourceTaskId?: string
  timestamp?: number
}

type SseEmit = (event: unknown) => void

const DEDUPE_WINDOW_MS = 1500

function pickSummary(payload: SkillSuggestionPayload): string | undefined {
  const markdown = payload.draft.markdown?.trim()
  if (!markdown) return undefined
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('---'))
    .filter((line) => !line.startsWith('#'))
  return lines[0]?.slice(0, 240)
}

export function toSkillSuggestedSsePayload(input: unknown): SkillSuggestedSsePayload {
  const payload = input as SkillSuggestionPayload & {
    sessionId?: string
    spaceId?: string
    timestamp?: number
  }
  return {
    type: 'skill.suggested',
    sessionId: payload.sessionId,
    spaceId: payload.spaceId,
    title: payload.draft.title,
    summary: pickSummary(payload),
    sourceTaskId: payload.draft.taskId,
    timestamp: payload.timestamp,
  }
}

export function createSpaceEventBroadcaster() {
  const listeners = new Set<SseEmit>()
  const lastSeen = new Map<string, number>()

  return {
    subscribe(listener: SseEmit): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    broadcastSkillSuggested(input: unknown, now = Date.now()): boolean {
      const event = toSkillSuggestedSsePayload(input)
      const dedupeKey = JSON.stringify({
        sessionId: event.sessionId ?? '',
        spaceId: event.spaceId ?? '',
        title: event.title,
        summary: event.summary ?? '',
        sourceTaskId: event.sourceTaskId ?? '',
      })
      const seenAt = lastSeen.get(dedupeKey)
      if (typeof seenAt === 'number' && now - seenAt <= DEDUPE_WINDOW_MS) {
        return false
      }
      lastSeen.set(dedupeKey, now)
      for (const emit of listeners) {
        emit(event)
      }
      return true
    },
  }
}

export function attachSkillSuggestedRuntimeBridge(
  bus: TypedEventBus<KyberEvents>,
  broadcaster: ReturnType<typeof createSpaceEventBroadcaster>,
): () => void {
  const sub = bus.on('skill.suggested', (payload) => {
    broadcaster.broadcastSkillSuggested(payload)
  })
  return () => sub.dispose()
}

/**
 * Sprint C — generic per-space SSE bus used by TaskManager and Sign-off flow.
 * Listeners subscribed via {@link subscribeSpaceEvents} only receive events
 * whose `space_id` matches the requested scope.
 */
export interface SpaceScopedEvent {
  type: string
  space_id: string
  [key: string]: unknown
}

const spaceListeners = new Map<string, Set<(event: SpaceScopedEvent) => void>>()

export function subscribeSpaceEvents(
  spaceId: string,
  emit: (event: SpaceScopedEvent) => void,
): () => void {
  let set = spaceListeners.get(spaceId)
  if (!set) {
    set = new Set()
    spaceListeners.set(spaceId, set)
  }
  set.add(emit)
  return () => {
    set!.delete(emit)
    if (set!.size === 0) spaceListeners.delete(spaceId)
  }
}

export function broadcastSpaceEvent(spaceId: string, event: Omit<SpaceScopedEvent, 'space_id'> & { space_id?: string }): void {
  const set = spaceListeners.get(spaceId)
  if (!set) return
  const enriched: SpaceScopedEvent = { ...event, space_id: spaceId }
  for (const emit of set) {
    try {
      emit(enriched)
    } catch {
      // listener errors must not poison broadcast
    }
  }
}

/** Test helper: clear all subscribers (used between tests). */
export function _resetSpaceSubscribers(): void {
  spaceListeners.clear()
}
