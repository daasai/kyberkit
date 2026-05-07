/**
 * 北极星指标埋点（PRD §15.1）— 本地可扩展收集器，后续可接遥测管道。
 */

export type NorthStarEventType =
  | 'onboarding_complete'
  | 'task_run'
  | 'forge_suggest'
  | 'forge_accept'
  | 'signoff_response'
  | 'sensor_status'

const buf: { t: string; name: NorthStarEventType; payload?: Record<string, unknown> }[] = []
const MAX = 500

export function recordNorthStar(
  name: NorthStarEventType,
  payload?: Record<string, unknown>,
): void {
  buf.push({ t: new Date().toISOString(), name, payload })
  if (buf.length > MAX) buf.splice(0, buf.length - MAX)
}

export function drainNorthStarBuffer(): typeof buf {
  return [...buf]
}
