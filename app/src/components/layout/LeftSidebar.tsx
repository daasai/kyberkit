import { useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL } from '../../config/sidecarUrl'

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
  const { sessions, activeSessionId, setActiveSessionId, createSession, deleteSession } = useSession()
  const { loadArtifact, clearArtifact } = useArtifact()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleSelectSession = async (id: string) => {
    setActiveSessionId(id)
    // Load the artifact for this session from Sidecar
    try {
      const res = await fetch(`${SIDECAR_URL}/sessions/${id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.artifactContent) {
          loadArtifact(id, data.artifactContent)
        } else {
          clearArtifact()
        }
      }
    } catch { /* ignore */ }
  }

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

        {/* Context & Sources */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              Context &amp; Sources
            </span>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-on-surface-variant)', cursor: 'pointer' }}>add</span>
          </div>
          {[
            { icon: 'folder_open', label: '本地文件 (Filesystem MCP)', color: 'var(--color-primary)' },
            { icon: 'dataset', label: '贝易转 DW', color: '#6B7280' },
            { icon: 'monitor_heart', label: '系统监控 MCP', color: '#6B7280' },
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

        {/* Recent Artifacts — dynamic from Sidecar */}
        <div>
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

      {/* Bottom CTA */}
      <div style={{ padding: '16px', borderTop: '1px solid var(--color-outline-variant)' }}>
        <button style={{
          width: '100%', padding: '8px', fontSize: '12px', fontWeight: 600,
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '8px', cursor: 'pointer',
          color: 'var(--color-on-surface)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          transition: 'background 150ms',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-container-lowest)')}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>bolt</span>
          Upgrade Plan
        </button>
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
