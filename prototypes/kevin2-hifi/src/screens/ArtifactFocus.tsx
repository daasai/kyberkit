import { useState } from 'react'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { ResizeHandle } from './ResizeHandle'
import { mockMaterialsUsed } from '../mock/static'

const inspectorTabs = ['Inspector', 'Materials', 'Comments', 'Versions', 'Actions', 'Audit'] as const

type Props = {
  onOpenActionPanel: () => void
}

export function ArtifactFocus({ onOpenActionPanel }: Props) {
  const [tab, setTab] = useState<(typeof inspectorTabs)[number]>('Materials')
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="shrink-0 border-b border-j-muted/15 bg-j-bg px-6 py-3 text-j-cream">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-display text-lg">Kevin</span>
          <span className="text-j-cream/40">|</span>
          <button type="button" className="rounded-md bg-white/10 px-2 py-0.5 hover:bg-white/15">
            Workspace ▼
          </button>
          <span className="text-j-cream/40">|</span>
          <span className="text-j-accent">Artifact: Q2 增长 PRD</span>
          <span className="ml-auto text-xs text-j-cream/60">Island · Share · Settings</span>
        </div>
        <p className="mt-1 text-xs text-j-cream/55">ia v2 §5.3 — Contextual Chat + Artifact Canvas + Inspector（Home Rail 已收敛）</p>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <PanelGroup direction="horizontal" className="h-full rounded-xl border border-j-muted/15 bg-white shadow-sm">
          <Panel defaultSize={26} minSize={18} maxSize={36} className="min-w-0">
            <div className="flex h-full min-h-0 flex-col border-r border-j-muted/10 bg-j-cream/90">
              <div className="shrink-0 border-b border-j-muted/10 px-3 py-2">
                <button type="button" className="text-xs font-medium text-j-brand hover:underline">
                  ← Workspace
                </button>
                <p className="mt-1 text-xs text-j-muted">Contextual Chat</p>
              </div>
              <div className="proto-scroll flex-1 space-y-3 overflow-auto p-3">
                <div className="ml-auto max-w-[95%] rounded-2xl rounded-tr-sm bg-j-brand px-3 py-2 text-sm text-j-cream">
                  把 Problem block 补一段来自访谈笔记的证据引用。
                </div>
                <div className="rounded-2xl rounded-tl-sm border border-j-muted/15 bg-white px-3 py-2 text-sm shadow-sm">
                  已定位 2 段材料，可写入 block；建议在 Review 里过一遍表述。
                </div>
              </div>
              <div className="shrink-0 border-t border-j-muted/10 p-2">
                <button
                  type="button"
                  onClick={() => setSourcesOpen((v) => !v)}
                  className="flex w-full items-center justify-between rounded-lg border border-j-muted/20 bg-white px-2 py-1.5 text-left text-xs text-j-muted"
                >
                  <span>Chat Sources（材料来源）</span>
                  <span>{sourcesOpen ? '▾' : '▸'}</span>
                </button>
                {sourcesOpen && (
                  <ul className="mt-1 space-y-1 rounded-lg bg-j-cream p-2 text-xs text-j-muted">
                    <li>访谈笔记-增长组.md · §3</li>
                    <li>Q2_feature_brief.md · Goals</li>
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={48} minSize={34}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 gap-1 border-b border-j-muted/10 px-2 py-2">
                {(['Preview', 'Structure', 'Tweak', 'Review'] as const).map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      i === 0 ? 'bg-j-brand text-j-cream' : 'text-j-muted hover:bg-j-cream'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="proto-scroll flex-1 overflow-auto p-5">
                <article className="mx-auto max-w-2xl space-y-6">
                  <header>
                    <h1 className="font-display text-3xl text-j-brand">Q2 增长 PRD</h1>
                    <p className="mt-1 text-sm text-j-muted">SemanticArtifact · type: prd · state: review</p>
                  </header>
                  <section>
                    <div className="mb-2 flex items-center gap-2">
                      <h2 className="font-semibold">Problem</h2>
                      <span
                        className="rounded-full border border-j-accent/50 bg-j-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-j-brand"
                        title="Evidence Badge"
                      >
                        Evidence
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-j-ink">
                      增长团队反馈：排期不透明导致实验迭代变慢。此处应引用访谈笔记中的用户原话…
                    </p>
                  </section>
                  <section>
                    <h2 className="mb-2 font-semibold">Users</h2>
                    <p className="text-sm leading-relaxed text-j-ink">ICP：年营收 500万–5000万美金的 SMB…</p>
                  </section>
                </article>
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={26} minSize={20} maxSize={34}>
            <div className="flex h-full min-h-0 flex-col border-l border-j-muted/10 bg-white">
              <div className="flex shrink-0 flex-wrap gap-0.5 border-b border-j-muted/10 p-1">
                {inspectorTabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium sm:text-xs ${
                      tab === t ? 'bg-j-brand text-j-cream' : 'text-j-muted hover:bg-j-cream'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="proto-scroll flex-1 overflow-auto p-3 text-sm">
                {tab === 'Materials' && (
                  <div>
                    <p className="text-xs font-medium text-j-muted">Materials Used（证据链最小呈现 · 05）</p>
                    <ul className="mt-3 space-y-3">
                      {mockMaterialsUsed.map((m) => (
                        <li key={m.id} className="rounded-lg border border-j-muted/15 p-2">
                          <p className="font-medium text-j-brand">{m.name}</p>
                          <p className="mt-1 text-xs text-j-muted">{m.snippet}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {tab === 'Inspector' && <p className="text-xs text-j-muted">选中 block 时展示属性与校验。</p>}
                {tab === 'Comments' && <p className="text-xs text-j-muted">评论线程占位。</p>}
                {tab === 'Versions' && <p className="text-xs text-j-muted">版本时间线占位。</p>}
                {tab === 'Actions' && (
                  <div className="space-y-3">
                    <p className="text-xs text-j-muted">External Projection 入口（05 §4.2）</p>
                    <button
                      type="button"
                      onClick={onOpenActionPanel}
                      className="w-full rounded-lg bg-j-brand py-2 text-sm font-semibold text-j-cream"
                    >
                      投影到飞书文档…
                    </button>
                  </div>
                )}
                {tab === 'Audit' && <p className="text-xs text-j-muted">制品级审计占位。</p>}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
