/**
 * 通知中心 — 待签批 + 完成卡片聚合（PRD §11.4 / Sprint D · S-9）
 *
 *  - 待签批 (awaiting-signoff) 始终置顶，逐条展示。
 *  - 同一 Skill 在 1 小时滚动窗内 ≥3 次完成 → 折叠为聚合卡。
 *  - 失败 / 取消单独展示。
 *  - 通过 `/events/space` SSE 实时刷新；SSE 成功时停止轮询，断线时降级轮询。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { useSession } from '../../contexts/SessionContext'
import {
  aggregateNotifications,
  type NotificationGroup,
  type RawTaskRow,
} from '../../lib/notificationAggregation'

interface TaskRow extends RawTaskRow {
  trigger_kind?: string | null
  payload?: string | null
}

function upsertTask(prev: TaskRow[], task: TaskRow): TaskRow[] {
  const idx = prev.findIndex((t) => t.id === task.id)
  if (idx >= 0) {
    const next = [...prev]
    next[idx] = { ...next[idx], ...task }
    return next
  }
  return [...prev, task]
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaceId } = useSession()
  const [tasks, setTasks] = useState<TaskRow[]>([])

  const load = useCallback(() => {
    if (!spaceId) return
    fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
      .then((r) => r.json())
      .then((rows: TaskRow[]) => setTasks(Array.isArray(rows) ? rows : []))
      .catch(() => setTasks([]))
  }, [spaceId])

  useEffect(() => {
    if (!open || !spaceId) return

    void load()

    let pollId: ReturnType<typeof setInterval> | null = null
    const startPoll = () => {
      if (pollId != null) return
      pollId = window.setInterval(() => {
        void load()
      }, 5000)
    }
    const stopPoll = () => {
      if (pollId != null) {
        window.clearInterval(pollId)
        pollId = null
      }
    }

    /** Until first SSE `open`, keep polling as fallback (then stop). */
    const fallbackTimer = window.setTimeout(() => {
      startPoll()
    }, 2000)

    let es: EventSource | null = null
    try {
      es = new EventSource(`${SIDECAR_URL}/events/space${qsSpace(spaceId)}`)
      es.onopen = () => {
        window.clearTimeout(fallbackTimer)
        stopPoll()
      }
      es.addEventListener('message', (ev) => {
        try {
          const data = JSON.parse((ev as MessageEvent).data) as {
            type?: string
            task?: TaskRow
            task_id?: string
          }
          if (data?.task && typeof data.task === 'object' && typeof data.task.id === 'string') {
            setTasks((prev) => upsertTask(prev, data.task as TaskRow))
            return
          }
          if (data?.type === 'task_cancelled' && typeof data.task_id === 'string') {
            const id = data.task_id
            setTasks((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      state: 'cancelled',
                      updated_at: new Date().toISOString(),
                    }
                  : t,
              ),
            )
            return
          }
          if (data?.type === 'signoff_required' && typeof data.task_id === 'string') {
            void load()
          }
        } catch {
          /* ignore non-JSON ping frames */
        }
      })
      es.onerror = () => {
        startPoll()
      }
    } catch {
      es = null
      startPoll()
    }

    return () => {
      window.clearTimeout(fallbackTimer)
      stopPoll()
      try {
        es?.close()
      } catch {
        /* ignore */
      }
    }
  }, [open, spaceId, load])

  const groups: NotificationGroup[] = useMemo(
    () => aggregateNotifications(tasks),
    [tasks],
  )

  const resolve = (taskId: string, decision: 'approved' | 'rejected') => {
    void fetch(`${SIDECAR_URL}/signoff/${taskId}${qsSpace(spaceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }).then(() => load())
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="通知中心"
      style={{
        position: 'fixed',
        top: '56px',
        right: '24px',
        width: 'min(380px, 92vw)',
        maxHeight: '70vh',
        overflow: 'auto',
        zIndex: 850,
        background: 'var(--color-surface-container-lowest)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.15)',
        padding: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <span style={{ fontWeight: 700 }}>通知</span>
        <button type="button" onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
          ×
        </button>
      </div>
      {groups.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', margin: 0 }}>暂无通知。</p>
      )}
      {groups.map((g) => (
        <NotificationCard key={g.key} group={g} onResolve={resolve} />
      ))}
      <p style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '12px', marginBottom: 0 }}>
        聚合规则：同一 Skill 1 小时内 ≥3 次完成会折叠（PRD §11.4）。
      </p>
    </div>
  )
}

function NotificationCard({
  group,
  onResolve,
}: {
  group: NotificationGroup
  onResolve: (taskId: string, decision: 'approved' | 'rejected') => void
}) {
  const isSignoff = group.kind === 'signoff'
  const tone =
    group.kind === 'signoff'
      ? 'var(--color-error)'
      : group.kind === 'failed'
        ? 'var(--color-error)'
        : group.kind === 'aggregate'
          ? 'var(--color-primary)'
          : 'var(--color-outline-variant)'
  return (
    <div
      data-kind={group.kind}
      style={{
        padding: '12px',
        marginBottom: '8px',
        borderRadius: '10px',
        border: `1px solid ${tone}`,
        fontSize: '13px',
      }}
    >
      <div style={{ fontWeight: 600 }}>{group.title}</div>
      {group.detail && (
        <div style={{ marginTop: '4px', color: 'var(--color-on-surface-variant)' }}>{group.detail}</div>
      )}
      {group.kind === 'aggregate' && (
        <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
          共 {group.count} 条 · 最近一次 {formatRel(group.latestUpdatedAt)}
        </div>
      )}
      {isSignoff && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button
            type="button"
            onClick={() => onResolve(group.taskIds[0], 'approved')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            批准
          </button>
          <button
            type="button"
            onClick={() => onResolve(group.taskIds[0], 'rejected')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid var(--color-outline-variant)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            拒绝
          </button>
        </div>
      )}
    </div>
  )
}

function formatRel(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return iso
  const diff = Date.now() - t
  const min = Math.round(diff / 60_000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.round(min / 60)
  return `${hr} 小时前`
}
