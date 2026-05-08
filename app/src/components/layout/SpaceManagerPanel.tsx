import { useMemo, useState } from 'react'
import type { SpaceMeta } from '../../contexts/SessionContext'

export function SpaceManagerPanel({
  open,
  spaces,
  currentSpaceId,
  onClose,
  onSwitchSpace,
  onCreateSpace,
  onOpenInNewWindow,
}: {
  open: boolean
  spaces: SpaceMeta[]
  currentSpaceId: string
  onClose: () => void
  onSwitchSpace: (spaceId: string) => void
  onCreateSpace: (mountPath: string, displayName?: string) => Promise<void>
  onOpenInNewWindow: (spaceId: string) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [mountPath, setMountPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const currentSpace = useMemo(
    () => spaces.find((s) => s.id === currentSpaceId) ?? null,
    [spaces, currentSpaceId],
  )

  if (!open) return null

  const submitCreate = async () => {
    if (!mountPath.trim()) {
      setErr('请填写 Library 挂载目录（绝对路径）')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await onCreateSpace(mountPath.trim(), displayName.trim() || undefined)
      setDisplayName('')
      setMountPath('')
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
        zIndex: 960,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          width: 'min(920px, 94vw)',
          height: 'min(620px, 88vh)',
          borderRadius: '14px',
          border: '1px solid var(--color-outline-variant)',
          background: 'var(--color-surface)',
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1fr) minmax(380px, 1.2fr)',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ borderRight: '1px solid var(--color-outline-variant)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 16px 10px', borderBottom: '1px solid var(--color-outline-variant)' }}>
            <div style={{ fontSize: '18px', fontWeight: 700 }}>Space</div>
            <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
              选择现有 Space，或在右侧新建
            </div>
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {spaces.map((space) => {
              const active = space.id === currentSpaceId
              return (
                <button
                  key={space.id}
                  type="button"
                  onClick={() => onSwitchSpace(space.id)}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: active ? 'var(--color-surface-container)' : 'transparent',
                    borderRadius: '10px',
                    textAlign: 'left',
                    padding: '10px 12px',
                    marginBottom: '4px',
                    cursor: 'pointer',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <div style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{space.label || space.id}</span>
                    {active ? <span style={{ color: 'var(--color-primary)', fontSize: '12px' }}>当前</span> : null}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--color-on-surface-variant)' }}>{space.id}</div>
                  <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-on-surface-variant)' }}>
                    {space.mountPath || '挂载路径未知'}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>新建 Space</div>
              <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
                Space 与 Library 一对一绑定
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ border: 'none', background: 'transparent', fontSize: '20px', color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}
              aria-label="关闭"
            >
              ×
            </button>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label htmlFor="space-manager-display-name" style={{ fontSize: '12px', fontWeight: 600 }}>
              显示名称（可选）
            </label>
            <input
              id="space-manager-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：工作库 / health / docs"
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-outline-variant)' }}
            />
            <label htmlFor="space-manager-mount-path" style={{ fontSize: '12px', fontWeight: 600 }}>
              Library 挂载路径（绝对路径）
            </label>
            <input
              id="space-manager-mount-path"
              type="text"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
              placeholder="/Users/you/Documents/MyVault"
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-outline-variant)' }}
            />
            {err ? (
              <div style={{ color: 'var(--color-error)', fontSize: '12px' }}>{err}</div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitCreate()}
              style={{
                marginTop: '4px',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 12px',
                fontWeight: 700,
                cursor: busy ? 'wait' : 'pointer',
                color: 'var(--color-on-primary)',
                background: 'var(--color-primary)',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? '创建中…' : '创建 Space'}
            </button>
          </div>

          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-outline-variant)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>当前 Space</div>
              <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentSpace?.label ?? currentSpaceId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onOpenInNewWindow(currentSpaceId)}
              style={{
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface-container-lowest)',
                color: 'var(--color-on-surface)',
                borderRadius: '8px',
                padding: '8px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              在新窗口打开
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
