import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '../../contexts/SessionContext'

type GlobalSearchViewProps = {
  onBack: () => void
}

export function GlobalSearchView({ onBack }: GlobalSearchViewProps) {
  const { sessions, setActiveSessionId } = useSession()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const keyword = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!keyword) return []
    return sessions.filter((s) => {
      const title = (s.title || '').toLowerCase()
      const preview = (s.artifactPreview || '').toLowerCase()
      return title.includes(keyword) || preview.includes(keyword)
    })
  }, [sessions, keyword])

  const hasKeyword = keyword.length > 0

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="全局搜索"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBack()
      }}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'color-mix(in srgb, var(--color-surface) 35%, transparent)',
        zIndex: 30,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px',
      }}
    >
      <div
        style={{
          width: 'min(760px, 96%)',
          maxHeight: '80%',
          borderRadius: '14px',
          overflow: 'hidden',
          border: '1px solid var(--color-outline-variant)',
          background: 'var(--color-background)',
          boxShadow: '0 16px 38px rgba(0,0,0,0.28)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
      <div
        style={{
          height: '52px',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '0 12px',
          flexShrink: 0,
          background: 'var(--color-surface-container-lowest)',
        }}
      >
        <button
          type="button"
          aria-label="关闭搜索"
          onClick={onBack}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--color-on-surface-variant)',
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span>
        </button>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-on-surface)' }}>全局搜索</span>
      </div>

      <div style={{ padding: '12px', borderBottom: '1px solid var(--color-outline-variant)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '10px',
            padding: '8px 10px',
            background: 'var(--color-surface-container-lowest)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话标题或制品摘要..."
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
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
              输入关键词后可搜索历史会话标题和制品摘要。文档库 / Sensor 深度检索将在后续索引接线后启用。
            </div>
          </div>
        )}

        {hasKeyword && (
          <>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-on-surface-variant)', marginBottom: '8px' }}>
              历史会话（{results.length}）
            </div>
            {results.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>未匹配到会话结果。</div>
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
          </>
        )}
      </div>
      </div>
    </div>
  )
}
