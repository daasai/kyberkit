import { useEffect, useMemo, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import {
  KEVIN_LIBRARY_SELECTION_EVENT,
  KEVIN_OPEN_LIBRARY_FILE_EVENT,
  collectAncestorDirRefsForLibraryFile,
  emitLibrarySelection,
  getSelectedLibraryDir,
  setSelectedLibraryDir,
  toParentLibraryDir,
  type LibrarySelectionEventDetail,
  type OpenLibraryFileDetail,
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

/** PDF / Office: open with OS default app; do not pipe binary through Milkdown. */
const OPEN_IN_SYSTEM_VIEWER_RE = /\.(pdf|docx?|pptx?|ppsx?|xlsx?|xlsm?|xls)$/i

/** Pinned first + `updatedAt` desc comes from Sidecar; show this many rows until user expands「更多」. */
const SESSION_HISTORY_PREVIEW = 3

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

export function LeftSidebar() {
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    spaceId,
    pinSession,
  } = useSession()
  const { clearArtifact, loadArtifact, openLibraryDocument } = useArtifact()
  const [deletingId, setDeletingId] = useState<string | null>(null)
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
  const [sessionHistoryExpanded, setSessionHistoryExpanded] = useState(false)
  const connectors = sortConnectors(rawConnectors)
  /** 产品要求：连接器区仅展示「贝易转 DW」。 */
  const connectorsForUi = useMemo(
    () => connectors.filter((c) => c.name === '贝易转 DW'),
    [connectors],
  )
  const visibleSessions = sessionHistoryExpanded ? sessions : sessions.slice(0, SESSION_HISTORY_PREVIEW)

  useEffect(() => {
    if (!spaceId) return
    setSessionHistoryExpanded(false)
  }, [spaceId])

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

  /** Global search: reveal file in library tree + sync upload / chat dir context. */
  useEffect(() => {
    const onOpenFile = (e: Event) => {
      const d = (e as CustomEvent<OpenLibraryFileDetail>).detail
      if (!d?.path || !d.spaceId || d.spaceId !== spaceId) return
      const parent = toParentLibraryDir(d.path)
      setSelectedLibraryPath(d.path)
      setSelectedLibraryDirPath(parent)
      setSelectedLibraryDir(spaceId, parent)
      emitLibrarySelection({ spaceId, selectedPath: d.path, selectedDirPath: parent })
      setExpandedLibraryPaths((prev) => {
        const next = new Set(prev)
        for (const p of collectAncestorDirRefsForLibraryFile(d.path)) {
          next.add(p)
        }
        return next
      })
    }
    window.addEventListener(KEVIN_OPEN_LIBRARY_FILE_EVENT, onOpenFile as EventListener)
    return () => {
      window.removeEventListener(KEVIN_OPEN_LIBRARY_FILE_EVENT, onOpenFile as EventListener)
    }
  }, [spaceId])

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
      {/* Scrollable content（连接器在底部常驻区，不随滚动离开视口） */}
      <div className="custom-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px' }}>

        {/* Top Nav */}
        <nav style={{ marginBottom: '20px' }}>
          {[
            { icon: 'add', label: '新建会话', action: handleNew },
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

        {/* 历史会话 — 紧挨「新建会话」；默认最多 3 条（置顶优先 + 最新），其余「更多」展开 */}
        <div id="sidebar-session-history" style={{ marginBottom: '20px' }}>
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
            <>
              {visibleSessions.map(({ id, title, updatedAt, pinned }) => {
                const isActive = id === activeSessionId
                const hasPendingSignoff = pendingSignoffSessionIds.has(id)
                return (
                  <div
                    key={id}
                    className={`session-row-wrap${isActive ? ' session-row-active' : ''}`}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderRadius: '8px',
                      position: 'relative',
                    }}
                  >
                    <button
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
                        flex: 1,
                        minWidth: 0,
                        textAlign: 'left',
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: 'absolute', left: 0, top: '8px', bottom: '8px',
                          width: '3px', background: 'var(--color-primary)', borderRadius: '0 3px 3px 0',
                        }} />
                      )}
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: '15px',
                          color: pinned ? 'var(--color-primary)' : (isActive ? 'var(--color-primary)' : 'inherit'),
                          flexShrink: 0,
                        }}
                        title={pinned ? '已置顶' : undefined}
                      >
                        {pinned ? 'push_pin' : 'description'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                          {title}
                          {hasPendingSignoff && (
                            <span title="该会话有待签批任务" style={{ color: 'var(--color-error)', marginLeft: '6px', fontSize: '10px' }}>●</span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '1px' }}>{relativeTime(updatedAt)}</div>
                      </div>
                    </button>
                    <div
                      className="session-actions"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        paddingRight: '6px',
                        flexShrink: 0,
                        opacity: isActive ? 1 : 0,
                        transition: 'opacity 150ms',
                      }}
                    >
                      <button
                        type="button"
                        title={pinned ? '取消置顶' : '置顶'}
                        onClick={(e) => {
                          e.stopPropagation()
                          void pinSession(id, !pinned)
                        }}
                        className="session-action-icon-btn"
                        style={{
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          padding: '4px', borderRadius: '4px',
                          color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>push_pin</span>
                      </button>
                      <button
                        onClick={e => handleDelete(e, id)}
                        disabled={deletingId === id}
                        type="button"
                        title="删除"
                        style={{
                          background: 'transparent', border: 'none',
                          cursor: deletingId === id ? 'default' : 'pointer', padding: '4px', borderRadius: '4px',
                          color: isActive ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
                          opacity: deletingId === id ? 0.45 : 1,
                        }}
                        className="session-delete-btn session-action-icon-btn"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                      </button>
                    </div>
                  </div>
                )
              })}
              {sessions.length > SESSION_HISTORY_PREVIEW && !sessionHistoryExpanded && (
                <button
                  type="button"
                  onClick={() => setSessionHistoryExpanded(true)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: 'var(--color-primary)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  更多（{sessions.length - SESSION_HISTORY_PREVIEW}）
                </button>
              )}
              {sessions.length > SESSION_HISTORY_PREVIEW && sessionHistoryExpanded && (
                <button
                  type="button"
                  onClick={() => setSessionHistoryExpanded(false)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: 'var(--color-on-surface-variant)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  收起
                </button>
              )}
            </>
          )}
        </div>

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
                        if (!spaceId) return
                        const sid = activeSessionId ?? `preview-${spaceId}`

                        if (OPEN_IN_SYSTEM_VIEWER_RE.test(entry.name)) {
                          void fetch(`${SIDECAR_URL}/library/open-external${qsSpace(spaceId)}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path: entry.path }),
                          })
                            .then(async (r) => {
                              const data = (await r.json().catch(() => ({}))) as { error?: string }
                              if (!r.ok) {
                                const err = typeof data.error === 'string' ? data.error : `HTTP ${r.status}`
                                loadArtifact(
                                  sid,
                                  `# 未能在外部打开文件\n\n- 文件：\`${entry.name}\`\n- 错误：${err}\n`,
                                )
                                return
                              }
                              loadArtifact(
                                sid,
                                `# 已在系统默认程序中打开\n\n- 文件：\`${entry.name}\`\n\n该类型不在中栏加载文本流，可避免卡顿与乱码。若未自动弹出，请在访达或资源管理器中手动打开该文件。\n`,
                              )
                            })
                            .catch(() => {
                              loadArtifact(
                                sid,
                                `# 未能在外部打开文件\n\n- 文件：\`${entry.name}\`\n- 原因：网络或 Sidecar 异常。\n`,
                              )
                            })
                          return
                        }

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
                              loadArtifact(sid, fallback)
                              return
                            }
                            if (typeof data.content === 'string') {
                              openLibraryDocument(sid, data.content, entry.path)
                            }
                          })
                          .catch(() => {
                            const fallback = `# 文件预览不可用\n\n- 文件：\`${entry.name}\`\n- 原因：请求失败或内容不可读。`
                            loadArtifact(sid, fallback)
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
      </div>

      {/* 连接器：左栏最底部常驻，不随上方内容滚动 */}
      <section
        aria-label="连接器"
        style={{
          flexShrink: 0,
          borderTop: '1px solid var(--color-outline-variant)',
          padding: '10px 8px 14px',
          backgroundColor: 'var(--color-surface-container-lowest)',
        }}
      >
        <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
            连接器
          </span>
          <span />
        </div>
        {connectorsUnavailable || connectorsForUi.length === 0 ? (
          <div style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
            暂无可用连接器
          </div>
        ) : (
          connectorsForUi.map((item) => (
            <div
              key={item.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-on-surface)',
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
      </section>

      <style>{`
        .session-row-wrap:hover .session-actions,
        .session-row-wrap:focus-within .session-actions {
          opacity: 1 !important;
        }
        .session-action-icon-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--color-on-surface) 10%, transparent);
        }
        .session-row-active .session-action-icon-btn:hover:not(:disabled) {
          background: color-mix(in srgb, var(--color-primary) 14%, transparent);
        }
      `}</style>
    </div>
  )
}
