/**
 * Kevin v1.5 — Global settings (writes User Tier config.enc via Sidecar).
 */

import { useEffect, useState } from 'react'
import { SIDECAR_URL } from '../../config/sidecarUrl'

export function SettingsPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [modelList, setModelList] = useState<string[]>([])
  const [modelDefault, setModelDefault] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setErr(null)
    fetch(`${SIDECAR_URL}/config`)
      .then((r) => r.json())
      .then(
        (c: {
          modelList: string[]
          modelDefault: string
          user: { modelName: string; baseUrl: string | null }
        }) => {
          setModelList(c.modelList ?? [])
          setModelDefault(c.modelDefault ?? '')
          setModelName(c.user?.modelName ?? c.modelDefault ?? '')
          setBaseUrl(c.user?.baseUrl ?? '')
          setApiKey('')
        },
      )
      .catch(() => undefined)
  }, [open])

  if (!open) return null

  const save = async () => {
    setBusy(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = {
        modelName: modelName || modelDefault,
        baseUrl: baseUrl.trim() || undefined,
      }
      if (apiKey.trim()) body.anthropicApiKey = apiKey.trim()
      const s = await fetch(`${SIDECAR_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const sr = await s.json().catch(() => ({}))
      if (!s.ok || sr.ok === false) {
        setErr(typeof sr.error === 'string' ? sr.error : 'Save failed')
        return
      }
      await onSaved()
      onClose()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          padding: '24px',
          borderRadius: '16px',
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>设置</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '20px',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            ×
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', margin: '8px 0 16px' }}>
          修改 API Key 或模型后保存；留空 API Key 则保留已保存的密钥。
        </p>

        <label style={{ fontSize: '12px', fontWeight: 600 }}>模型</label>
        <select
          value={modelName || modelDefault}
          onChange={(e) => setModelName(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 10px',
            margin: '6px 0 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
          }}
        >
          {(modelList.length ? modelList : [modelDefault].filter(Boolean)).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label style={{ fontSize: '12px', fontWeight: 600 }}>API Key（可选覆盖）</label>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="留空则不修改"
          style={{
            width: '100%',
            padding: '8px 10px',
            margin: '6px 0 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
          }}
        />

        <label style={{ fontSize: '12px', fontWeight: 600 }}>网关 Base URL</label>
        <input
          type="url"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="可选"
          style={{
            width: '100%',
            padding: '8px 10px',
            margin: '6px 0 12px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
          }}
        />

        {err && (
          <div style={{ color: 'var(--color-error)', fontSize: '13px', marginBottom: '10px' }}>{err}</div>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          style={{
            width: '100%',
            padding: '10px',
            fontWeight: 600,
            borderRadius: '8px',
            border: 'none',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
