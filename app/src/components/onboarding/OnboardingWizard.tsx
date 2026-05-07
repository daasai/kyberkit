/**
 * Kevin v1.5 — First-run wizard (PRD §8.5). Blocks main UI until validate succeeds.
 */

import { useEffect, useState } from 'react'
import { SIDECAR_URL } from '../../config/sidecarUrl'

export function OnboardingWizard({ onComplete }: { onComplete: () => Promise<void> }) {
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [modelList, setModelList] = useState<string[]>([])
  const [modelDefault, setModelDefault] = useState('')

  useEffect(() => {
    fetch(`${SIDECAR_URL}/config`)
      .then((r) => r.json())
      .then((c: { modelList: string[]; modelDefault: string }) => {
        setModelList(c.modelList ?? [])
        const def = c.modelDefault ?? ''
        setModelDefault(def)
        setModelName((prev) => prev || def)
      })
      .catch(() => undefined)
  }, [])

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const v = await fetch(`${SIDECAR_URL}/config/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: apiKey,
          modelName: modelName || modelDefault,
          baseUrl: baseUrl.trim() || undefined,
        }),
      })
      const vr = await v.json().catch(() => ({}))
      if (!v.ok || vr.ok === false) {
        setErr(typeof vr.error === 'string' ? vr.error : 'Validation failed')
        setBusy(false)
        return
      }
      const s = await fetch(`${SIDECAR_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: apiKey,
          modelName: modelName || modelDefault,
          baseUrl: baseUrl.trim() || undefined,
          onboardingComplete: true,
        }),
      })
      const sr = await s.json().catch(() => ({}))
      if (!s.ok || sr.ok === false) {
        setErr(typeof sr.error === 'string' ? sr.error : 'Save failed')
        setBusy(false)
        return
      }
      await onComplete()
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-container-lowest)',
      }}
    >
      <div
        style={{
          width: 'min(440px, 92vw)',
          padding: '28px',
          borderRadius: '16px',
          border: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface-container)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.12)',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>欢迎使用 Kevin</h1>
        <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
          选择模型并填入 API Key，验证通过后即可开始。
        </p>

        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
          模型
        </label>
        <select
          value={modelName || modelDefault}
          onChange={(e) => setModelName(e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            marginBottom: '16px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
            fontSize: '14px',
          }}
        >
          {(modelList.length ? modelList : [modelDefault].filter(Boolean)).map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
          API Key
        </label>
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="ANTHROPIC_API_KEY"
          style={{
            width: '100%',
            padding: '10px 12px',
            marginBottom: '12px',
            borderRadius: '8px',
            border: '1px solid var(--color-outline-variant)',
            fontSize: '14px',
          }}
        />

        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            fontSize: '13px',
            marginBottom: '12px',
            padding: 0,
          }}
        >
          {showAdvanced ? '收起' : '自定义接入地址（可选）'}
        </button>

        {showAdvanced && (
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="KYBER_MODEL_BASE_URL"
            style={{
              width: '100%',
              padding: '10px 12px',
              marginBottom: '16px',
              borderRadius: '8px',
              border: '1px solid var(--color-outline-variant)',
              fontSize: '14px',
            }}
          />
        )}

        {err && (
          <div
            style={{
              padding: '10px 12px',
              marginBottom: '12px',
              borderRadius: '8px',
              background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
              color: 'var(--color-error)',
              fontSize: '13px',
            }}
          >
            {err}
          </div>
        )}

        <button
          type="button"
          disabled={busy || !apiKey.trim()}
          onClick={() => void submit()}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '15px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '10px',
            cursor: busy || !apiKey.trim() ? 'not-allowed' : 'pointer',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            opacity: busy || !apiKey.trim() ? 0.6 : 1,
          }}
        >
          {busy ? '验证中…' : '验证并进入'}
        </button>
      </div>
    </div>
  )
}
