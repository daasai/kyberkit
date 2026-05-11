import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react'
import { Editor, editorViewCtx, rootCtx, defaultValueCtx, serializerCtx } from '@milkdown/core'
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
import { joinLibraryFileRef, toLibraryRelativePath } from '../../lib/librarySelection'
import { markdownSaveTargetPath } from '../../lib/markdownSaveTarget'
import { WelcomeGuideCard } from '../onboarding/WelcomeGuideCard'
import { LibraryDirPicker } from './LibraryDirPicker'

function readWelcomeGuideDismissed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('kevin:guide-seen') === '1'
  } catch {
    return false
  }
}

const WELCOME_MARKDOWN = `# 欢迎使用 Kevin

在右侧输入任务（仅为演示场景，不代表预装 Skill）。

主产物与文档编辑在**中栏画布**；右侧为对话，顶部为**本会话制品**列表（可打开到中栏）。

---

**如何开始**

- 用 \`@\` 引用文档库中的路径（见左侧「文档库」）
- 在输入区附加说明或粘贴上下文
- 输入 \`/\` 可唤起已安装的 Skill（若已配置）

示例模板与文案均为产品演示，**不表示**系统预装对应能力。
`

export type MilkdownCanvasHandle = { getMarkdown: () => string }

const MilkdownEditor = forwardRef<MilkdownCanvasHandle, { content: string; streaming: boolean; loadSeq: number }>(
  function MilkdownEditor({ content, streaming, loadSeq }, ref) {
  const [, getEditor] = useInstance()
  const lastApplied = useRef<{ markdown: string; loadSeq: number } | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      getMarkdown: () => {
        const editor = getEditor()
        if (!editor) return ''
        try {
          const view = editor.ctx.get(editorViewCtx)
          const serializer = editor.ctx.get(serializerCtx)
          return serializer(view.state.doc)
        } catch {
          return ''
        }
      },
    }),
    [getEditor],
  )

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
    const prev = lastApplied.current
    if (prev && prev.markdown === markdown && prev.loadSeq === loadSeq) return

    let cancelled = false
    let attempts = 0
    const maxAttempts = 120

    const tick = () => {
      if (cancelled) return
      const editor = getEditor()
      if (editor) {
        lastApplied.current = { markdown, loadSeq }
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
  }, [content, loadSeq, getEditor])

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
})

MilkdownEditor.displayName = 'MilkdownEditor'

export type CenterPanelProps = {
  /** When provided (from AppShell), tab list survives Search / SkillStore routes that unmount CenterPanel. */
  openTabIds?: string[]
  setOpenTabIds?: Dispatch<SetStateAction<string[]>>
}

