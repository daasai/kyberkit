import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import {
  emitOpenLibraryFile,
  LIBRARY_CHAT_MENTION_PREFIX,
  toLibraryRelativePath,
} from '../../lib/librarySelection'

type GlobalSearchViewProps = {
  onBack: () => void
}

type LibraryHit = {
  path: string
  relLabel: string
  snippet: string
}

export function GlobalSearchView({ onBack }: GlobalSearchViewProps) {
  const { sessions, setActiveSessionId, spaceId } = useSession()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const keyword = query.trim().toLowerCase()

  const [libraryHits, setLibraryHits] = useState<LibraryHit[]>([])
  const [libraryErr, setLibraryErr] = useState<string | null>(null)
  const [libraryBusy, setLibraryBusy] = useState(false)
  const debounceRef = useRef<number | null>(null)

  const results = useMemo(() => {
    if (!keyword) return []
    return sessions.filter((s) => {
      const title = (s.title || '').toLowerCase()
      const preview = (s.artifactPreview || '').toLowerCase()
      return title.includes(keyword) || preview.includes(keyword)
    })
  }, [sessions, keyword])

  const hasKeyword = keyword.length > 0
  const canSearchLibrary = Boolean(spaceId) && query.trim().length >= 2

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onBack])

  useEffect(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!spaceId || query.trim().length < 2) {
      setLibraryHits([])
      setLibraryErr(null)
      setLibraryBusy(false)
      return
    }

    setLibraryBusy(true)
    setLibraryErr(null)
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null
      const u = new URL(`${SIDECAR_URL}/library/search${qsSpace(spaceId)}`)
      u.searchParams.set('q', query.trim())
      void fetch(u.toString())
        .then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as { hits?: LibraryHit[]; error?: string }
          if (!r.ok) {
            setLibraryErr(typeof j.error === 'string' ? j.error : `文档库搜索失败 (${r.status})`)
            setLibraryHits([])
            return
          }
          setLibraryHits(Array.isArray(j.hits) ? j.hits : [])
        })
        .catch(() => {
          setLibraryErr('网络错误')
          setLibraryHits([])
        })
        .finally(() => setLibraryBusy(false))
    }, 280)

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [spaceId, query])

  return (
    <section
      aria-label="全局搜索"
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface-container-lowest)',
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
          ← 返回
        </button>
        <span style={{ fontWeight: 700 }}>全局搜索</span>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-outline-variant)', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '10px',
            padding: '8px 10px',
            background: 'var(--color-surface)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话标题、制品摘要或文档库正文（至少 2 个字符）…"
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--color-on-surface)',
              fontSize: '14px',
            }}
          />
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
          {!hasKeyword && (
            <div
              style={{
                border: '1px dashed var(--color-outline-variant)',
                borderRadius: '12px',
                padding: '20px',
                background: 'var(--color-surface-container-lowest)',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '8px' }}>
                搜索中心（Global Search）
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>
                输入关键词可搜索当前 Space 下的历史会话标题、制品摘要，以及文档库内常见文本文件（Markdown、代码、JSON 等）的正文片段。文档库搜索为实时扫描，大库可能略慢。
              </div>
            </div>
          )}

          {hasKeyword && (
            <>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-on-surface-variant)', marginBottom: '8px' }}>
                历史会话（{results.length}）
              </div>
              {results.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', marginBottom: '14px' }}>
                  未匹配到会话结果。
                </div>
              ) : (
                results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setActiveSessionId(s.id)
                      onBack()
                    }}
                    style={{
                      width: '100%',
                      border: '1px solid var(--color-outline-variant)',
                      borderRadius: '10px',
                      background: 'var(--color-surface-container-lowest)',
                      padding: '10px 12px',
                      marginBottom: '8px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: 'var(--color-on-surface)',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{s.title}</div>
                    {s.artifactPreview && (
                      <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>
                        {s.artifactPreview}
                      </div>
                    )}
                  </button>
                ))
              )}

              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--color-on-surface-variant)',
                  marginTop: '12px',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>文档库</span>
                {canSearchLibrary && libraryBusy && (
                  <span style={{ fontWeight: 500, fontSize: '11px' }}>搜索中…</span>
                )}
              </div>
              {!spaceId && (
                <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>未绑定 Space，无法搜索文档库。</div>
              )}
              {spaceId && query.trim().length < 2 && (
                <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                  文档库正文搜索请输入至少 2 个字符。
                </div>
              )}
              {libraryErr && (
                <div style={{ fontSize: '13px', color: 'var(--color-error)', marginBottom: '8px' }}>{libraryErr}</div>
              )}
              {spaceId && query.trim().length >= 2 && !libraryBusy && !libraryErr && libraryHits.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>未在文档库文本文件中匹配到结果。</div>
              )}
              {libraryHits.map((h) => (
                <button
                  key={h.path}
                  type="button"
                  onClick={() => {
                    if (!spaceId) return
                    emitOpenLibraryFile({ spaceId, path: h.path })
                    onBack()
                  }}
                  style={{
                    width: '100%',
                    border: '1px solid var(--color-outline-variant)',
                    borderRadius: '10px',
                    background: 'var(--color-surface-container-lowest)',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--color-on-surface)',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, wordBreak: 'break-all' }}>
                    {`${LIBRARY_CHAT_MENTION_PREFIX}${toLibraryRelativePath(h.path)}`}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '6px', lineHeight: 1.45 }}>
                    {h.snippet}
                  </div>
                </button>
              ))}
            </>
          )}
      </div>
    </section>
  )
}
