import { useMemo, useState } from 'react'
import type { SpaceMeta } from '../../contexts/SessionContext'
import { LibraryMountPathPicker } from '../common/LibraryMountPathPicker'

export function SpaceManagerPanel({
  open,
  spaces,
  currentSpaceId,
  onClose,
  onSwitchSpace,
  onCreateSpace,
  onOpenInNewWindow,
  onRenameSpace,
  onDeleteSpace,
}: {
  open: boolean
  spaces: SpaceMeta[]
  currentSpaceId: string
  onClose: () => void
  onSwitchSpace: (spaceId: string) => void
  onCreateSpace: (mountPath: string, displayName?: string) => Promise<void>
  onOpenInNewWindow: (spaceId: string) => Promise<void>
  onRenameSpace?: (spaceId: string, displayName: string) => Promise<void>
  onDeleteSpace?: (spaceId: string) => Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [mountPath, setMountPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [renameForId, setRenameForId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameErr, setRenameErr] = useState<string | null>(null)

  const currentSpace = useMemo(
    () => spaces.find((s) => s.id === currentSpaceId) ?? null,
    [spaces, currentSpaceId],
  )

  if (!open) return null

  const submitCreate = async () => {
    if (!mountPath.trim()) {
      setErr('请选择或填写 Library 挂载目录（绝对路径）')
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

  const beginRename = (space: SpaceMeta) => {
    setRenameErr(null)
    setRenameForId(space.id)
    setRenameDraft(space.label || space.id)
  }

  const cancelRename = () => {
    setRenameForId(null)
    setRenameDraft('')
    setRenameErr(null)
  }

  const submitRename = async () => {
    if (!onRenameSpace || !renameForId) return
    const name = renameDraft.trim()
    if (!name) {
      setRenameErr('显示名称不能为空')
      return
    }
    setRenameBusy(true)
    setRenameErr(null)
    try {
      await onRenameSpace(renameForId, name)
      cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRenameBusy(false)
    }
  }

  const confirmDelete = async (space: SpaceMeta) => {
    if (!onDeleteSpace) return
    const ok = window.confirm(
      `确定删除 Space「${space.label || space.id}」？\n将移除注册信息并删除该 Library 的本地会话数据库（文档库目录不会删除）。`,
    )
    if (!ok) return
    setRenameErr(null)
    setRenameBusy(true)
    try {
      await onDeleteSpace(space.id)
      if (renameForId === space.id) cancelRename()
    } catch (e: unknown) {
      setRenameErr(e instanceof Error ? e.message : String(e))
    } finally {
      setRenameBusy(false)
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
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Space</div>
            <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
              选择现有 Space，或在右侧新建
            </div>
          </div>
          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {renameErr ? (
              <div style={{ color: 'var(--color-error)', fontSize: '11px', marginBottom: '8px', padding: '0 4px' }}>
                {renameErr}
              </div>
            ) : null}
            {spaces.map((space) => {
              const active = space.id === currentSpaceId
              const editing = renameForId === space.id
              return (
                <div
                  key={space.id}
                  style={{
                    marginBottom: '8px',
                    borderRadius: '10px',
                    border: active ? '1px solid var(--color-primary)' : '1px solid transparent',
                    background: active ? 'var(--color-surface-container)' : 'transparent',
                    padding: '8px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <button
                      type="button"
                      onClick={() => onSwitchSpace(space.id)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        border: 'none',
                        background: 'transparent',
                        borderRadius: '8px',
                        textAlign: 'left',
                        padding: '4px 6px',
                        cursor: 'pointer',
                        color: 'var(--color-on-surface)',
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{space.label || space.id}</span>
                        {active ? <span style={{ color: 'var(--color-primary)', fontSize: '12px' }}>当前</span> : null}
                      </div>
                      <div style={{ fontSize: '11px', marginTop: '3px', color: 'var(--color-on-surface-variant)' }}>{space.id}</div>
                      <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--color-on-surface-variant)' }}>
                        {space.mountPath || '挂载路径未知'}
                      </div>
                    </button>
                    {onRenameSpace || onDeleteSpace ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                        {onRenameSpace ? (
                          <button
                            type="button"
                            disabled={renameBusy}
                            onClick={() => (editing ? cancelRename() : beginRename(space))}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-outline-variant)',
                              background: 'var(--color-surface-container-lowest)',
                              cursor: renameBusy ? 'wait' : 'pointer',
                              color: 'var(--color-on-surface)',
                            }}
                          >
                            {editing ? '取消' : '重命名'}
                          </button>
                        ) : null}
                        {onDeleteSpace ? (
                          <button
                            type="button"
                            disabled={renameBusy}
                            onClick={() => void confirmDelete(space)}
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '4px 8px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-error)',
                              background: 'transparent',
                              cursor: renameBusy ? 'wait' : 'pointer',
                              color: 'var(--color-error)',
                            }}
                          >
                            删除
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {editing && onRenameSpace ? (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <input
                        type="text"
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        disabled={renameBusy}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--color-outline-variant)',
                          fontSize: '12px',
                        }}
                      />
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          disabled={renameBusy}
                          onClick={() => void submitRename()}
                          style={{
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: renameBusy ? 'wait' : 'pointer',
                            color: 'var(--color-on-primary)',
                            background: 'var(--color-primary)',
                          }}
                        >
                          {renameBusy ? '保存中…' : '保存'}
                        </button>
                        <button
                          type="button"
                          disabled={renameBusy}
                          onClick={cancelRename}
                          style={{
                            border: '1px solid var(--color-outline-variant)',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: renameBusy ? 'wait' : 'pointer',
                            background: 'var(--color-surface)',
                          }}
                        >
                          关闭
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid var(--color-outline-variant)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>新建 Space</div>
              <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
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
            <label htmlFor="space-manager-display-name" style={{ fontSize: '11px', fontWeight: 600 }}>
              显示名称（可选）
            </label>
            <input
              id="space-manager-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例如：工作库 / health / docs"
              style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--color-outline-variant)', fontSize: '13px' }}
            />
            <label htmlFor="space-manager-mount-path" style={{ fontSize: '11px', fontWeight: 600, marginTop: '4px' }}>
              Library 挂载路径
            </label>
            <LibraryMountPathPicker
              value={mountPath}
              onChange={setMountPath}
              disabled={busy}
              inputId="space-manager-mount-path"
            />
            {err ? (
              <div style={{ color: 'var(--color-error)', fontSize: '11px' }}>{err}</div>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => void submitCreate()}
              style={{
                marginTop: '4px',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 12px',
                fontSize: '13px',
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
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-on-surface-variant)' }}>当前 Space</div>
              <div style={{ fontSize: '12px', fontWeight: 600, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
