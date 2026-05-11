import { useState } from 'react'

const steps = [
  { n: '01', title: 'Basic', subtitle: '名称、工种、本地目录' },
  { n: '02', title: 'Connectors', subtitle: '接入系统与凭证' },
  { n: '03', title: 'Capabilities', subtitle: '读取 / 监听 / 写入 / 执行' },
] as const

export function SetupWorkspace() {
  const [step, setStep] = useState(0)

  return (
    <div className="flex h-full min-h-0 flex-col bg-j-cream">
      <header className="shrink-0 border-b border-j-muted/15 bg-j-bg px-8 py-5 text-j-cream">
        <p className="font-display text-2xl tracking-tight">Create Workspace</p>
        <p className="mt-1 text-sm text-j-cream/70">
          Setup 阶段：建立 Workspace Contract — <span className="text-j-accent">无对话流</span>
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_minmax(280px,360px)]">
        <div className="proto-scroll flex min-h-0 flex-col gap-8 overflow-auto p-8 lg:p-10">
          <nav className="flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <button
                key={s.n}
                type="button"
                onClick={() => setStep(i)}
                className={`flex items-baseline gap-2 rounded-lg border px-4 py-2 text-left transition-colors ${
                  i === step
                    ? 'border-j-brand bg-j-brand text-j-cream'
                    : 'border-j-muted/20 bg-white text-j-ink hover:border-j-accent/40'
                }`}
              >
                <span className="font-display text-lg">{s.n}</span>
                <span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="block text-xs text-j-muted">{s.subtitle}</span>
                </span>
              </button>
            ))}
          </nav>

          {step === 0 && (
            <section className="space-y-5 rounded-xl border border-j-muted/15 bg-white p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-brand">Workspace 名称与绑定</h2>
              <label className="block text-sm font-medium text-j-muted">Workspace name</label>
              <input
                className="w-full max-w-md rounded-lg border border-j-muted/25 bg-j-cream px-3 py-2 text-sm outline-none ring-j-accent focus:ring-2"
                defaultValue="增长与数据 · Q2"
              />
              <label className="block text-sm font-medium text-j-muted">Work type</label>
              <select className="w-full max-w-md rounded-lg border border-j-muted/25 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-j-accent">
                <option>product_design</option>
                <option>data_analysis</option>
                <option>general</option>
              </select>
              <label className="block text-sm font-medium text-j-muted">本地目录（Library mount）</label>
              <div className="flex max-w-md gap-2">
                <input
                  readOnly
                  className="min-w-0 flex-1 rounded-lg border border-j-muted/25 bg-j-cream px-3 py-2 font-mono text-xs text-j-muted"
                  defaultValue="~/Library/KevinWorkspaces/growth-q2"
                />
                <button
                  type="button"
                  className="shrink-0 rounded-lg bg-j-brand px-3 py-2 text-xs font-semibold text-j-cream"
                >
                  选择…
                </button>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4 rounded-xl border border-j-muted/15 bg-white p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-brand">Connectors</h2>
              <p className="text-sm text-j-muted">用户可见接入对象；每行展示健康状态（对齐 PRD）。</p>
              <ul className="divide-y divide-j-muted/10 rounded-lg border border-j-muted/15">
                {[
                  { name: '飞书', caps: 'Read Docs · Write Docs · Send Message' },
                  { name: 'Data Warehouse', caps: 'Query Metrics · Watch Thresholds' },
                  { name: 'Local Files', caps: 'Sense workspace mount' },
                ].map((row) => (
                  <li key={row.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-j-muted">{row.caps}</p>
                    </div>
                    <span className="rounded-full bg-j-accent/15 px-2.5 py-0.5 text-xs font-medium text-j-brand">
                      Connected
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4 rounded-xl border border-j-muted/15 bg-white p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-brand">Capabilities & Policy</h2>
              <p className="text-sm text-j-muted">为每个能力标注 risk 与是否需签批（静态示意）。</p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-j-muted/15 text-xs uppercase tracking-wide text-j-muted">
                    <th className="pb-2 pr-4">Capability</th>
                    <th className="pb-2 pr-4">Kind</th>
                    <th className="pb-2 pr-4">Risk</th>
                    <th className="pb-2">Sign-off</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-j-muted/10">
                  <tr>
                    <td className="py-2 font-medium">Write Docs（飞书）</td>
                    <td className="py-2 text-j-muted">write</td>
                    <td className="py-2">
                      <span className="rounded bg-j-warn-bg px-1.5 py-0.5 text-xs text-j-warn">medium</span>
                    </td>
                    <td className="py-2 text-j-brand">必填</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-medium">Query Metrics</td>
                    <td className="py-2 text-j-muted">read</td>
                    <td className="py-2">
                      <span className="rounded bg-j-cream px-1.5 py-0.5 text-xs text-j-muted">low</span>
                    </td>
                    <td className="py-2 text-j-muted">—</td>
                  </tr>
                </tbody>
              </table>
              <button
                type="button"
                className="rounded-lg bg-j-brand px-5 py-2.5 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
              >
                Create Workspace
              </button>
            </section>
          )}
        </div>

        <aside className="border-t border-j-muted/15 bg-j-bg p-6 text-j-cream lg:border-l lg:border-t-0">
          <p className="font-display text-lg text-j-accent">Preview / Summary</p>
          <dl className="mt-6 space-y-4 text-sm">
            <div>
              <dt className="text-j-cream/50">Space id</dt>
              <dd className="mt-0.5 font-mono text-xs">8f2c…e41a</dd>
            </div>
            <div>
              <dt className="text-j-cream/50">Library path</dt>
              <dd className="mt-0.5 break-all text-j-cream/90">~/Library/KevinWorkspaces/growth-q2</dd>
            </div>
            <div>
              <dt className="text-j-cream/50">Enabled connectors</dt>
              <dd className="mt-0.5">飞书、Data Warehouse、Local Files</dd>
            </div>
            <div>
              <dt className="text-j-cream/50">Write capabilities</dt>
              <dd className="mt-0.5 text-j-warn">飞书写入 · medium · 签批</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
