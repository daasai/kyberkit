import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import type { SpaceSwitchOutcome } from '../../lib/tauriSpace'

type HandleSpaceSelectionArgs = {
  targetSessionId: string
  activeSessionId: string | null
  switchToSessionSpace: (id: string) => Promise<SpaceSwitchOutcome>
  onCurrentSpaceSelected?: () => void
}

type Connector = {
  name: string
  status: 'healthy' | 'error'
  lastSuccess: string
}

export async function handleSpaceSelection({
  targetSessionId,
  activeSessionId,
  switchToSessionSpace,
  onCurrentSpaceSelected,
}: HandleSpaceSelectionArgs): Promise<SpaceSwitchOutcome> {
  if (targetSessionId === activeSessionId) {
    onCurrentSpaceSelected?.()
    return 'noop'
  }
  return switchToSessionSpace(targetSessionId)
}

export function sortConnectors(connectors: Connector[]): Connector[] {
  return [...connectors].sort((a, b) => Number(b.status === 'error') - Number(a.status === 'error'))
}

export function connectorSummary(connectors: Connector[]): string {
  const healthy = connectors.filter((item) => item.status === 'healthy').length
  const error = connectors.length - healthy
  return `${healthy} 正常 / ${error} 异常`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}小时前`
  return `${Math.floor(hrs / 24)}天前`
}

export function LeftSidebar() {
  const { sessions, activeSessionId, createSession, deleteSession, switchToSessionSpace } = useSession()
  const { clearArtifact } = useArtifact()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false)
  const spaceMenuRef = useRef<HTMLDivElement>(null)
  const connectors = sortConnectors([
    { name: 'Filesystem MCP', status: 'healthy', lastSuccess: '刚刚' },
    { name: '系统监控 MCP', status: 'healthy', lastSuccess: '2分钟前' },
    { name: '贝易转 DW', status: 'error', lastSuccess: '20分钟前' },
  ])

  const handleSelectSession = async (id: string) => {
    await handleSpaceSelection({
      targetSessionId: id,
      activeSessionId,
      switchToSessionSpace,
      onCurrentSpaceSelected: () => {
        setSpaceMenuOpen(false)
      },
    })
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

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    e.preventDefault()
    setDeletingId(id)
    await deleteSession(id)
    setDeletingId(null)
  }

  const handleNew = async () => {
    clearArtifact()
    await createSession()
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const spaceAnchorLabel = activeSession?.title ?? '未选择 Space'

  return (
    <div style={{
      height: '100%',
      backgroundColor: 'var(--color-surface-container-lowest)',
      borderRight: '1px solid var(--color-outline-variant)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Scrollable content */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>

        {/* Top Nav */}
        <nav style={{ marginBottom: '20px' }}>
          {[
            { icon: 'add', label: '新建会话', action: handleNew },
            { icon: 'search', label: '搜索', action: () => {} },
            { icon: 'extension', label: '插件', action: () => {} },
            { icon: 'smart_toy', label: '自动化', action: () => {} },
          ].map(({ icon, label, action }) => (
            <button key={label} onClick={action} style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '8px 12px', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-on-surface-variant)',
              transition: 'background 150ms, color 150ms',
            }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface-variant)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Document Library */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              文档库
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>最近引用</span>
          </div>
          {[
            { icon: 'folder_open', label: '@/docs/specs/kevin1.5', color: 'var(--color-primary)' },
            { icon: 'description', label: '@/docs/specs/kevin1.5/README.md', color: '#6B7280' },
            { icon: 'description', label: '@/docs/specs/kevin1.5/task-lifecycle.md', color: '#6B7280' },
          ].map(({ icon, label, color }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 12px', borderRadius: '8px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)',
              transition: 'background 150ms',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: '16px', flexShrink: 0 }} />
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color }}>{icon}</span>
              <span style={{ fontSize: '13px' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Connectors */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              连接器
            </span>
            <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>
              {connectorSummary(connectors)}
            </span>
          </div>
          {connectors.map((item) => (
            <div
              key={item.name}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px', borderRadius: '8px',
                fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: item.status === 'healthy' ? '#16a34a' : '#dc2626',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '13px', flex: 1 }}>{item.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>{item.lastSuccess}</span>
            </div>
          ))}
        </div>

        {/* Recent Artifacts — dynamic from Sidecar */}
        <div id="sidebar-session-history">
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              历史会话
            </span>
            <button onClick={handleNew} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center',
              borderRadius: '4px', padding: '2px',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span>
            </button>
          </div>

          {sessions.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: '12px' }}>
              暂无历史会话
            </div>
          ) : (
            sessions.map(({ id, title, updatedAt }) => {
              const isActive = id === activeSessionId
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSession(id)}
                  onKeyDown={e => e.key === 'Enter' && handleSelectSession(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 500,
                    color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                    background: isActive ? 'var(--color-surface-container)' : 'transparent',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 150ms, color 150ms',
                  }}
                  onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container)'; (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface)' } }}
                  onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface-variant)' } }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: '8px', bottom: '8px',
                      width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0',
                    }} />
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '15px', color: isActive ? 'var(--color-primary)' : 'inherit', flexShrink: 0 }}>description</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>{title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '1px' }}>{relativeTime(updatedAt)}</div>
                  </div>
                  {/* Delete button (shown on hover) */}
                  <button
                    onClick={e => handleDelete(e, id)}
                    disabled={deletingId === id}
                    style={{
                      flexShrink: 0, opacity: 0, background: 'transparent', border: 'none',
                      cursor: 'pointer', padding: '2px', borderRadius: '4px',
                      color: 'var(--color-on-surface-variant)',
                      transition: 'opacity 150ms, background 150ms',
                    }}
                    className="session-delete-btn"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                  </button>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Space switcher (replaces Upgrade Plan) */}
      <div
        ref={spaceMenuRef}
        style={{
          padding: '16px',
          borderTop: '1px solid var(--color-outline-variant)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          data-testid="space-switcher"
          aria-expanded={spaceMenuOpen}
          aria-haspopup="menu"
          onClick={() => setSpaceMenuOpen((o) => !o)}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'var(--color-surface-container-lowest)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '8px',
            cursor: 'pointer',
            color: 'var(--color-on-surface)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background 150ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-surface-container-lowest)'
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0 }}>
            layers
          </span>
          <span style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {spaceAnchorLabel}
          </span>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', flexShrink: 0, opacity: 0.7 }}>
            {spaceMenuOpen ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {spaceMenuOpen && (
          <div
            role="menu"
            data-testid="space-switcher-menu"
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: '100%',
              marginBottom: 8,
              maxHeight: 'min(320px, 45vh)',
              overflowY: 'auto',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '10px',
              boxShadow: '0 4px 18px rgba(0,0,0,0.12)',
              zIndex: 20,
              padding: '6px 0',
            }}
          >
            {sessions.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
                暂无 Space，请先新建会话
              </div>
            ) : (
              sessions.map(({ id, title, updatedAt }) => {
                const isCurrent = id === activeSessionId
                return (
                  <button
                    key={id}
                    type="button"
                    role="menuitem"
                    onClick={() => void handleSelectSession(id)}
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
                        {title}
                      </span>
                      <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: 2 }}>
                        {relativeTime(updatedAt)}
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
                  document.getElementById('sidebar-session-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      <style>{`
        div:hover > .session-delete-btn,
        [role="button"]:hover > .session-delete-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}
