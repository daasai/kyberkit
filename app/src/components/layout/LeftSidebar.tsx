import { useEffect, useRef, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { SpaceManagerPanel } from './SpaceManagerPanel'
import {
  KEVIN_LIBRARY_SELECTION_EVENT,
  emitLibrarySelection,
  getSelectedLibraryDir,
  setSelectedLibraryDir,
  toParentLibraryDir,
  type LibrarySelectionEventDetail,
} from '../../lib/librarySelection'

type Connector = {
  name: string
  status: 'healthy' | 'error'
  lastSuccess: string
  source?: 'live' | 'demo'
}

type LibraryNode = {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: LibraryNode[]
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

function collectDefaultExpandedPaths(nodes: LibraryNode[], depth = 0): string[] {
  const paths: string[] = []
  for (const node of nodes) {
    if (node.kind !== 'dir') continue
    if (depth < 2) paths.push(node.path)
    if (node.children?.length) paths.push(...collectDefaultExpandedPaths(node.children, depth + 1))
  }
  return paths
}

function findFirstDirPath(nodes: LibraryNode[]): string | null {
  for (const node of nodes) {
    if (node.kind === 'dir') return node.path
    if (node.children?.length) {
      const nested = findFirstDirPath(node.children)
      if (nested) return nested
    }
  }
  return null
}

export function LeftSidebar({
  onOpenSkillStore,
  onOpenAutomation,
  onOpenSearch,
}: {
  onOpenSkillStore?: () => void
  onOpenAutomation?: () => void
  onOpenSearch?: () => void
} = {}) {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    spaceId,
    setSpaceId,
    spaces,
    refreshSpaces,
    createSpaceLibrary,
    openSpaceInNewWindow,
  } = useSession()
  const { clearArtifact, loadArtifact } = useArtifact()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false)
  const [spaceManagerOpen, setSpaceManagerOpen] = useState(false)
  const spaceMenuRef = useRef<HTMLDivElement>(null)
  const [pendingSignoffSessionIds, setPendingSignoffSessionIds] = useState<Set<string>>(new Set())
  const [rawConnectors, setRawConnectors] = useState<Connector[]>([])
  const [connectorsUnavailable, setConnectorsUnavailable] = useState(false)
  const [libraryNodes, setLibraryNodes] = useState<LibraryNode[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libraryError, setLibraryError] = useState(false)
  const [expandedLibraryPaths, setExpandedLibraryPaths] = useState<Set<string>>(new Set())
  /** Currently selected node (file or dir) for highlight. */
  const [selectedLibraryPath, setSelectedLibraryPath] = useState<string | null>(null)
  /** Current “working directory” under the Library mount (dir only). */
  const [selectedLibraryDirPath, setSelectedLibraryDirPath] = useState<string | null>(null)
  const connectors = sortConnectors(rawConnectors)

  // Dynamic connector fetch with strict unavailable state (no demo fallback).
  useEffect(() => {
    fetch(`${SIDECAR_URL}/connectors`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: Connector[]) => {
        if (!Array.isArray(data)) throw new Error('invalid connectors payload')
        setRawConnectors(data)
        setConnectorsUnavailable(false)
      })
      .catch(() => {
        setRawConnectors([])
        setConnectorsUnavailable(true)
      })
  }, [])

  // Pending sign-off polling — scoped to current space
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
        if (!res.ok || cancelled) return
        const rows = (await res.json()) as Array<{ state: string; payload?: unknown }>
        const awaiting = rows.filter((r) => r.state === 'awaiting-signoff')
        const ids = new Set(
          awaiting.map((r) => {
            try {
              const obj = JSON.parse(String(r.payload ?? '')) as { session_id?: string; sessionId?: string }
              return obj.session_id ?? obj.sessionId ?? null
            } catch { return null }
          }).filter((id): id is string => Boolean(id))
        )
        if (!cancelled) setPendingSignoffSessionIds(ids)
      } catch {
        if (!cancelled) setPendingSignoffSessionIds(new Set())
      }
    }
    void tick()
    const timer = window.setInterval(tick, 4000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [spaceId])

  useEffect(() => {
    let cancelled = false
    const loadLibraryTree = async () => {
      setLibraryLoading(true)
      setLibraryError(false)
      try {
        const res = await fetch(`${SIDECAR_URL}/library/tree${qsSpace(spaceId)}`)
        if (!res.ok) throw new Error('library tree fetch failed')
        const data = (await res.json()) as LibraryNode[]
        if (!Array.isArray(data)) throw new Error('invalid library tree payload')
        if (cancelled) return
        setLibraryNodes(data)
        setExpandedLibraryPaths(new Set(collectDefaultExpandedPaths(data)))
        const stored = getSelectedLibraryDir(spaceId)
        const fallback = findFirstDirPath(data)
        const next = stored ?? fallback
        setSelectedLibraryPath(next)
        setSelectedLibraryDirPath(next)
        setSelectedLibraryDir(spaceId, next)
      } catch {
        if (!cancelled) {
          setLibraryNodes([])
          setExpandedLibraryPaths(new Set())
          setSelectedLibraryDirPath(null)
          setSelectedLibraryDir(spaceId, null)
          setLibraryError(true)
        }
      } finally {
        if (!cancelled) setLibraryLoading(false)
      }
    }
    void loadLibraryTree()
    return () => { cancelled = true }
  }, [spaceId])

  const toggleLibraryDir = (path: string) => {
    setExpandedLibraryPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const applySelection = (path: string | null, dirPath: string | null) => {
    setSelectedLibraryPath(path)
    setSelectedLibraryDirPath(dirPath)
    setSelectedLibraryDir(spaceId, dirPath)
    emitLibrarySelection({ spaceId, selectedPath: path, selectedDirPath: dirPath })
  }

  useEffect(() => {
    const onSelection = (e: Event) => {
      const detail = (e as CustomEvent<LibrarySelectionEventDetail>).detail
      if (!detail || detail.spaceId !== spaceId) return
      if (detail.selectedPath) {
        setSelectedLibraryPath(detail.selectedPath)
      }
      setSelectedLibraryDirPath(detail.selectedDirPath)
      setSelectedLibraryDir(spaceId, detail.selectedDirPath)
    }
    window.addEventListener(KEVIN_LIBRARY_SELECTION_EVENT, onSelection as EventListener)
    return () => {
      window.removeEventListener(KEVIN_LIBRARY_SELECTION_EVENT, onSelection as EventListener)
    }
  }, [spaceId])

  /** Switch Space inside this window (PRD §7.E vault switcher). */
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

  const currentSpaceMeta = spaces.find((s) => s.id === spaceId)
  const spaceAnchorLabel = currentSpaceMeta?.label ?? spaceId ?? '未选择 Space'

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
            { icon: 'search',    label: '搜索',       action: () => onOpenSearch?.() },
            { icon: 'extension', label: 'Skill Store', action: () => onOpenSkillStore?.() },
            { icon: 'smart_toy', label: '自动化',     action: () => onOpenAutomation?.() },
          ].map(({ icon, label, action }) => (
            <button key={label} type="button" onClick={action} style={{
              display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
              padding: '8px 12px', borderRadius: '8px',
              fontSize: '14px', fontWeight: 500, textDecoration: 'none',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-on-surface-variant)',
              transition: 'background 150ms, color 150ms',
            }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        {/* Document Library */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              title={selectedLibraryDirPath ? `当前目录: ${selectedLibraryDirPath}` : '当前目录: (Library 根目录)'}
              style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}
            >
              文档库
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                style={{
                  padding: '2px 4px',
                  fontSize: '11px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-on-surface-variant)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setLibraryLoading(true)
                  fetch(`${SIDECAR_URL}/library/tree${qsSpace(spaceId)}`)
                    .then((r) => r.ok ? r.json() : Promise.reject())
                    .then((data: LibraryNode[]) => {
                      if (!Array.isArray(data)) throw new Error('invalid library tree payload')
                      setLibraryNodes(data)
                      setExpandedLibraryPaths(new Set(collectDefaultExpandedPaths(data)))
                      const stored = getSelectedLibraryDir(spaceId)
                      const fallback = findFirstDirPath(data)
                      const next = stored ?? fallback
                      setSelectedLibraryPath(next)
                      setSelectedLibraryDirPath(next)
                      setSelectedLibraryDir(spaceId, next)
                      setLibraryError(false)
                    })
                    .catch(() => {
                      setLibraryNodes([])
                      setExpandedLibraryPaths(new Set())
                      setSelectedLibraryDirPath(null)
                      setSelectedLibraryDir(spaceId, null)
                      setLibraryError(true)
                    })
                    .finally(() => setLibraryLoading(false))
                }}
              >
                刷新
              </button>
              <button
                type="button"
                style={{
                  padding: '2px 4px',
                  fontSize: '11px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-on-surface-variant)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedLibraryPaths(new Set())}
              >
                折叠全部
              </button>
            </span>
          </div>
          {libraryLoading ? (
            <div style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
              加载文档库...
            </div>
          ) : libraryError ? (
            <div style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
              文档库加载失败，请稍后重试
            </div>
          ) : libraryNodes.length === 0 ? (
            <div style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
              当前 Space 暂无文档
            </div>
          ) : (
            libraryNodes.map((node) => {
              const renderNode = (entry: LibraryNode, depth: number): React.ReactNode => {
                const isDir = entry.kind === 'dir'
                const expanded = isDir && expandedLibraryPaths.has(entry.path)
                const isSelectedNode = selectedLibraryPath === entry.path
                return (
                  <div key={entry.path}>
                    <button
                      type="button"
                      onClick={() => {
                        if (isDir) {
                          applySelection(entry.path, entry.path)
                          toggleLibraryDir(entry.path)
                          return
                        }
                        const parentDir = toParentLibraryDir(entry.path)
                        applySelection(entry.path, parentDir)
                        // Try previewing selected file in center panel; keep existing artifact if unsupported.
                        if (!spaceId) return
                        const q = qsSpace(spaceId)
                        const sep = q ? '&' : '?'
                        fetch(`${SIDECAR_URL}/library/file${q}${sep}path=${encodeURIComponent(entry.path)}`)
                          .then(async (r) => {
                            const data = await r.json().catch(() => ({}))
                            return { ok: r.ok, status: r.status, data }
                          })
                          .then(({ ok, status, data }: { ok: boolean; status: number; data: Record<string, unknown> }) => {
                            if (!ok) {
                              const reason = String(data.reason ?? '')
                              const size = typeof data.size === 'number' ? data.size : null
                              const maxSize = typeof data.maxSize === 'number' ? data.maxSize : null
                              const sizeMb = size !== null ? (size / 1024 / 1024).toFixed(2) : null
                              const maxMb = maxSize !== null ? (maxSize / 1024 / 1024).toFixed(2) : null
                              const hint =
                                reason === 'too_large'
                                  ? `该文件大小约 ${sizeMb ?? '?'} MB，超过预览上限 ${maxMb ?? '?'} MB。`
                                  : reason === 'binary'
                                    ? '该文件为二进制内容，不支持文本预览。'
                                    : '该文件暂不支持预览。'
                              const fallback = `# 文件预览不可用\n\n- 文件：\`${entry.name}\`\n- 状态码：\`${status}\`\n- 原因：${hint}\n`
                              loadArtifact(activeSessionId ?? `preview-${spaceId}`, fallback)
                              return
                            }
                            if (typeof data.content === 'string') {
                              loadArtifact(activeSessionId ?? `preview-${spaceId}`, data.content)
                            }
                          })
                          .catch(() => {
                            const fallback = `# 文件预览不可用\n\n- 文件：\`${entry.name}\`\n- 原因：请求失败或内容不可读。`
                            loadArtifact(activeSessionId ?? `preview-${spaceId}`, fallback)
                          })
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        paddingLeft: `${12 + depth * 14}px`,
                        border: 'none',
                        background: isSelectedNode
                          ? 'color-mix(in srgb, var(--color-primary) 18%, transparent)'
                          : 'transparent',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: 'var(--color-on-surface)',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ width: '14px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                        {isDir ? (
                          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: 'var(--color-on-surface-variant)' }}>
                            {expanded ? 'expand_more' : 'chevron_right'}
                          </span>
                        ) : null}
                      </span>
                      <span className="material-symbols-outlined" style={{ fontSize: '15px', color: isDir ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', flexShrink: 0 }}>
                        {isDir ? 'folder_open' : 'description'}
                      </span>
                      <span
                        title={entry.name}
                        style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}
                      >
                        {entry.name}
                      </span>
                    </button>
                    {isDir && expanded && entry.children?.map((child) => renderNode(child, depth + 1))}
                  </div>
                )
              }
              return renderNode(node, 0)
            })
          )}
        </div>

        {/* Connectors */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              连接器
            </span>
            <span />
          </div>
          {connectorsUnavailable || connectors.length === 0 ? (
            <div style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
              暂无可用连接器
            </div>
          ) : (
            connectors.map((item) => (
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
            ))
          )}
        </div>

        {/* Recent Artifacts — dynamic from Sidecar */}
        <div id="sidebar-session-history">
          <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
              历史会话
            </span>
            <button type="button" onClick={handleNew} style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--color-on-surface-variant)', display: 'flex', alignItems: 'center',
              borderRadius: '4px', padding: '2px',
            }}
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
              const hasPendingSignoff = pendingSignoffSessionIds.has(id)
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveSessionId(id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 500,
                    color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                    background: isActive ? 'var(--color-surface-container)' : 'transparent',
                    position: 'relative', cursor: 'pointer',
                    transition: 'background 150ms, color 150ms',
                    border: 'none',
                    width: '100%',
                    textAlign: 'left',
                  }}
                >
                  {isActive && (
                    <div style={{
                      position: 'absolute', left: 0, top: '8px', bottom: '8px',
                      width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0',
                    }} />
                  )}
                  <span className="material-symbols-outlined" style={{ fontSize: '15px', color: isActive ? 'var(--color-primary)' : 'inherit', flexShrink: 0 }}>description</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                      {title}
                      {hasPendingSignoff && (
                        <span title="该会话有待签批任务" style={{ color: 'var(--color-error)', marginLeft: '6px', fontSize: '10px' }}>●</span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '1px' }}>{relativeTime(updatedAt)}</div>
                  </div>
                  {/* Delete button (shown on hover) */}
                  <button
                    onClick={e => handleDelete(e, id)}
                    disabled={deletingId === id}
                    type="button"
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
                </button>
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
          onClick={() => {
            setSpaceMenuOpen((o) => {
              const next = !o
              if (next) void refreshSpaces()
              return next
            })
          }}
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
        onOpenInNewWindow={async (id) => {
          await openSpaceInNewWindow(id)
        }}
      />

      <style>{`
        div:hover > .session-delete-btn,
        [role="button"]:hover > .session-delete-btn {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}
