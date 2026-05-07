import { useRef, useState } from 'react'
import { DynamicIsland } from './DynamicIsland'
import { AccountMenu } from './AccountMenu'
import type { DynamicIslandState } from '../../hooks/useDynamicIslandState'

export function AppHeader({
  onOpenSettings,
  onOpenNotifications,
  islandState,
  notifyBadge = false,
}: {
  onOpenSettings?: () => void
  onOpenNotifications?: () => void
  islandState: DynamicIslandState
  notifyBadge?: boolean
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)

  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '56px',
        padding: '0 24px',
        backgroundColor: 'var(--color-surface-container-lowest)',
        borderBottom: '1px solid var(--color-outline-variant)',
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {/* Left: Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--color-on-surface)', minWidth: 0, flex: 1 }}>
        <span className="material-symbols-outlined filled" style={{ color: 'var(--color-primary)', fontSize: '22px' }}>terminal</span>
        Kevin
      </div>

      {/* Center: DynamicIsland */}
      <DynamicIsland state={islandState} />

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <button
          type="button"
          aria-label="通知"
          onClick={() => onOpenNotifications?.()}
          style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)', position: 'relative' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>notifications</span>
          {notifyBadge && (
            <span style={{ position: 'absolute', top: '8px', right: '8px', width: '7px', height: '7px', background: 'var(--color-error)', borderRadius: '50%' }} />
          )}
        </button>

        <button
          type="button"
          aria-label="设置"
          onClick={() => onOpenSettings?.()}
          style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>settings</span>
        </button>

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-outline-variant)', margin: '0 4px' }} />

        {/* Avatar → AccountMenu */}
        <button
          ref={avatarRef}
          type="button"
          aria-label="账户"
          onClick={() => setAccountOpen((v) => !v)}
          style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--color-primary-container)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
        >
          K
        </button>

        <AccountMenu
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          anchorRef={avatarRef}
          userName="Kevin 用户"
          onResetConfig={() => {
            localStorage.clear()
            window.location.reload()
          }}
        />
      </div>
    </header>
  )
}
