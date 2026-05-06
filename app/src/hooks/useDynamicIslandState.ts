import { useMemo } from 'react'

export type IslandMode = 'idle' | 'running' | 'awaiting_signoff' | 'completed_transient'

export type IslandEvent =
  | { type: 'task.started'; taskName?: string; eta?: string }
  | { type: 'task.progress'; taskName?: string; eta?: string }
  | { type: 'task.awaiting_signoff'; pendingCount?: number }
  | { type: 'task.completed'; summary?: string }

export type DynamicIslandState = {
  mode: IslandMode
  label: string
}

const PRIORITY: Record<IslandMode, number> = {
  idle: 0,
  completed_transient: 1,
  running: 2,
  awaiting_signoff: 3,
}

function toState(event: IslandEvent): DynamicIslandState {
  if (event.type === 'task.awaiting_signoff') {
    const pending = event.pendingCount ?? 1
    return {
      mode: 'awaiting_signoff',
      label: `${pending} item${pending > 1 ? 's' : ''} need sign-off`,
    }
  }

  if (event.type === 'task.started' || event.type === 'task.progress') {
    const task = event.taskName ?? 'Working...'
    return {
      mode: 'running',
      label: event.eta ? `${task} · ETA ${event.eta}` : task,
    }
  }

  return {
    mode: 'completed_transient',
    label: event.summary ?? 'Task completed',
  }
}

export function reduceIslandState(events: IslandEvent[]): DynamicIslandState {
  let state: DynamicIslandState = { mode: 'idle', label: 'Session ready' }
  for (const event of events) {
    const next = toState(event)
    if (PRIORITY[next.mode] >= PRIORITY[state.mode]) {
      state = next
    }
  }
  return state
}

export function useDynamicIslandState(events: IslandEvent[]): DynamicIslandState {
  return useMemo(() => reduceIslandState(events), [events])
}

