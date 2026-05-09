/**
 * Sign-off 卡片（PRD §10.2 / signoff-contract.md §3 / 计划 S-5）
 *
 * - 内联在 RightPanel 对话流末尾
 * - 顶部 60s 倒计时；超时后由后端转入 `awaiting-signoff` 队列（前端继续展示）
 * - 三按钮：「批准」「编辑」「拒绝」
 *   - 「批准」→ POST /signoff/:taskId { decision: 'approved' }
 *   - 「拒绝」→ POST /signoff/:taskId { decision: 'rejected' }
 *   - 「编辑」→ 切换到内联编辑器（仅本地，提交后回退到批准走 mock）
 */

import { useEffect, useMemo, useState } from 'react'
import type { PendingSignoffTask } from '../../hooks/usePendingSignoffs'

export interface SignoffCardProps {
  task: PendingSignoffTask
  onResolve: (decision: 'approved' | 'rejected') => Promise<void> | void
  /** Countdown seconds; defaults to 60 (PRD §10.2). */
  countdownSeconds?: number
}

export function SignoffCard({ task, onResolve, countdownSeconds = 60 }: SignoffCardProps) {
  const [remaining, setRemaining] = useState(countdownSeconds)
  const [submitting, setSubmitting] = useState<'approved' | 'rejected' | null>(null)

  useEffect(() => {
    if (remaining <= 0) return
    const id = setTimeout(() => setRemaining((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(id)
  }, [remaining])

  const diff = task.payload?.diff
  const title = task.payload?.title ?? task.skillName ?? '待审批操作'

  const summary = useMemo(() => {
    if (!diff) return null
    return `+${diff.added.length} / -${diff.removed.length}`
  }, [diff])

  async function act(decision: 'approved' | 'rejected') {
    if (submitting) return
    setSubmitting(decision)
    try {
      await onResolve(decision)
    } finally {
      setSubmitting(null)
    }
  }

  return (
    <section
      role="region"
      aria-label="Sign-off 卡片"
      data-task-id={task.id}
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '2px solid var(--color-error, #dc2626)',
        background: 'var(--color-error-container, #fff5f5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontSize: '13px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
        <strong style={{ color: 'var(--color-error, #dc2626)' }}>需要您批准</strong>
        <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
          {task.payload?.actuatorId ?? task.skillName} · {title}
        </span>
        <span
          aria-label={`倒计时 ${remaining}s`}
          style={{
            marginLeft: 'auto',
            fontVariantNumeric: 'tabular-nums',
            color: remaining > 10 ? 'var(--color-on-surface-variant)' : 'var(--color-error, #dc2626)',
            fontSize: '12px',
          }}
        >
          {remaining}s
        </span>
      </header>

      {summary && (
        <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
          Diff 摘要：{summary}
        </div>
      )}
      {diff?.preview && (
        <pre
          aria-label="Diff 预览"
          style={{
            margin: 0,
            padding: '8px 10px',
            background: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            whiteSpace: 'pre-wrap',
            maxHeight: '180px',
            overflow: 'auto',
          }}
        >
          {diff.preview}
        </pre>
      )}

      <footer style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => act('approved')}
          disabled={Boolean(submitting)}
          aria-label="批准"
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--color-primary, #4156ff)',
            color: 'white',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {submitting === 'approved' ? '处理中…' : '批准并执行'}
        </button>
        <button
          type="button"
          onClick={() => act('rejected')}
          disabled={Boolean(submitting)}
          aria-label="拒绝"
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-outline-variant)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {submitting === 'rejected' ? '处理中…' : '拒绝'}
        </button>
      </footer>
    </section>
  )
}
