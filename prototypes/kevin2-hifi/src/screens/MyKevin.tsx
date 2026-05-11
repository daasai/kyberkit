import type { ReactNode } from 'react'

/** 05 §4.5 — My Kevin 最小视图（记忆治理入口，非主导航中心） */

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
      title: 'C3 · 接受更短的 Acceptance Criteria 句式',
      meta: '来源：连续 3 次同类 diff · 作用域：本 Workspace · 最近使用：昨天',
      actions: ['本次不用', '禁用', '删除'],
    },
  ],
  skills: [
    {
      title: 'C4 · Skill 草案「PRD 风险段检查」',
      meta: '来源：Skill Forge · 作用域：全局 · 最近使用：3 天前',
      actions: ['预览', '编辑', '删除'],
    },
  ],
  pointers: [
    {
      title: 'C6 · 飞书 PRD 外链',
      meta: '来源：External Projection · 作用域：Artifact a1 · 最近使用：今天',
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
    <section className="rounded-xl border border-j-muted/15 bg-white p-5 shadow-sm">
      <h2 className="font-display text-lg text-j-brand">{title}</h2>
      <p className="mt-1 text-xs text-j-muted">{subtitle}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  )
}

export function MyKevin() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="shrink-0 border-b border-j-muted/15 bg-white px-8 py-5">
        <p className="font-display text-2xl text-j-brand">My Kevin</p>
        <p className="mt-1 text-sm text-j-muted">查看与管理 Kevin 记住的内容；每条应可解释影响。</p>
      </header>
      <div className="proto-scroll mx-auto max-w-3xl flex-1 space-y-6 overflow-auto p-8">
        <Block title="项目情境" subtitle="C2 类 · directory_cognition">
          {rows.context.map((r) => (
            <div key={r.title} className="rounded-lg border border-j-muted/10 p-4">
              <p className="font-medium">{r.title}</p>
              <p className="mt-1 text-xs text-j-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-j-muted/20 px-2 py-1 text-xs text-j-brand hover:bg-j-cream"
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
            <div key={r.title} className="rounded-lg border border-j-muted/10 p-4">
              <p className="font-medium">{r.title}</p>
              <p className="mt-1 text-xs text-j-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-j-muted/20 px-2 py-1 text-xs hover:bg-j-cream"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <Block title="判断框架" subtitle="C4 Skill 与草案">
          {rows.skills.map((r) => (
            <div key={r.title} className="rounded-lg border border-j-muted/10 p-4">
              <p className="font-medium">{r.title}</p>
              <p className="mt-1 text-xs text-j-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-j-muted/20 px-2 py-1 text-xs hover:bg-j-cream"
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
            <div key={r.title} className="rounded-lg border border-j-muted/10 p-4">
              <p className="font-medium">{r.title}</p>
              <p className="mt-1 text-xs text-j-muted">{r.meta}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className="rounded-md border border-j-muted/20 px-2 py-1 text-xs hover:bg-j-cream"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Block>

        <p className="text-center text-xs text-j-muted">
          决策日志（C5）可后置；本原型仅保留区块标题占位意识。
        </p>
      </div>
    </div>
  )
}
