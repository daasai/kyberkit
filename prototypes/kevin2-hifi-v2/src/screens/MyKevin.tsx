import type { ReactNode } from 'react'
import { useFlow } from '../flow/FlowContext'
import { CdMicroTabRow } from '../components/cd/CdMicroTabRow'

const rows = {
  context: [
    {
      title: 'directory_cognition 摘要',
      meta: '来源：首次扫描 · 作用域：本 Workspace · 最近使用：今天',
      actions: ['打开 .kevin/cognition.md', '重新认识项目'],
    },
  ],
  prefs: [
    {
      title: 'C3 · 更短的 Acceptance Criteria 句式',
      meta: '来源：连续 3 次同类 diff · 作用域：本 Workspace',
      actions: ['本次不用', '禁用', '删除'],
    },
  ],
  skills: [
    {
      title: 'C4 · Skill 草案「PRD 风险段检查」',
      meta: '来源：Skill Forge · 作用域：全局',
      actions: ['预览', '编辑', '删除'],
    },
  ],
  pointers: [
    {
      title: 'C6 · 飞书 PRD 外链',
      meta: '来源：External Projection · Artifact a1',
      actions: ['查看', '删除'],
    },
  ],
} as const

function Block({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="rounded-xl border border-cd-border bg-cd-surface p-5 shadow-sm">
      <h2 className="font-display text-lg text-j-ink">{title}</h2>
      <p className="mt-1 text-xs text-cd-muted">{subtitle}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

export function MyKevin() {
  const { go } = useFlow()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CdMicroTabRow
        left={<span className="px-1 font-display text-sm font-medium text-j-ink">My Kevin</span>}
        center={<span className="text-[11px] text-cd-muted">05 §4.5 · 记忆治理</span>}
        right={
          <button type="button" onClick={() => go('workspace')} className="text-[11px] text-j-brand hover:underline">
            ← Workspace
          </button>
        }
      />
      <div className="proto-scroll mx-auto max-w-3xl flex-1 space-y-6 overflow-auto p-8">
        <Block title="项目情境" subtitle="C2 · directory_cognition">
          {rows.context.map((r) => (
            <div key={r.title} className="rounded-lg border border-cd-border p-4">
              <p className="font-medium text-j-ink">{r.title}</p>
              <p className="mt-1 text-xs text-cd-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-cd-border px-2 py-1 text-xs text-j-brand hover:bg-cd-page"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block title="行为偏好" subtitle="C3">
          {rows.prefs.map((r) => (
            <div key={r.title} className="rounded-lg border border-cd-border p-4">
              <p className="font-medium text-j-ink">{r.title}</p>
              <p className="mt-1 text-xs text-cd-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-cd-border px-2 py-1 text-xs hover:bg-cd-page"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block title="判断框架" subtitle="C4">
          {rows.skills.map((r) => (
            <div key={r.title} className="rounded-lg border border-cd-border p-4">
              <p className="font-medium text-j-ink">{r.title}</p>
              <p className="mt-1 text-xs text-cd-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-cd-border px-2 py-1 text-xs hover:bg-cd-page"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block title="外部指针" subtitle="C6">
          {rows.pointers.map((r) => (
            <div key={r.title} className="rounded-lg border border-cd-border p-4">
              <p className="font-medium text-j-ink">{r.title}</p>
              <p className="mt-1 text-xs text-cd-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-cd-border px-2 py-1 text-xs hover:bg-cd-page"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <p className="text-center text-xs text-cd-muted">C5 决策日志可搜索 — MVP 可后置（06）。</p>
      </div>
    </div>
  )
}
