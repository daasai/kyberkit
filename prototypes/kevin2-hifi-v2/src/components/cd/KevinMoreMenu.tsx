import { useEffect, useRef, useState } from 'react'
import { useFlow } from '../../flow/FlowContext'

export function KevinMoreMenu() {
  const { go } = useFlow()
  const [open, setOpen] = useState(false)
  const [islandExpanded, setIslandExpanded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-cd-border text-cd-muted hover:border-j-brand/30 hover:bg-cd-surface hover:text-j-ink"
        title="更多"
      >
        <span className="text-base leading-none">⋯</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-cd-border bg-cd-surface p-3 shadow-lg">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-cd-muted">搜索</label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-cd-muted" aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              placeholder="搜索 Workspace…"
              className="w-full rounded-lg border border-cd-border bg-cd-page py-1.5 pl-8 pr-2 text-xs text-j-ink outline-none placeholder:text-cd-muted focus:border-j-brand/40"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-cd-muted">通知</span>
            <span className="rounded-full bg-j-danger/15 px-2 py-0.5 text-[11px] font-semibold text-j-danger">3</span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-cd-muted">1 条待签批 · 2 条材料更新</p>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-cd-border py-1.5 text-center text-[11px] font-medium text-j-ink hover:bg-cd-page"
            onClick={() => {
              setOpen(false)
              go('settings')
            }}
          >
            Settings
          </button>
          <div className="mt-3 border-t border-cd-border pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-cd-muted">灵动岛</p>
            <button
              type="button"
              onClick={() => setIslandExpanded((e) => !e)}
              className="mt-1.5 flex w-full flex-col items-stretch rounded-full border border-cd-border bg-cd-page px-3 py-2 text-left text-[11px] transition hover:border-j-brand/30"
            >
              <span className="font-medium text-j-ink">{islandExpanded ? 'Workspace 活动' : '轻触展开状态'}</span>
              {islandExpanded ? (
                <span className="mt-1 text-[10px] leading-relaxed text-cd-muted">
                  Indexing library…
                  <br />
                  1 pending signoff
                </span>
              ) : (
                <span className="mt-0.5 truncate text-[10px] text-cd-muted">Indexing… · 1 pending signoff</span>
              )}
            </button>
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-cd-border py-1.5 text-[11px] font-medium text-j-ink hover:bg-cd-page"
            onClick={() => {
              setOpen(false)
              go('mykevin')
            }}
          >
            My Kevin
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-cd-border py-1.5 text-[11px] font-medium text-j-ink hover:bg-cd-page"
            onClick={() => {
              setOpen(false)
              go('setup')
            }}
          >
            创建工作区
          </button>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-dashed border-cd-border py-1.5 text-[11px] text-cd-muted hover:bg-cd-page hover:text-j-ink"
            onClick={() => {
              setOpen(false)
              go('svgGallery')
            }}
          >
            SVG 图库（筛选）
          </button>
        </div>
      )}
    </div>
  )
}
