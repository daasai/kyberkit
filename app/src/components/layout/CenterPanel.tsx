import { useEffect, useRef, useState, useCallback } from 'react'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react'
import { replaceAll } from '@milkdown/utils'
import { useArtifact } from '../../contexts/ArtifactContext'
import { useSession } from '../../contexts/SessionContext'
import { KEVIN_FOCUS_CENTER_EVENT } from '../../lib/focusCenter'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { inferArtifactTitle, truncateTitle } from '../../lib/artifactTitle'

const WELCOME_MARKDOWN = `# 欢迎使用 Kevin

在右侧输入任务，或使用 **快速启动** 里的示例模板（仅为演示，不代表预装 Skill）。

主产物与文档编辑在**中栏画布**；右侧为对话与过程追踪。

---

**如何开始**

- 用 \`@\` 引用文档库中的路径（见左侧「文档库」）
- 在输入区附加说明或粘贴上下文
- 输入 \`/\` 可唤起已安装的 Skill（若已配置）

示例模板与文案均为产品演示，**不表示**系统预装对应能力。
`

function MilkdownEditor({ content, streaming }: { content: string; streaming: boolean }) {
  const [, getEditor] = useInstance()
  const lastMarkdown = useRef<string | null>(null)

  useEditor((root) =>
    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, root)
        // Initial paint; incremental updates go through replaceAll below.
        ctx.set(defaultValueCtx, WELCOME_MARKDOWN)
      })
      .use(commonmark)
      .use(gfm)
      .use(history),
  )

  // Sync welcome or artifact — wait until ProseMirror is ready (getEditor is often null on first paint).
  useEffect(() => {
    const markdown = content.trim().length > 0 ? content : WELCOME_MARKDOWN
    if (markdown === lastMarkdown.current) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 120

    const tick = () => {
      if (cancelled) return
      const editor = getEditor()
      if (editor) {
        lastMarkdown.current = markdown
        editor.action(replaceAll(markdown))
        return
      }
      attempts += 1
      if (attempts < maxAttempts) {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
    return () => {
      cancelled = true
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
  const { artifact, loadArtifact, clearArtifact } = useArtifact()
  const { sessions, activeSessionId, setActiveSessionId, spaceId } = useSession()
  const [openTabIds, setOpenTabIds] = useState<string[]>([])
  const [artifactTitleBySession, setArtifactTitleBySession] = useState<Record<string, string>>({})
  const [centerFlash, setCenterFlash] = useState(false)
  const canvasAnchorRef = useRef<HTMLDivElement>(null)

  const onFocusCenterRequest = useCallback(() => {
    document.getElementById('kevin-center-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    canvasAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setCenterFlash(true)
    window.setTimeout(() => setCenterFlash(false), 1200)
  }, [])

  useEffect(() => {
    const handler = () => onFocusCenterRequest()
    window.addEventListener(KEVIN_FOCUS_CENTER_EVENT, handler)
    return () => window.removeEventListener(KEVIN_FOCUS_CENTER_EVENT, handler)
  }, [onFocusCenterRequest])

  // Add session to open tabs when it becomes active
  useEffect(() => {
    if (!activeSessionId) return
    setOpenTabIds((prev) => (prev.includes(activeSessionId) ? prev : [...prev, activeSessionId]))
  }, [activeSessionId])

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenTabIds(prev => prev.filter(tid => tid !== id))
  }

  /** Keep Milkdown in sync when switching tabs (same as LeftSidebar session select). */
  const activateSessionTab = useCallback(
    async (id: string) => {
      setActiveSessionId(id)
      try {
        const res = await fetch(`${SIDECAR_URL}/sessions/${id}${qsSpace(spaceId)}`)
        if (!res.ok) return
        const data = (await res.json()) as { artifactContent?: string }
        if (data.artifactContent?.trim()) {
          loadArtifact(id, data.artifactContent)
          const inferred = inferArtifactTitle(data.artifactContent)
          if (inferred) {
            setArtifactTitleBySession((prev) => ({ ...prev, [id]: inferred }))
          }
        } else {
          clearArtifact()
        }
      } catch {
        /* ignore */
      }
    },
    [setActiveSessionId, loadArtifact, clearArtifact, spaceId],
  )

  // Keep tab title synced with the latest in-memory artifact while streaming/after completion.
  useEffect(() => {
    if (!artifact.sessionId) return
    const inferred = inferArtifactTitle(artifact.content)
    if (!inferred) return
    setArtifactTitleBySession((prev) => ({ ...prev, [artifact.sessionId as string]: inferred }))
  }, [artifact.sessionId, artifact.content])

  const getTabLabel = (id: string): string => {
    if (artifact.sessionId === id) {
      const live = inferArtifactTitle(artifact.content)
      if (live) return truncateTitle(live, 18)
    }
    const artTitle = artifactTitleBySession[id]
    if (artTitle) return truncateTitle(artTitle, 18)
    const session = sessions.find(s => s.id === id)
    if (!session) return id.slice(0, 8)
    if (session.title === 'New Session') return '新会话'
    return truncateTitle(session.title, 18)
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
      outline: centerFlash ? '2px solid color-mix(in srgb, var(--color-primary) 55%, transparent)' : 'none',
      outlineOffset: centerFlash ? '-2px' : 0,
      transition: 'outline-color 0.35s ease',
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
                <button
                  key={id}
                  type="button"
                  onClick={() => void activateSessionTab(id)}
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
                    textAlign: 'left',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', flexShrink: 0 }}>description</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {getTabLabel(id)}
                  </span>
                  <button
                    onClick={e => closeTab(id, e)}
                    type="button"
                    style={{
                      flexShrink: 0, background: 'transparent', border: 'none',
                      cursor: 'pointer', padding: '2px', borderRadius: '4px',
                      color: 'var(--color-on-surface-variant)',
                      display: 'flex', alignItems: 'center',
                      transition: 'background 150ms',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>close</span>
                  </button>
                </button>
              )
            })
          )}
        </div>

        {/* Right actions */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center', paddingBottom: '4px', flexShrink: 0 }}>
          {['edit', 'more_horiz'].map(icon => (
            <button key={icon} type="button" style={{
              padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px',
              cursor: 'pointer', color: 'var(--color-on-surface-variant)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 150ms',
            }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
            </button>
          ))}
          {/* Copy artifact button */}
          {displayContent && (
            <button
              onClick={() => navigator.clipboard.writeText(displayContent)}
              title="复制为 Markdown"
              type="button"
              style={{
                padding: '4px 10px', background: 'transparent', border: '1px solid var(--color-outline-variant)',
                borderRadius: '6px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', transition: 'background 150ms',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>content_copy</span>
              复制
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Canvas */}
      <div
        className="custom-scrollbar"
        data-testid="artifact-primary-view"
        style={{ flex: 1, overflowY: 'auto', padding: '40px 48px' }}
      >
        <div id="kevin-center-canvas-anchor" ref={canvasAnchorRef} style={{ maxWidth: '800px', margin: '0 auto' }}>
          <MilkdownProvider key={activeSessionId ?? 'welcome'}>
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
