import { useFlow } from '../flow/FlowContext'
import { CdMicroTabRow } from '../components/cd/CdMicroTabRow'

type Props = {
  mode: 'fullscreen' | 'overlay'
  onClose: () => void
  /** 与 Flow 联动时在底部展示返回链接 */
  variant?: 'flow'
}

/**
 * Action 阶段：Source / Target / Preview / Governance（05 §4.2）
 */
export function ActionPanelOverlay({ mode, onClose, variant }: Props) {
  const { go } = useFlow()

  const shell =
    mode === 'fullscreen'
      ? 'relative h-full w-full bg-cd-page'
      : 'fixed inset-0 z-50 flex items-center justify-center bg-j-ink/35 p-4 backdrop-blur-[2px]'

  const card =
    mode === 'fullscreen'
      ? 'flex h-full w-full flex-col overflow-hidden bg-cd-surface'
      : 'flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-cd-border bg-cd-surface shadow-2xl'

  return (
    <div className={shell}>
      <div className={card}>
        <CdMicroTabRow
          left={<span className="px-1 font-medium text-j-ink">ActionRequest</span>}
          center={<span className="truncate text-[11px] text-cd-muted">飞书 · Write Docs · medium · 签批</span>}
          right={
            <button
              type="button"
              onClick={onClose}
              className="rounded px-2 py-0.5 text-[11px] text-cd-muted hover:text-j-ink"
            >
              关闭
            </button>
          }
        />

        <div className="proto-scroll flex-1 space-y-5 overflow-auto p-6">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-cd-muted">Source</h3>
            <p className="mt-1 text-sm text-j-ink">Artifact「Q2 增长 PRD」· state review</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-cd-muted">Target</h3>
            <p className="mt-1 text-sm text-j-ink">Connector 飞书 · Capability Write Docs · 新建外部文档</p>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-cd-muted">Preview</h3>
            <div className="mt-2 rounded-lg border border-cd-border bg-cd-page p-3 text-sm">
              <p className="font-medium">标题：Q2 增长 PRD</p>
              <p className="mt-2 text-xs text-cd-muted">大纲：Problem / Users / Goals / Risks…</p>
              <p className="mt-2 text-xs text-j-warn">格式降级：表格 → 飞书兼容块</p>
            </div>
          </section>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-cd-muted">Governance</h3>
            <p className="mt-1 text-sm text-cd-muted">单次写入 · 审计必填 · Connector/Capability 展示（08）</p>
            <p className="mt-2 inline-flex rounded-md bg-j-warn-bg px-2 py-1 text-xs font-medium text-j-warn">risk_level = medium</p>
          </section>

          <div className="rounded-lg border border-j-danger/25 bg-j-danger-bg/50 p-3 text-xs text-j-danger">
            high risk 二次确认区占位（非品牌色，仅语义）。
          </div>

          <div className="flex flex-wrap gap-3 border-t border-cd-border pt-4">
            <button
              type="button"
              className="rounded-lg bg-j-brand px-5 py-2.5 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
            >
              批准并执行投影
            </button>
            <button type="button" className="rounded-lg border border-cd-border px-5 py-2.5 text-sm text-cd-muted hover:bg-cd-page">
              拒绝
            </button>
          </div>

          <section className="rounded-lg border border-cd-border bg-cd-page p-4 text-sm">
            <h3 className="text-xs font-semibold uppercase text-cd-muted">执行结果（示意）</h3>
            <p className="mt-2 text-cd-muted">
              Audit: <span className="font-mono text-xs text-j-ink">action_approved</span> ·{' '}
              <span className="font-mono text-xs text-j-ink">projection_created</span>
            </p>
            <p className="mt-2 text-j-ink">
              external link:{' '}
              <a href="#" className="break-all text-j-brand underline">
                https://feishu.cn/docx/xxxxxxxx
              </a>
            </p>
          </section>

          {variant === 'flow' && (
            <div className="flex flex-wrap gap-3 border-t border-cd-border pt-4 text-xs">
              <button type="button" onClick={() => go('artifact')} className="font-medium text-j-brand hover:underline">
                返回制品
              </button>
              <button type="button" onClick={() => go('workspace')} className="font-medium text-cd-muted hover:text-j-brand hover:underline">
                Workspace
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
