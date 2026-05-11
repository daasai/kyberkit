/**
 * Library file picker for `@` mentions — uses `/library/tree`.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { LIBRARY_CHAT_MENTION_PREFIX, toLibraryRelativePath, toShortLibraryMention } from '../../lib/librarySelection'

type TreeNode = {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: TreeNode[]
}

function flattenFiles(nodes: TreeNode[], acc: { path: string; label: string }[] = [], prefix = ''): { path: string; label: string }[] {
  for (const n of nodes) {
    const label = prefix ? `${prefix}/${n.name}` : n.name
    if (n.kind === 'file') {
      acc.push({ path: n.path, label })
    } else if (n.children?.length) {
      flattenFiles(n.children, acc, label)
    }
  }
  return acc
}

export function AtFilePicker({
  spaceId,
  libraryId,
  open,
  onClose,
  onPick,
}: {
  spaceId: string
  /** When set, inserted token hides `libraries/<uuid>/` (e.g. `@/mount/docs/…`). */
  libraryId: string | null
  open: boolean
  onClose: () => void
  onPick: (mentionToken: string) => void
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

  const files = useMemo(() => flattenFiles(tree), [tree])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.label.toLowerCase().includes(q) || f.path.toLowerCase().includes(q))
  }, [files, filter])

  if (!open) return null

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <button
        type="button"
        aria-label="关闭文件选择"
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
        aria-label="选择文档库文件"
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
          <span style={{ fontWeight: 700, fontSize: '14px' }}>插入 @ 文档引用</span>
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
        <div style={{ padding: '10px 14px' }}>
          <input
            ref={filterInputRef}
            placeholder="筛选文件名…"
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
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 8px 12px' }}>
          {filtered.length === 0 && !err && (
            <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', margin: '8px 12px' }}>
              暂无文件
            </p>
          )}
          {filtered.map((f) => (
            <button
              key={f.path}
              type="button"
              onClick={() => {
                const short = libraryId ? toShortLibraryMention(f.path, libraryId) : null
                onPick(short ?? f.path)
                onClose()
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
                cursor: 'pointer',
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
              <div style={{ fontWeight: 600 }}>{f.label}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', wordBreak: 'break-all' }}>
                {`${LIBRARY_CHAT_MENTION_PREFIX}${toLibraryRelativePath(f.path)}`}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
