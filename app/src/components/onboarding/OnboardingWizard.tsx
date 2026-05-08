/**
 * Kevin v1.5 — First-run wizard: API credentials then Rev3 Library mount (registry bootstrap).
 */

import { useEffect, useState } from 'react'
import { SIDECAR_URL } from '../../config/sidecarUrl'
import { isUuidString } from '../../lib/isUuid'

const SPACE_STORAGE_KEY = 'kevin:active-space-id'

type WizardStep = 'model' | 'library'

export function OnboardingWizard({ onComplete }: { onComplete: () => Promise<void> }) {
  const [step, setStep] = useState<WizardStep>('model')
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [mountPath, setMountPath] = useState('')
  const [libraryLabel, setLibraryLabel] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const [modelList, setModelList] = useState<string[]>([])
  const [modelDefault, setModelDefault] = useState('')

  useEffect(() => {
    fetch(`${SIDECAR_URL}/config`)
      .then((r) => r.json())
      .then((c: {
        modelList: string[]
        modelDefault: string
        user?: { apiKeyConfigured?: boolean }
        libraryConfigured?: boolean
      }) => {
        setModelList(c.modelList ?? [])
        const def = c.modelDefault ?? ''
        setModelDefault(def)
        setModelName((prev) => prev || def)
        if (c.user?.apiKeyConfigured && !c.libraryConfigured) {
          setStep('library')
        }
      })
      .catch(() => undefined)
  }, [])

  const submitModelStep = async () => {
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
        return
      }
      const s = await fetch(`${SIDECAR_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anthropicApiKey: apiKey,
          modelName: modelName || modelDefault,
          baseUrl: baseUrl.trim() || undefined,
          onboardingComplete: false,
        }),
      })
      const sr = await s.json().catch(() => ({}))
      if (!s.ok || sr.ok === false) {
        setErr(typeof sr.error === 'string' ? sr.error : 'Save failed')
        return
      }
      setStep('library')
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const submitLibraryStep = async () => {
    const mp = mountPath.trim()
    if (!mp) {
      setErr('请填写文档库目录（绝对路径）')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const br = await fetch(`${SIDECAR_URL}/registry/bootstrap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mountPath: mp,
          displayName: libraryLabel.trim() || undefined,
        }),
      })
      const boot = await br.json().catch(() => ({}))
      if (!br.ok) {
        setErr(typeof boot.error === 'string' ? boot.error : '创建文档库失败')
        return
      }
      const spaceId = typeof boot.spaceId === 'string' ? boot.spaceId : ''
      if (!isUuidString(spaceId)) {
        setErr('服务端返回的 Space id 无效')
        return
      }
      try {
        localStorage.setItem(SPACE_STORAGE_KEY, spaceId)
      } catch { /* ignore */ }
      const u = new URL(window.location.href)
      u.searchParams.set('space_id', spaceId)
      window.history.replaceState({}, '', u.toString())

      const fin = await fetch(`${SIDECAR_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingComplete: true }),
      })
      const fr = await fin.json().catch(() => ({}))
      if (!fin.ok || fr.ok === false) {
        setErr(typeof fr.error === 'string' ? fr.error : '完成设置失败')
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
        {step === 'model' && (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>欢迎使用 Kevin</h1>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
              选择模型并填入 API Key。下一步将绑定本地文档库目录。
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
          </>
        )}

        {step === 'library' && (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 700 }}>绑定文档库</h1>
            <p style={{ margin: '0 0 20px', fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
              Rev3：文档库根目录为你选择的本地文件夹（Library 挂载）。会话与索引将写入对应库目录。
            </p>

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              显示名称（可选）
            </label>
            <input
              type="text"
              value={libraryLabel}
              onChange={(e) => setLibraryLabel(e.target.value)}
              placeholder="我的工作库"
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: '12px',
                borderRadius: '8px',
                border: '1px solid var(--color-outline-variant)',
                fontSize: '14px',
              }}
            />

            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
              文档库目录（绝对路径）
            </label>
            <input
              type="text"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
              placeholder="/Users/you/Documents/KevinVault"
              style={{
                width: '100%',
                padding: '10px 12px',
                marginBottom: '16px',
                borderRadius: '8px',
                border: '1px solid var(--color-outline-variant)',
                fontSize: '14px',
              }}
            />
          </>
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

        {step === 'model' && (
          <button
            type="button"
            disabled={busy || !apiKey.trim()}
            onClick={() => void submitModelStep()}
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
            {busy ? '验证中…' : '下一步'}
          </button>
        )}

        {step === 'library' && (
          <button
            type="button"
            disabled={busy || !mountPath.trim()}
            onClick={() => void submitLibraryStep()}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '15px',
              fontWeight: 600,
              border: 'none',
              borderRadius: '10px',
              cursor: busy || !mountPath.trim() ? 'not-allowed' : 'pointer',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              opacity: busy || !mountPath.trim() ? 0.6 : 1,
            }}
          >
            {busy ? '创建中…' : '验证并进入'}
          </button>
        )}
      </div>
    </div>
  )
}
