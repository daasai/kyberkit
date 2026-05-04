import { useEffect, useRef, useState } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { replaceAll } from '@milkdown/utils'
import { useArtifact } from '../../contexts/ArtifactContext'
import { useSession } from '../../contexts/SessionContext'

const WELCOME_MARKDOWN = `# 欢迎使用 Kevin

在右侧选择一个**快速启动**场景，或直接向 Kevin 提问。

Kevin 生成的文档将显示在这里。

---

**使用建议：**

- 📊 **站会数据** — 自动生成昨日业务数据卡片
- 📋 **产品 Spec** — 基于数据模板起草功能升级方案  
- 🔍 **RCA 分析** — 快速生成异常排查报告框架
`

function MilkdownEditor({ content, streaming }: { content: string; streaming: boolean }) {
  const [, getEditor] = useInstance()
  const lastContent = useRef('')

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        ctx.set(defaultValueCtx, content || WELCOME_MARKDOWN)
      })
      .use(commonmark)
      .use(gfm)
      .use(history),
  )

  // Update editor when artifact content changes
  useEffect(() => {
    if (!content) return
    if (content === lastContent.current) return
    lastContent.current = content

    const editor = getEditor()
    if (editor) {
      editor.action(replaceAll(content))
    }
  }, [content, getEditor])

  return (
    <div style={{ position: 'relative' }}>
      {streaming && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '2px', background: 'var(--color-primary)',
          animation: 'progress-bar 2s ease-in-out infinite',
          zIndex: 10,
        }} />
      )}
      <Milkdown />
    </div>
  )
}

export function CenterPanel() {
  const { artifact } = useArtifact()
  const { sessions, activeSessionId } = useSession()
  const [openTabIds, setOpenTabIds] = useState<string[]>([])

  // Add session to open tabs when it becomes active
  useEffect(() => {
    if (activeSessionId && !openTabIds.includes(activeSessionId)) {
      setOpenTabIds(prev => [...prev, activeSessionId])
    }
  }, [activeSessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenTabIds(prev => prev.filter(tid => tid !== id))
  }

  const getTabLabel = (id: string): string => {
    const session = sessions.find(s => s.id === id)
    if (!session) return id.slice(0, 8)
    if (session.title === 'New Session') return '新会话'
    return session.title.length > 18 ? session.title.slice(0, 18) + '…' : session.title
  }

  const displayContent = artifact.content || ''
  const isStreaming = artifact.streaming

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--color-background)',
      overflow: 'hidden',
    }}>
      {/* Tab Bar */}
      <div style={{
        height: '48px',
        borderBottom: '1px solid var(--color-outline-variant)',
        backgroundColor: 'var(--color-surface-container-lowest)',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '0 16px',
        flexShrink: 0,
        overflowX: 'auto',
      }}>
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {openTabIds.length === 0 ? (
            // Default welcome tab
            <div style={{
              padding: '8px 16px',
              fontSize: '13px', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: '6px',
              border: '1px solid var(--color-outline-variant)',
              borderBottom: '1px solid var(--color-surface)',
              borderRadius: '8px 8px 0 0',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-primary)',
              position: 'relative', top: '1px',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>home</span>
              欢迎
            </div>
          ) : (
            openTabIds.map(id => {
              const isActive = id === activeSessionId
              return (
                <div
                  key={id}
                  role="button"
                  tabIndex={0}
                  style={{
                    padding: '8px 12px',
                    fontSize: '13px', fontWeight: 500,
                    display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer',
                    border: isActive ? '1px solid var(--color-outline-variant)' : 'none',
                    borderBottom: isActive ? '1px solid var(--color-surface)' : 'none',
                    borderRadius: '8px 8px 0 0',
                    backgroundColor: isActive ? 'var(--color-surface)' : 'transparent',
                    color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                    position: 'relative', top: '1px',
                    transition: 'background 150ms, color 150ms',
                    maxWidth: '180px',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', flexShrink: 0 }}>description</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getTabLabel(id)}
                  </span>
                  <button
                    onClick={e => closeTab(id, e)}
                    style={{
                      flexShrink: 0, background: 'transparent', border: 'none',
                      cursor: 'pointer', padding: '2px', borderRadius: '4px',
                      color: 'var(--color-on-surface-variant)',
                      display: 'flex', alignItems: 'center',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>close</span>
                  </button>
                </div>
              )
            })
          )}
        </div>

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center', paddingBottom: '4px', flexShrink: 0 }}>
          {['edit', 'more_horiz'].map(icon => (
            <button key={icon} style={{
              padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px',
              cursor: 'pointer', color: 'var(--color-on-surface-variant)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 150ms',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
            </button>
          ))}
          {/* Copy artifact button */}
          {displayContent && (
            <button
              onClick={() => navigator.clipboard.writeText(displayContent)}
              title="复制为 Markdown"
              style={{
                padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-outline-variant)',
                borderRadius: '6px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', transition: 'background 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
              复制
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Canvas */}
      <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '40px 48px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <MilkdownProvider>
            <MilkdownEditor content={displayContent} streaming={isStreaming} />
          </MilkdownProvider>
        </div>
      </div>

      <style>{`
        @keyframes progress-bar {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(0%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
