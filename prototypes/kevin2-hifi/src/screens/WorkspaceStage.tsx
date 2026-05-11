import { useState } from 'react'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { ResizeHandle } from './ResizeHandle'

const rail = ['Overview', 'Artifacts', 'Materials', 'Async Jobs', 'Audit', 'Sessions'] as const
const panelTabs = ['Dashboard', 'Artifacts', 'Materials', 'Audit'] as const

export function WorkspaceStage() {
  const [tab, setTab] = useState<(typeof panelTabs)[number]>('Materials')

  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="shrink-0 border-b border-j-muted/15 bg-j-bg px-6 py-3 text-j-cream">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-display text-lg tracking-tight">Kevin</span>
          <span className="text-j-cream/40">|</span>
          <span>Workspace: 增长与数据 · Q2</span>
          <span className="ml-auto rounded-full bg-j-accent/20 px-2 py-0.5 text-xs text-j-accent">Island</span>
          <button type="button" className="text-j-cream/80 hover:text-j-cream">
            Search
          </button>
          <button type="button" className="text-j-cream/80 hover:text-j-cream">
            Notifications
          </button>
          <button type="button" className="rounded-md bg-j-brand px-2 py-1 text-xs font-medium text-j-cream">
            Settings
          </button>
        </div>
        <p className="mt-1 text-xs text-j-cream/55">ia v2 §5.2 — Home Rail + Chat Stream + Workspace Panel（无 Action Panel）</p>
      </header>

      <div className="min-h-0 flex-1 p-2">
        <PanelGroup direction="horizontal" className="h-full rounded-xl border border-j-muted/15 bg-white shadow-sm">
          <Panel defaultSize={18} minSize={14} maxSize={28} className="min-w-0">
            <div className="flex h-full flex-col border-r border-j-muted/10 bg-j-cream/80">
              <p className="border-b border-j-muted/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-j-muted">
                Home Rail
              </p>
              <nav className="proto-scroll flex-1 space-y-0.5 overflow-auto p-2">
                {rail.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                      item === 'Overview' ? 'bg-j-brand text-j-cream' : 'text-j-ink hover:bg-white'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={46} minSize={32}>
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-j-muted/10 px-4 py-2 text-xs text-j-muted">Chat Stream · 当前 Session</div>
              <div className="proto-scroll flex-1 space-y-4 overflow-auto p-4">
                <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-j-brand px-4 py-2.5 text-sm text-j-cream">
                  基于本周数仓结果和飞书上的实验纪要，生成一份 Weekly Ops Review 草稿。
                </div>
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm border border-j-muted/15 bg-white px-4 py-3 text-sm text-j-ink shadow-sm">
                  <p className="text-j-muted">Kevin</p>
                  <p className="mt-2">
                    已读取 <span className="font-medium text-j-brand">Data Warehouse / Query Metrics</span> 与{' '}
                    <span className="font-medium text-j-brand">飞书 Read Docs</span>。正在生成制品…
                  </p>
                  <div className="mt-4 rounded-lg border border-j-accent/30 bg-j-cream p-3">
                    <p className="text-xs font-semibold uppercase text-j-muted">Artifact Card</p>
                    <p className="mt-1 font-medium">weekly-review-report</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" className="rounded-md bg-j-brand px-2 py-1 text-xs text-j-cream">
                        Open
                      </button>
                      <button type="button" className="rounded-md border border-j-muted/25 px-2 py-1 text-xs">
                        Preview
                      </button>
                      <button type="button" className="rounded-md border border-j-muted/25 px-2 py-1 text-xs">
                        Pin to Workspace
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="shrink-0 border-t border-j-muted/10 p-3">
                <div className="flex gap-2 rounded-xl border border-j-muted/20 bg-j-cream px-3 py-2 text-sm text-j-muted">
                  向 Kevin 发消息…（侧栏入口；Home 主区不以输入框为主 CTA）
                </div>
              </div>
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={36} minSize={24}>
            <div className="flex h-full min-h-0 flex-col border-l border-j-muted/10 bg-white">
              <p className="shrink-0 border-b border-j-muted/10 px-3 py-2 text-xs font-semibold text-j-muted">
                Workspace Panel
              </p>
              <div className="flex shrink-0 gap-1 border-b border-j-muted/10 px-2 pt-2">
                {panelTabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`rounded-t-md px-3 py-1.5 text-xs font-medium ${
                      tab === t ? 'bg-j-cream text-j-brand ring-1 ring-j-muted/15' : 'text-j-muted hover:text-j-ink'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div className="proto-scroll flex-1 overflow-auto p-4 text-sm">
                {tab === 'Materials' && (
                  <div>
                    <p className="text-xs text-j-muted">本地 · 外部文档 · Connector 数据</p>
                    <ul className="mt-3 space-y-2 font-mono text-xs">
                      <li className="rounded border border-j-muted/15 px-2 py-1.5">/materials/interviews_growth.md</li>
                      <li className="rounded border border-j-muted/15 px-2 py-1.5">/materials/dw_dau_weekly.json</li>
                      <li className="rounded border border-j-muted/15 px-2 py-1.5">飞书 · 实验纪要（外链）</li>
                    </ul>
                  </div>
                )}
                {tab === 'Dashboard' && <p className="text-j-muted">关键指标与告警占位。</p>}
                {tab === 'Artifacts' && <p className="text-j-muted">语义制品列表占位。</p>}
                {tab === 'Audit' && <p className="text-j-muted">动作 / 签批 / 投影事件占位。</p>}
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
