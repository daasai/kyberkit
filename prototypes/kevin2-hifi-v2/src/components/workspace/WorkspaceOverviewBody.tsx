import { useState, type ReactNode } from 'react'
import {
  mockArtifacts,
  mockConnectors,
  mockMaterials,
  mockPendingActions,
  mockSuggestedStep,
} from '../../mock/static'
import type { FlowScreen } from '../../flow/FlowContext'

type HomeDashTab = 'overview' | 'design'
type HomeFilter = 'recent' | 'all'

function DashTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
      }`}
    >
      {label}
      {active && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-j-brand" />}
    </button>
  )
}

function Pill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active ? 'bg-j-ink text-cd-surface' : 'border border-cd-border bg-cd-surface text-cd-muted hover:border-cd-muted/50 hover:text-j-ink'
      }`}
    >
      {children}
    </button>
  )
}

function ProjectCard({
  headerClass,
  title,
  subtitle,
  children,
  actions,
}: {
  headerClass: string
  title: string
  subtitle?: string
  children: ReactNode
  actions?: ReactNode
}) {
  return (
    <article className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-cd-border bg-cd-surface shadow-sm">
      <div className={`px-4 py-2.5 ${headerClass}`}>
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-j-ink/85">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[10px] text-j-ink/55">{subtitle}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">{children}</div>
      {actions && <div className="flex flex-wrap gap-2 border-t border-cd-border px-4 py-2.5">{actions}</div>}
    </article>
  )
}

