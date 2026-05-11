import { useEffect, useRef, useState, type ReactNode } from 'react'

const FAKE_MODELS = ['Claude Sonnet', 'Claude Opus', 'Claude Haiku'] as const
const FAKE_SKILLS = ['PRD 证据补强', '周报结构化', 'Connector 健康检查'] as const

function IconBtn({
  title,
  onClick,
  children,
  className = '',
}: {
  title: string
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cd-border bg-cd-surface text-cd-muted transition-colors hover:border-cd-muted/40 hover:bg-cd-page hover:text-j-ink ${className}`}
    >
      {children}
    </button>
  )
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  )
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function SparklesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z" />
      <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
    </svg>
  )
}

function SendPlaneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" aria-hidden>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />
    </svg>
  )
}

export type CdChatComposerProps = {
  placeholder?: string
}

export function CdChatComposer({ placeholder = '发给 Kevin…' }: CdChatComposerProps) {
  const [modelOpen, setModelOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [model, setModel] = useState<string>(FAKE_MODELS[0])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!modelOpen && !skillsOpen) return
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setModelOpen(false)
        setSkillsOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [modelOpen, skillsOpen])

  return (
    <div className="shrink-0 border-t border-cd-border bg-cd-page p-2.5">
      <div
        ref={wrapRef}
        className="rounded-2xl border border-cd-border bg-cd-surface p-3 shadow-sm"
        style={{ borderRadius: '14px' }}
      >
        <div className="min-h-[4.5rem]">
          <textarea
            readOnly
            rows={3}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent px-0.5 py-1 text-sm leading-relaxed text-j-ink outline-none placeholder:text-cd-muted"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-cd-border pt-2.5">
          <div className="relative flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <IconBtn
                title={`模型与设置 · ${model}`}
                onClick={() => {
                  setSkillsOpen(false)
                  setModelOpen((v) => !v)
                }}
              >
                <GearIcon />
              </IconBtn>
              {modelOpen && (
                <div className="absolute bottom-full left-0 z-40 mb-1.5 min-w-[11rem] rounded-lg border border-cd-border bg-cd-surface py-1 shadow-lg">
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cd-muted">模型</p>
                  {FAKE_MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setModel(m)
                        setModelOpen(false)
                      }}
                      className={`block w-full px-2.5 py-1.5 text-left text-xs ${
                        m === model ? 'bg-cd-page font-medium text-j-ink' : 'text-cd-muted hover:bg-cd-page hover:text-j-ink'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <IconBtn
              title="附件"
              onClick={() => {
                window.alert('附件（原型占位）')
              }}
            >
              <PaperclipIcon />
            </IconBtn>
            <div className="relative">
              <IconBtn
                title="技能"
                onClick={() => {
                  setModelOpen(false)
                  setSkillsOpen((v) => !v)
                }}
              >
                <SparklesIcon />
              </IconBtn>
              {skillsOpen && (
                <div className="absolute bottom-full left-0 z-40 mb-1.5 min-w-[10rem] rounded-lg border border-cd-border bg-cd-surface py-1 shadow-lg">
                  <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-cd-muted">Skills</p>
                  {FAKE_SKILLS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSkillsOpen(false)}
                      className="block w-full px-2.5 py-1.5 text-left text-xs text-cd-muted hover:bg-cd-page hover:text-j-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="flex h-9 items-center rounded-lg border border-cd-border bg-cd-surface px-3 text-xs font-medium text-cd-muted transition-colors hover:border-cd-muted/40 hover:bg-cd-page hover:text-j-ink"
            >
              Import
            </button>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-j-brand px-4 py-2 text-sm font-semibold text-j-cream shadow-md transition hover:bg-j-brand/92 active:scale-[0.98]"
          >
            <SendPlaneIcon />
            Send
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-cd-muted">@ 引用材料 · / 技能 · 拖拽文件（原型占位）</p>
    </div>
  )
}