export function CenterPanel({ openTabIds: openTabIdsProp, setOpenTabIds: setOpenTabIdsProp }: CenterPanelProps = {}) {
  const { artifact, loadArtifact, clearArtifact, setSavedPath } = useArtifact()
  const { sessions, activeSessionId, setActiveSessionId, spaceId, spaces } = useSession()
  const [localOpenTabIds, setLocalOpenTabIds] = useState<string[]>([])
  const openTabIds = openTabIdsProp ?? localOpenTabIds
  const setOpenTabIds = setOpenTabIdsProp ?? setLocalOpenTabIds
  const [artifactTitleBySession, setArtifactTitleBySession] = useState<Record<string, string>>({})
  const [centerFlash, setCenterFlash] = useState(false)
  const [welcomeGuideDismissed, setWelcomeGuideDismissed] = useState(readWelcomeGuideDismissed)
  const [archiveMoveOpen, setArchiveMoveOpen] = useState(false)
  const [archiveMoveErr, setArchiveMoveErr] = useState<string | null>(null)
  const [archiveMoveBusy, setArchiveMoveBusy] = useState(false)
  const [saveHint, setSaveHint] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const canvasAnchorRef = useRef<HTMLDivElement>(null)
  const milkdownRef = useRef<MilkdownCanvasHandle>(null)

  const activeLibraryId = useMemo(
    () => spaces.find((s) => s.id === spaceId)?.libraryId?.trim() ?? null,
    [spaces, spaceId],
  )

  const handlePickArchiveDir = useCallback(
    async (dirRef: string) => {
      const from = artifact.savedPath?.trim()
      if (!spaceId || !from) return
      const base = from.split('/').filter(Boolean).pop() ?? ''
      const toPath = joinLibraryFileRef(dirRef, base)
      if (!toPath) {
        setArchiveMoveErr('无法解析目标路径')
        return
      }
      if (toPath === from) {
        setArchiveMoveErr('文件已在所选文件夹')
        return
      }
      setArchiveMoveBusy(true)
      setArchiveMoveErr(null)
      try {
        const res = await fetch(`${SIDECAR_URL}/library/move${qsSpace(spaceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromPath: from, toPath }),
        })
        const data = (await res.json().catch(() => ({}))) as { error?: string; path?: string }
        if (!res.ok) {
          setArchiveMoveErr(typeof data.error === 'string' ? data.error : `移动失败 (${res.status})`)
          return
        }
        const next = typeof data.path === 'string' ? data.path : toPath
        setSavedPath(next)
        setArchiveMoveOpen(false)
      } catch {
        setArchiveMoveErr('网络错误')
      } finally {
        setArchiveMoveBusy(false)
      }
    },
    [artifact.savedPath, spaceId, setSavedPath],
  )

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
  }, [activeSessionId, setOpenTabIds])

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

  const closeTab = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      setOpenTabIds((prev) => {
        const idx = prev.indexOf(id)
        const filtered = prev.filter((tid) => tid !== id)
        if (id === activeSessionId) {
          if (filtered.length > 0) {
            const pick = filtered[Math.max(0, idx - 1)] ?? filtered[0]
            queueMicrotask(() => void activateSessionTab(pick))
          } else {
            queueMicrotask(() => {
              setActiveSessionId(null)
              clearArtifact()
            })
          }
        }
        return filtered
      })
    },
    [activeSessionId, setOpenTabIds, activateSessionTab, setActiveSessionId, clearArtifact],
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
  const canvasLoadSeq = artifact.loadSeq
  const showWelcomeGuide =
    !welcomeGuideDismissed && !displayContent.trim() && !isStreaming

  const mdSavePath = markdownSaveTargetPath(artifact)

  /**
   * 写回当前打开的库内 Markdown。不重命名路径：按标题生成文件名仅在侧栏
   * `saveArtifact`（流式制品首次落盘）阶段执行，避免改动用户已命名的存量文档。
   */
  const handleSaveMarkdown = useCallback(async () => {
    if (!spaceId || !mdSavePath || saveBusy) return
    const body = milkdownRef.current?.getMarkdown() ?? ''
    setSaveBusy(true)
    setSaveHint(null)
    try {
      const res = await fetch(`${SIDECAR_URL}/library/write${qsSpace(spaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: mdSavePath, content: body }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveHint(typeof data.error === 'string' ? data.error : `保存失败 (${res.status})`)
        return
      }
      setSaveHint('已保存')
      window.setTimeout(() => setSaveHint(null), 2000)
    } catch {
      setSaveHint('网络错误')
    } finally {
      setSaveBusy(false)
    }
  }, [spaceId, mdSavePath, saveBusy])

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
        <div role="tablist" aria-label="画布会话" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
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
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  onClick={() => void activateSessionTab(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      void activateSessionTab(id)
                    }
                  }}
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
                    outline: 'none',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '14px', flexShrink: 0 }}>description</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                    {getTabLabel(id)}
                  </span>
                  <button
                    onClick={e => closeTab(id, e)}
                    type="button"
                    aria-label="关闭标签"
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
                </div>
              )
            })
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', paddingBottom: '4px', flexShrink: 0 }}>
          {saveHint && (
            <span style={{ fontSize: '11px', color: saveHint === '已保存' ? 'var(--color-primary)' : 'var(--color-error)' }}>{saveHint}</span>
          )}
          <button
            type="button"
            title={mdSavePath ? '将当前 Markdown 写回文档库' : '仅 Markdown 文档可保存'}
            disabled={!mdSavePath || saveBusy || isStreaming}
            onClick={() => void handleSaveMarkdown()}
            style={{
              padding: '6px 14px',
              background: !mdSavePath || saveBusy || isStreaming ? 'var(--color-surface-container)' : 'var(--color-primary)',
              border: 'none',
              borderRadius: '8px',
              cursor: !mdSavePath || saveBusy || isStreaming ? 'not-allowed' : 'pointer',
              color: !mdSavePath || saveBusy || isStreaming ? 'var(--color-on-surface-variant)' : 'var(--color-on-primary)',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>save</span>
            保存
          </button>
        </div>
      </div>

      {artifact.savedPath && (
        <div
          style={{
            flexShrink: 0,
            padding: '10px 16px',
            borderBottom: '1px solid var(--color-outline-variant)',
            background: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
            fontSize: '12px',
            color: 'var(--color-on-surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>已保存至</span>
            <code style={{ fontSize: '11px', wordBreak: 'break-all' }}>
              {`@/${toLibraryRelativePath(artifact.savedPath)}`}
            </code>
            <button
              type="button"
              onClick={() => {
                setArchiveMoveOpen((o) => {
                  const next = !o
                  if (next) setArchiveMoveErr(null)
                  return next
                })
              }}
              style={{
                padding: '4px 10px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface)',
                cursor: 'pointer',
              }}
            >
              更改位置
            </button>
            <button
              type="button"
              onClick={() => setSavedPath(null)}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-on-surface-variant)',
              }}
              title="关闭"
            >
              ×
            </button>
          </div>
          {archiveMoveOpen && spaceId && (
            <LibraryDirPicker
              spaceId={spaceId}
              libraryId={activeLibraryId}
              open={archiveMoveOpen}
              busy={archiveMoveBusy}
              error={archiveMoveErr}
              onClose={() => {
                if (archiveMoveBusy) return
                setArchiveMoveOpen(false)
              }}
              onPickDir={(dirRef) => {
                void handlePickArchiveDir(dirRef)
              }}
            />
          )}
        </div>
      )}

      {/* Scrollable Canvas */}
      <div
        className="custom-scrollbar"
        data-testid="artifact-primary-view"
        style={{ flex: 1, overflowY: 'auto', padding: '40px 48px' }}
      >
        <div id="kevin-center-canvas-anchor" ref={canvasAnchorRef} style={{ maxWidth: '800px', margin: '0 auto' }}>
          {showWelcomeGuide ? (
            <WelcomeGuideCard
              onDismiss={() => {
                try {
                  localStorage.setItem('kevin:guide-seen', '1')
                } catch {
                  /* ignore */
                }
                setWelcomeGuideDismissed(true)
              }}
            />
          ) : (
            <MilkdownProvider key={activeSessionId ?? 'welcome'}>
              <MilkdownEditor ref={milkdownRef} content={displayContent} streaming={isStreaming} loadSeq={canvasLoadSeq} />
            </MilkdownProvider>
          )}
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
