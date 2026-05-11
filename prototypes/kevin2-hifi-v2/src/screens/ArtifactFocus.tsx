import { useState } from 'react'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { ResizeHandle } from './ResizeHandle'
import { mockMaterialsUsed } from '../mock/static'
import { useFlow } from '../flow/FlowContext'
import { CdMicroTabRow } from '../components/cd/CdMicroTabRow'
import { KevinBrandCompact } from '../components/brand/KevinBrand'
import { CdChatThread } from '../components/cd/CdChatThread'

const inspectorTabs = ['Inspector', 'Materials', 'Comments', 'Versions', 'Actions', 'Audit'] as const
const canvasModes = ['Preview', 'Structure', 'Tweak', 'Review'] as const

type Props = {
  onOpenActionPanel: () => void
}

export function ArtifactFocus({ onOpenActionPanel }: Props) {
  const { go } = useFlow()
  const [tab, setTab] = useState<(typeof inspectorTabs)[number]>('Materials')
  const [canvasMode, setCanvasMode] = useState<(typeof canvasModes)[number]>('Preview')

  const chatTop = (
    <CdMicroTabRow
      left={
        <button type="button" onClick={() => go('workspace')} className="text-[11px] font-medium text-j-brand hover:underline">
          ← Workspace
        </button>
      }
      center={<span className="text-[10px] font-semibold uppercase tracking-wide text-cd-muted">Contextual Chat</span>}
      right={null}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CdMicroTabRow
        left={
          <span className="flex min-w-0 items-center gap-2 px-1">
            <KevinBrandCompact />
            <span className="text-cd-muted">·</span>
            <span className="font-medium text-j-ink">Artifact</span>
            <span className="text-cd-muted">·</span>
            <span className="truncate text-cd-muted">Q2 增长 PRD</span>
          </span>
        }
        center={null}
        right={
          <>
            <button
              type="button"
              onClick={() => go('workspace')}
              className="rounded border border-cd-border px-1.5 py-0 text-[10px] hover:bg-cd-page"
            >
              Workspace ▾
            </button>
            <button
              type="button"
              className="rounded border border-cd-border bg-j-ink px-2 py-0 text-[10px] font-semibold text-cd-surface hover:bg-j-ink/90"
            >
              Share
            </button>
          </>
        }
      />

      <div className="min-h-0 flex-1 p-2">
        <PanelGroup direction="horizontal" className="h-full overflow-hidden rounded-lg border border-cd-border bg-cd-surface shadow-sm">
          <Panel defaultSize={26} minSize={18} maxSize={36} className="min-w-0">
            <CdChatThread variant="artifact" topTabs={chatTop} />
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={48} minSize={34}>
            <div className="flex h-full min-h-0 flex-col bg-cd-surface">
              <div className="flex h-8 shrink-0 items-center gap-0 border-b border-cd-border px-1">
                {canvasModes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCanvasMode(m)}
                    className={`relative px-3 py-1.5 text-[11px] font-medium ${
                      canvasMode === m ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
                    }`}
                  >
                    {m}
                    {canvasMode === m && (
                      <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-j-brand" />
                    )}
                  </button>
                ))}
              </div>
              <div
                className={`proto-scroll flex-1 overflow-auto p-4 ${
                  canvasMode === 'Review' ? 'cd-grid-canvas' : ''
                }`}
              >
                {canvasMode === 'Review' && (
                  <p className="mb-4 text-center font-display text-lg text-cd-muted/90">Review · Diff 与建议（占位）</p>
                )}
                <article
                  className={`mx-auto max-w-2xl space-y-5 ${
                    canvasMode === 'Review' ? 'rounded-lg border border-cd-border bg-cd-surface p-5 shadow-sm' : ''
                  }`}
                >
                  <header>
                    <h1 className="font-display text-2xl text-j-ink">Q2 增长 PRD</h1>
                    <p className="mt-0.5 text-xs text-cd-muted">SemanticArtifact · prd · review</p>
                  </header>
                  <section>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold">Problem</h2>
                      <span className="rounded-full border border-j-brand/40 bg-j-accent/10 px-2 py-0.5 text-[9px] font-semibold uppercase text-j-brand">
                        Evidence
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-j-ink">
                      增长团队反馈：排期不透明导致实验迭代变慢。此处应引用访谈笔记中的用户原话…
                    </p>
                  </section>
                  <section>
                    <h2 className="mb-1.5 text-sm font-semibold">Users</h2>
                    <p className="text-sm leading-relaxed text-j-ink">ICP：年营收 500万–5000万美金的 SMB…</p>
                  </section>
                </article>
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={26} minSize={20} maxSize={34}>
            <div className="flex h-full min-h-0 flex-col border-l border-cd-border bg-cd-surface">
              <div className="flex h-8 shrink-0 flex-wrap items-center border-b border-cd-border px-0.5">
                {inspectorTabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`relative px-1.5 py-1.5 text-[10px] font-medium sm:text-[11px] ${
                      tab === t ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
                    }`}
                  >
                    {t}
                    {tab === t && <span className="absolute bottom-0 left-0.5 right-0.5 h-0.5 bg-j-brand" />}
                  </button>
                ))}
              </div>
              <div className="proto-scroll flex-1 overflow-auto p-2.5 text-sm">
                {tab === 'Materials' && (
                  <div>
                    <p className="text-[11px] font-medium text-cd-muted">Materials Used</p>
                    <ul className="mt-2 space-y-2">
                      {mockMaterialsUsed.map((m) => (
                        <li key={m.id} className="rounded-md border border-cd-border p-2">
                          <p className="text-[13px] font-medium text-j-brand">{m.name}</p>
                          <p className="mt-0.5 text-[11px] text-cd-muted">{m.snippet}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tab === 'Inspector' && (
                  <div className="space-y-2 text-[11px] text-cd-muted">
                    <p>block 属性与校验。</p>
                    <p className="rounded border border-cd-border bg-cd-page p-2 font-mono text-[10px]">problem · needs_evidence</p>
                  </div>
                )}
                {tab === 'Comments' && <p className="text-[11px] text-cd-muted">block 锚定评论（占位）。</p>}
                {tab === 'Versions' && (
                  <ul className="space-y-1 text-[11px] text-cd-muted">
                    <li className="flex justify-between border-b border-cd-border py-1">
                      <span>v0.4</span>
                      <span>今天</span>
                    </li>
                    <li className="flex justify-between py-1">
                      <span>v0.3</span>
                      <span>昨天</span>
                    </li>
                  </ul>
                )}
                {tab === 'Actions' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-cd-muted">ActionRequest · External Projection</p>
                    <button
                      type="button"
                      onClick={onOpenActionPanel}
                      className="w-full rounded-lg bg-j-brand py-2 text-xs font-semibold text-j-cream hover:bg-j-brand/90"
                    >
                      投影到飞书…
                    </button>
                  </div>
                )}
                {tab === 'Audit' && (
                  <ul className="font-mono text-[10px] text-cd-muted">
                    <li>artifact.diff_applied</li>
                    <li>evidence_ref.updated</li>
                  </ul>
                )}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