/** 原 Workspace Home「概览」卡片区：无独立路由，嵌入工作区抽屉等 */
export function WorkspaceOverviewBody({ go }: { go: (s: FlowScreen) => void }) {
  const [empty, setEmpty] = useState(false)
  const [dashTab, setDashTab] = useState<HomeDashTab>('overview')
  const [filter, setFilter] = useState<HomeFilter>('recent')

  const mainGrid = empty ? (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-xl rounded-2xl border border-cd-border bg-cd-surface p-8 text-center shadow-sm">
        <p className="font-display text-xl text-j-ink">帮 Kevin 了解你的工作</p>
        <ol className="mt-6 space-y-3 text-left text-sm text-j-ink">
          {['给工作空间取个名字', '把最常用的几个文件拖进来（建立初始上下文）', '告诉 Kevin 你现在最需要完成什么'].map((text, i) => (
            <li key={text} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-j-brand text-[11px] font-bold text-j-brand">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => go('workspace')}
          className="mt-6 rounded-lg bg-j-brand px-4 py-2 text-xs font-semibold text-j-cream hover:bg-j-brand/90"
        >
          去添加材料
        </button>
      </div>
    </div>
  ) : (
    <div className="proto-scroll grid flex-1 gap-4 overflow-auto pb-2 sm:grid-cols-2 xl:grid-cols-3">
      <ProjectCard
        headerClass="bg-emerald-50/90"
        title="Recent Artifacts"
        subtitle="最近编辑与状态"
        actions={
          <button type="button" onClick={() => go('workspace')} className="text-[11px] font-semibold text-j-brand hover:underline">
            进入浏览 Tab →
          </button>
        }
      >
        <ul className="space-y-1">
          {mockArtifacts.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => go('artifact')}
                className="flex w-full items-start justify-between gap-2 rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-cd-border hover:bg-cd-page"
              >
                <div>
                  <p className="text-sm font-medium text-j-ink">{a.title}</p>
                  <p className="text-[11px] text-cd-muted">
                    {a.type} · <span className="font-medium text-j-brand">{a.state}</span>
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-cd-muted">{a.updatedAt}</span>
              </button>
            </li>
          ))}
        </ul>
      </ProjectCard>

      <ProjectCard
        headerClass="bg-amber-50/90"
        title="Pending Actions"
        subtitle="待签批与风险"
        actions={
          <button type="button" onClick={() => go('action')} className="text-[11px] font-semibold text-j-warn hover:underline">
            打开签批队列 →
          </button>
        }
      >
        <ul className="space-y-2">
          {mockPendingActions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => go('action')}
                className="w-full rounded-xl border border-j-warn/15 bg-j-warn-bg/20 p-3 text-left transition hover:border-j-warn/35"
              >
                <p className="text-sm font-medium text-j-ink">{p.title}</p>
                <p className="text-[11px] text-cd-muted">{p.artifact}</p>
                <p className="mt-1 text-[11px]">
                  risk: <span className="font-medium text-j-warn">{p.risk}</span>
                </p>
              </button>
            </li>
          ))}
        </ul>
      </ProjectCard>

      <ProjectCard
        headerClass="bg-slate-100/90"
        title="Materials"
        subtitle="挂载与新鲜度"
        actions={
          <button type="button" onClick={() => go('workspace')} className="text-[11px] font-semibold text-j-brand hover:underline">
            打开浏览 Tab →
          </button>
        }
      >
        <p className="font-display text-3xl text-j-ink">{mockMaterials.length}</p>
        <p className="mt-1 text-[11px] text-cd-muted">1 stale · 今天 08:02</p>
      </ProjectCard>

      <ProjectCard
        headerClass="bg-lime-50/80"
        title="Suggested Next Step"
        subtitle="规则 05 §4.1.1"
        actions={
          <button
            type="button"
            onClick={() => go('artifact')}
            className="rounded-full bg-j-brand px-3 py-1.5 text-xs font-semibold text-j-cream hover:bg-j-brand/90"
          >
            {mockSuggestedStep.cta}
          </button>
        }
      >
        <p className="text-sm font-medium text-j-ink">{mockSuggestedStep.title}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-cd-muted">{mockSuggestedStep.body}</p>
      </ProjectCard>

      <ProjectCard headerClass="bg-violet-50/85" title="Connectors" subtitle="外部系统集成">
        <ul className="space-y-2 text-sm">
          {mockConnectors.map((c) => (
            <li key={c.id} className="rounded-xl border border-cd-border/80 px-2.5 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.name}</span>
                <span
                  className={
                    c.status === 'connected' ? 'text-j-brand' : c.status === 'degraded' ? 'text-j-warn' : 'text-j-danger'
                  }
                >
                  {c.status}
                </span>
              </div>
              <p className="text-[11px] text-cd-muted">{c.detail}</p>
              {c.status === 'degraded' && (
                <button type="button" className="mt-1 text-[11px] font-medium text-j-brand hover:underline">
                  恢复路径
                </button>
              )}
            </li>
          ))}
        </ul>
      </ProjectCard>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mb-2 flex cursor-pointer items-center gap-2 text-[10px] text-cd-muted">
        <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} className="accent-j-brand" />
        演示空状态（原型）
      </label>
      <div className="flex shrink-0 flex-wrap items-end gap-2 border-b border-cd-border/80 pb-2">
        <div className="flex gap-0">
          <DashTab label="概览" active={dashTab === 'overview'} onClick={() => setDashTab('overview')} />
          <DashTab label="设计" active={dashTab === 'design'} onClick={() => setDashTab('design')} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            <Pill active={filter === 'recent'} onClick={() => setFilter('recent')}>
              Recent
            </Pill>
            <Pill active={filter === 'all'} onClick={() => setFilter('all')}>
              全部
            </Pill>
          </div>
          <div className="relative min-w-[10rem] max-w-[14rem] flex-1 sm:min-w-[12rem]">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-cd-muted" aria-hidden>
              ⌕
            </span>
            <input
              type="search"
              placeholder="搜索…"
              className="w-full rounded-full border border-cd-border bg-cd-surface py-1.5 pl-7 pr-3 text-xs text-j-ink outline-none placeholder:text-cd-muted focus:border-j-brand/35"
            />
          </div>
        </div>
      </div>

      {dashTab === 'design' ? (
        <div className="proto-scroll mt-3 flex-1 overflow-auto rounded-2xl border border-dashed border-cd-border bg-cd-surface/50 p-8 text-center text-sm text-cd-muted">
          「设计」占位 · 与 PRD 画布对齐的后续迭代
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">{mainGrid}</div>
      )}
    </div>
  )
}
