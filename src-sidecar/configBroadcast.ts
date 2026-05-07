/** SSE subscribers for Kevin v1.5 config_changed (multi-window sync). */

type Sender = (line: string) => void

const subscribers = new Set<Sender>()

export function subscribeConfigSse(send: Sender): () => void {
  subscribers.add(send)
  return () => {
    subscribers.delete(send)
  }
}

export function broadcastConfigChanged(): void {
  const payload = JSON.stringify({ type: 'config_changed', ts: Date.now() })
  for (const send of subscribers) {
    try {
      send(`data: ${payload}\n\n`)
    } catch {
      /* ignore */
    }
  }
}
