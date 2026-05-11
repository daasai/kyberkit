import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { SpaceManagerPanel } from './SpaceManagerPanel'

/**
 * Space 下拉切换（原在左栏底部），现固定在 Header 通知左侧，紧凑尺寸。
 */
export function HeaderSpaceSwitcher() {
  const {
    spaceId,
    setSpaceId,
    spaces,
    refreshSpaces,
    createSpaceLibrary,
    updateSpaceDisplayName,
    deleteSpace,
    openSpaceInNewWindow,
  } = useSession()
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false)
  const [spaceManagerOpen, setSpaceManagerOpen] = useState(false)
  const spaceMenuRef = useRef<HTMLDivElement>(null)

  const selectSpaceInCurrentWindow = (targetSpaceId: string) => {
    if (targetSpaceId === spaceId) {
      setSpaceMenuOpen(false)
      return
    }
    setSpaceId(targetSpaceId)
    setSpaceMenuOpen(false)
  }

  useEffect(() => {
    if (!spaceMenuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSpaceMenuOpen(false)
    }
    const onPointerDown = (e: MouseEvent) => {
      const el = spaceMenuRef.current
      if (el && !el.contains(e.target as Node)) setSpaceMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [spaceMenuOpen])

  const currentSpaceMeta = spaces.find((s) => s.id === spaceId)
  const spaceAnchorLabel = currentSpaceMeta?.label ?? spaceId ?? '未选择 Space'

  return (
    <>
      <div
        ref={spaceMenuRef}
        style={{
          position: 'relative',
          flexShrink: 0,
          marginRight: '4px',
          zIndex: 50,
        }}
      >
        <button
          type="button"
          data-testid="space-switcher"
          aria-expanded={spaceMenuOpen}
          aria-haspopup="menu"
          title={spaceAnchorLabel}
          onClick={() => {
            setSpaceMenuOpen((o) => {
              const next = !o
              if (next) void refreshSpaces()
              return next
            })
          }}
          style={{
            height: '34px',
            maxWidth: 'min(200px, 28vw)',
            minWidth: '120px',
            padding: '0 10px 0 8px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '999px',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background 150ms, border-color 150ms',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0, opacity: 0.85 }}>
            layers
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {spaceAnchorLabel}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0, opacity: 0.55 }}>
            {spaceMenuOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {spaceMenuOpen && (
          <div
            role="menu"
            data-testid="space-switcher-menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: '6px',
              minWidth: '100%',
              width: 'max-content',
              maxWidth: 'min(300px, 85vw)',
              maxHeight: 'min(320px, 50vh)',
              overflowY: 'auto',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
              padding: '6px 0',
            }}
          >
            {spaces.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
                加载 Space 列表…
              </div>
            ) : (
              spaces.map(({ id, label }) => {
                const isCurrent = id === spaceId
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => selectSpaceInCurrentWindow(id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      border: 'none',
                      background: isCurrent ? 'var(--color-surface-container)' : 'transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontSize: '13px',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    <span style={{ width: '20px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                      {isCurrent ? (
                        <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>
                          check
                        </span>
                      ) : null}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: 2 }}>
                        {id}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
            <div style={{ borderTop: '1px solid var(--color-outline-variant)', marginTop: 4, paddingTop: 4 }}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setSpaceMenuOpen(false)
                  setSpaceManagerOpen(true)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>tune</span>
                管理 Space…
              </button>
            </div>
          </div>
        )}
      </div>

      <SpaceManagerPanel
        open={spaceManagerOpen}
        spaces={spaces}
        currentSpaceId={spaceId}
        onClose={() => setSpaceManagerOpen(false)}
        onSwitchSpace={(id) => {
          selectSpaceInCurrentWindow(id)
          setSpaceManagerOpen(false)
        }}
        onCreateSpace={async (mountPath, displayName) => {
          await createSpaceLibrary(mountPath, displayName)
          await refreshSpaces()
        }}
        onRenameSpace={updateSpaceDisplayName}
        onDeleteSpace={deleteSpace}
        onOpenInNewWindow={async (id) => {
          await openSpaceInNewWindow(id)
        }}
      />
    </>
  )
}
