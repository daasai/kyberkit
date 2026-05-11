type Props = {
  mode: 'fullscreen' | 'overlay'
  onClose: () => void
}

/**
 * Action 阶段：Source / Target / Preview / Governance + risk + Sign-off
 * 写入成功后 Audit + external link（静态示意）
 */
export function ActionPanelOverlay({ mode, onClose }: Props) {
  const shell =
    mode === 'fullscreen'
      ? 'relative h-full w-full bg-j-cream'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-j-ink/40 p-4 backdrop-blur-[2px]'

  const card = mode === 'fullscreen' ? 'h-full overflow-auto' : 'max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl shadow-2xl'

  return (
    <div className={shell}>
      <div className={`${card} flex flex-col bg-white`}>
        <header className="shrink-0 border-b border-j-muted/15 bg-j-bg px-6 py-4 text-j-cream">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-xl text-j-accent">ActionRequest</p>
              <p className="mt-1 text-sm text-j-cream/70">飞书写入 · medium risk · 需签批</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-j-cream/80 hover:bg-white/10 hover:text-j-cream"
            >
              关闭
            </button>
          </div>
        </header>

        <div className="proto-scroll flex-1 space-y-5 overflow-auto p-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Source</h3>
            <p className="mt-1 text-sm">Artifact「Q2 增长 PRD」· state review</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Target</h3>
            <p className="mt-1 text-sm">Connector 飞书 · Capability Write Docs · 新建外部文档</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Preview</h3>
            <div className="mt-2 rounded-lg border border-j-muted/15 bg-j-cream p-3 text-sm">
              <p className="font-medium">标题：Q2 增长 PRD</p>
              <p className="mt-2 text-xs text-j-muted">大纲：Problem / Users / Goals / Risks…</p>
              <p className="mt-2 text-xs text-j-warn">格式降级提示：表格将转为飞书兼容块</p>
            </div>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-j-muted">Governance</h3>
            <p className="mt-1 text-sm text-j-muted">签批策略：单次写入 · 审计必填 · 无自动重试</p>
            <p className="mt-2 inline-flex rounded-md bg-j-warn-bg px-2 py-1 text-xs font-medium text-j-warn">risk_level = medium</p>
          </section>

          <div className="rounded-lg border border-j-danger/25 bg-j-danger-bg/50 p-3 text-xs text-j-danger">
            非 Junior 品牌色：高风险二次确认区占位（若未来扩展 high risk）。
          </div>

          <div className="flex flex-wrap gap-3 border-t border-j-muted/10 pt-4">
            <button
              type="button"
              className="rounded-lg bg-j-brand px-5 py-2.5 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
            >
              批准并执行投影
            </button>
            <button type="button" className="rounded-lg border border-j-muted/25 px-5 py-2.5 text-sm text-j-muted">
              拒绝
            </button>
          </div>

          <section className="rounded-lg border border-j-accent/30 bg-j-cream/80 p-4 text-sm">
            <h3 className="text-xs font-semibold uppercase text-j-brand">执行结果（示意）</h3>
            <p className="mt-2 text-j-muted">Audit 事件：<span className="font-mono text-xs">action_approved</span> ·{' '}
              <span className="font-mono text-xs">projection_created</span>
            </p>
            <p className="mt-2">
              external link:{' '}
              <a href="#" className="break-all text-j-brand underline">
                https://feishu.cn/docx/xxxxxxxx
              </a>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
