/**
 * Kevin v1.5 — Sidecar /config + SSE sync for User Tier settings.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { SIDECAR_URL } from '../config/sidecarUrl'

export interface KevinConfigPayload {
  onboardingComplete: boolean
  modelList: string[]
  modelDefault: string
  user: {
    apiKeyConfigured: boolean
    modelName: string
    baseUrl: string | null
  }
}

interface ConfigContextValue {
  config: KevinConfigPayload | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<KevinConfigPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${SIDECAR_URL}/config`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as KevinConfigPayload
      setConfig(data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setConfig(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const es = new EventSource(`${SIDECAR_URL}/events/config`)
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as { type?: string }
        if (msg.type === 'config_changed') void refresh()
      } catch {
        /* ignore */
      }
    }
    es.onerror = () => {
      /* EventSource auto-reconnects */
    }
    return () => es.close()
  }, [refresh])

  return (
    <ConfigContext.Provider value={{ config, loading, error, refresh }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useKevinConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useKevinConfig must be used within ConfigProvider')
  return ctx
}
