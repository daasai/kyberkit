import { useState } from 'react'
import { mockArtifacts, mockConnectors, mockMaterials, mockPendingActions, mockSuggestedStep } from '../mock/static'

export function WorkspaceHome() {
  const [empty, setEmpty] = useState(false)

  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-j-muted/15 bg-white px-8 py-5">
        <div>
          <p className="font-display text-2xl text-j-brand">Workspace Home</p>
          <p className="mt-1 text-sm text-j-muted">05 §4.1 — 工作状态优先，非空聊天框</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-j-muted">
          <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} className="accent-j-brand" />
          演示「全新 Workspace」空状态
        </label>
      </header>

      <div className="proto-scroll flex-1 overflow-auto p-8">
        {empty ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-j-muted/15 bg-white p-10 text-center shadow-sm">
            <p className="font-display text-2xl text-j-brand">帮 Kevin 了解你的工作</p>
            <ol className="mt-8 space-y-4 text-left text-sm text-j-ink">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-j-brand text-xs font-bold text-j-cream">
                  1
                </span>
                <span>给工作空间取个名字</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-j-brand text-xs font-bold text-j-cream">
                  2
                </span>
                <span>把最常用的几个文件拖进来（建立初始上下文）</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-j-brand text-xs font-bold text-j-cream">
                  3
                </span>
                <span>告诉 Kevin 你现在最需要完成什么</span>
              </li>
            </ol>
            <p className="mt-8 text-xs text-j-muted">框架是「帮 Kevin 了解你的工作」，不是「配置 Workspace」。</p>
          </div>
        ) : (
          <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-xl border border-j-muted/15 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Recent Artifacts</h2>
              <ul className="mt-4 space-y-3">
                {mockArtifacts.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-2 border-b border-j-muted/10 pb-3 last:border-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-j-muted">
                        {a.type} · <span className="text-j-brand">{a.state}</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-j-muted">{a.updatedAt}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-j-warn/30 bg-j-warn-bg/40 p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-j-warn">Pending Actions</h2>
              <ul className="mt-4 space-y-3">
                {mockPendingActions.map((p) => (
                  <li key={p.id}>
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-j-muted">{p.artifact}</p>
                    <p className="mt-1 text-xs">
                      risk: <span className="font-medium text-j-warn">{p.risk}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-j-muted/15 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Materials</h2>
              <p className="mt-2 font-display text-3xl text-j-brand">{mockMaterials.length}</p>
              <p className="text-sm text-j-muted">1 项材料可能过期（stale）</p>
              <p className="mt-3 text-xs text-j-muted">上次添加：今天 08:02</p>
            </section>

            <section className="rounded-xl border border-j-accent/40 bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-j-brand">Suggested Next Step</h2>
              <p className="mt-3 font-medium">{mockSuggestedStep.title}</p>
              <p className="mt-2 text-sm text-j-muted">{mockSuggestedStep.body}</p>
              <button
                type="button"
                className="mt-4 rounded-lg bg-j-brand px-4 py-2 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
              >
                {mockSuggestedStep.cta}
              </button>
            </section>

            <section className="rounded-xl border border-j-muted/15 bg-white p-5 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Connectors Status</h2>
              <ul className="mt-4 space-y-2">
                {mockConnectors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between text-sm">
                    <span>{c.name}</span>
                    <span
                      className={
                        c.status === 'connected'
                          ? 'text-j-accent'
                          : c.status === 'degraded'
                            ? 'text-j-warn'
                            : 'text-j-danger'
                      }
                    >
                      {c.status === 'connected' ? '● connected' : c.status === 'degraded' ? '◐ degraded' : '○ off'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
