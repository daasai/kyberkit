/**
 * 通知中心 — 待签批队列首位（PRD §11.4）
 */

import { useEffect, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { useSession } from '../../contexts/SessionContext'

interface TaskRow {
  id: string
  state: string
  skill_name: string | null
  message: string | null
}

export function NotificationCenter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { spaceId } = useSession()
  const [pending, setPending] = useState<TaskRow[]>([])

  const load = () => {
    fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
      .then((r) => r.json())
      .then((rows: TaskRow[]) =>
        setPending(Array.isArray(rows) ? rows.filter((x) => x.state === 'awaiting-signoff') : []),
      )
      .catch(() => setPending([]))
  }

  useEffect(() => {
    if (!open) return
    load()
    const id = window.setInterval(load, 3000)
    return () => window.clearInterval(id)
  }, [open, spaceId])

  const resolve = (taskId: string, approved: boolean) => {
    void fetch(`${SIDECAR_URL}/tasks/${taskId}/signoff${qsSpace(spaceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved }),
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
        width: 'min(360px, 92vw)',
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
      {pending.length === 0 && (
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', margin: 0 }}>暂无待签批。</p>
      )}
      {pending.map((t) => (
        <div
          key={t.id}
          style={{
            padding: '12px',
            marginBottom: '8px',
            borderRadius: '10px',
            border: '1px solid var(--color-error)',
            fontSize: '13px',
          }}
        >
          <div style={{ fontWeight: 600 }}>待签批 · {t.skill_name ?? 'task'}</div>
          {t.message && <div style={{ marginTop: '4px', color: 'var(--color-on-surface-variant)' }}>{t.message}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={() => resolve(t.id, true)}
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
              onClick={() => resolve(t.id, false)}
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
        </div>
      ))}
      <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '12px', marginBottom: 0 }}>
        Sensor / 任务完成折叠规则将在后续迭代增强。
      </p>
    </div>
  )
}
