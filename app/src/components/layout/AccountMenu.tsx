import { useEffect, useRef } from 'react'

type AccountMenuProps = {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
  userName: string
  userEmail?: string
  onResetConfig: () => void
}

export function AccountMenu({ open, onClose, anchorRef, userName, userEmail, onResetConfig }: AccountMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onPointer = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        top: '56px',
        right: '16px',
        zIndex: 200,
        minWidth: '200px',
        background: 'var(--color-surface-container-low)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        padding: '8px 0',
      }}
    >
      {/* 用户信息 */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface)' }}>{userName}</div>
        {userEmail && (
          <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '2px' }}>{userEmail}</div>
        )}
      </div>

      {/* 操作 */}
      <div style={{ padding: '4px 0' }}>
        <button
          type="button"
          aria-label="重置配置"
          onClick={() => { onResetConfig(); onClose() }}
          style={{
            width: '100%',
            padding: '8px 16px',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-error)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          重置配置
        </button>
      </div>
    </div>
  )
}
