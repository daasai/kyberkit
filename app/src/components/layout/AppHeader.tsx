import { useRef, useState } from 'react'
import { DynamicIsland } from './DynamicIsland'
import { AccountMenu } from './AccountMenu'
import { HeaderSpaceSwitcher } from './HeaderSpaceSwitcher'
import type { DynamicIslandState } from '../../hooks/useDynamicIslandState'

/** Which full-height center module is open (editor = canvas, no header tab). */
export type AppCenterModule = 'editor' | 'skillstore' | 'automation' | 'search'

export function AppHeader({
  onOpenSettings,
  onOpenNotifications,
  islandState,
  notifyBadge = false,
  centerModule = 'editor',
  onOpenSearch,
  onOpenSkillStore,
  onOpenAutomation,
}: {
  onOpenSettings?: () => void
  onOpenNotifications?: () => void
  islandState: DynamicIslandState
  notifyBadge?: boolean
  centerModule?: AppCenterModule
  onOpenSearch?: () => void
  onOpenSkillStore?: () => void
  onOpenAutomation?: () => void
}) {
  const [accountOpen, setAccountOpen] = useState(false)
  const avatarRef = useRef<HTMLButtonElement>(null)

  const navBtn = (active: boolean) =>
    ({
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid',
      borderColor: active ? 'var(--color-primary)' : 'transparent',
      background: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
      color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
      fontSize: '12px',
      fontWeight: 600,
      cursor: 'pointer',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      whiteSpace: 'nowrap',
    }) as const

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
      {/* Left: Logo + Dynamic Island（原中间区域内容挪到左侧 Logo 旁） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--color-on-surface)', flexShrink: 0 }}>
          <img
            src="/kevin-logo.png"
            alt="Kevin logo"
            style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'contain' }}
          />
          Kevin
        </div>
        <div style={{ minWidth: 0, display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <DynamicIsland state={islandState} />
        </div>
      </div>

      {/* Center: 搜索 / Skills / 自动化（原左侧导航，占满中间并居中） */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }} aria-label="工作区">
          <button type="button" onClick={() => onOpenSearch?.()} style={navBtn(centerModule === 'search')} aria-current={centerModule === 'search' ? 'page' : undefined}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>search</span>
            搜索
          </button>
          <button type="button" onClick={() => onOpenSkillStore?.()} style={navBtn(centerModule === 'skillstore')} aria-current={centerModule === 'skillstore' ? 'page' : undefined}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>extension</span>
            Skills
          </button>
          <button type="button" onClick={() => onOpenAutomation?.()} style={navBtn(centerModule === 'automation')} aria-current={centerModule === 'automation' ? 'page' : undefined}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>smart_toy</span>
            自动化
          </button>
        </nav>
      </div>

      {/* Right: Space（通知左侧）+ 通知 / 设置 / 账户 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <HeaderSpaceSwitcher />
        <button
          type="button"
          aria-label="通知"
          onClick={() => onOpenNotifications?.()}
          style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)', position: 'relative' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-container)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
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
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-container)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
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
