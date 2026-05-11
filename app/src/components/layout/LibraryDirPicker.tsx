/**
 * Library folder-only picker — uses `/library/tree`, directories only (no files).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { LIBRARY_CHAT_MENTION_PREFIX, toLibraryRelativePath } from '../../lib/librarySelection'

type TreeNode = {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: TreeNode[]
}

function flattenDirs(
  nodes: TreeNode[],
  acc: { path: string; label: string }[] = [],
  prefix = '',
): { path: string; label: string }[] {
  for (const n of nodes) {
    if (n.kind !== 'dir') continue
    const label = prefix ? `${prefix}/${n.name}` : n.name
    acc.push({ path: n.path, label })
    if (n.children?.length) flattenDirs(n.children, acc, label)
  }
  return acc
}

export function LibraryDirPicker({
  spaceId,
  libraryId,
  open,
  busy,
  error,
  onClose,
  onPickDir,
}: {
  spaceId: string
  libraryId: string | null
  open: boolean
  busy?: boolean
  error?: string | null
  onClose: () => void
  /** Full `@/libraries/<id>/…` directory ref (library root uses `@/libraries/<id>`). */
  onPickDir: (dirFullRef: string) => void
}) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const filterInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !spaceId) return
    setErr(null)
    setFilter('')
    void fetch(`${SIDECAR_URL}/library/tree${qsSpace(spaceId)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) {
          setErr(typeof j?.error === 'string' ? j.error : '无法加载文档库')
          setTree([])
          return
        }
        setTree(Array.isArray(j) ? j : [])
      })
      .catch(() => {
        setErr('网络错误')
        setTree([])
      })
  }, [open, spaceId])

  useEffect(() => {
    if (open) filterInputRef.current?.focus()
  }, [open])

  const resolvedLibraryId = useMemo(() => {
    const id = libraryId?.trim() ?? ''
    if (id) return id
    const p = tree.find((n) => n.path.startsWith('@/libraries/'))?.path
    if (!p) return ''
    const rest = p.slice('@/libraries/'.length)
    const i = rest.indexOf('/')
    return i > 0 ? rest.slice(0, i) : rest
  }, [libraryId, tree])

  const rows = useMemo(() => {
    const flat = flattenDirs(tree)
    flat.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
    if (!resolvedLibraryId) return flat
    const rootPath = `@/libraries/${resolvedLibraryId}`
    return [{ path: rootPath, label: '文档库根目录' }, ...flat]
  }, [tree, resolvedLibraryId])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.label.toLowerCase().includes(q) || r.path.toLowerCase().includes(q))
  }, [rows, filter])

  if (!open) return null

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 950,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <button
        type="button"
        aria-label="关闭文件夹选择"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'default',
          background: 'rgba(0,0,0,0.35)',
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="选择目标文件夹"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(480px, 100%)',
          maxHeight: 'min(420px, 70vh)',
          background: 'var(--color-surface-container-lowest)',
          borderRadius: '12px',
          border: '1px solid var(--color-outline-variant)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 14px',
            borderBottom: '1px solid var(--color-outline-variant)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontWeight: 700, fontSize: '14px' }}>
            选择目标文件夹{busy ? '（移动中…）' : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '18px',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            ×
          </button>
        </div>
        <p style={{ margin: '8px 14px 0', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
          仅显示文件夹；点选后将把当前制品移动到该文件夹。
        </p>
        <div style={{ padding: '10px 14px' }}>
          <input
            ref={filterInputRef}
            placeholder="筛选文件夹名…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '13px',
              borderRadius: '8px',
              border: '1px solid var(--color-outline-variant)',
            }}
          />
        </div>
        {err && (
          <div style={{ padding: '0 14px 8px', fontSize: '12px', color: 'var(--color-error)' }}>{err}</div>
        )}
        {error && !err && (
          <div style={{ padding: '0 14px 8px', fontSize: '12px', color: 'var(--color-error)' }}>{error}</div>
        )}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
          {filtered.length === 0 && !err && (
            <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', margin: '8px 12px' }}>
              暂无文件夹（可在文档库中先创建目录）
            </p>
          )}
          {filtered.map((r) => (
            <button
              key={r.path}
              type="button"
              onClick={() => {
                if (busy) return
                onPickDir(r.path)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: '2px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                cursor: busy ? 'not-allowed' : 'pointer',
                fontSize: '12px',
                color: 'var(--color-on-surface)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-surface-container)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
                {r.label === '文档库根目录'
                  ? '（当前文档库根目录）'
                  : `${LIBRARY_CHAT_MENTION_PREFIX}${toLibraryRelativePath(r.path)}`}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
