/**
 * 自动化中心 — 异步任务列表（PRD §7.1 / §11）。数据来源：GET /tasks
 */

import { useCallback, useEffect, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { useSession } from '../../contexts/SessionContext'

interface TaskRow {
  id: string
  space_id: string
  state: string
  skill_name: string | null
  progress: number
  message: string | null
  updated_at: string
}

export function AutomationCenter({
  onBack,
  spaceId,
}: {
  onBack: () => void
  spaceId: string
}) {
  const [tasks, setTasks] = useState<TaskRow[]>([])
  const [err, setErr] = useState<string | null>(null)
  const { activeSessionId } = useSession()

  const load = useCallback(() => {
    fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`)
      .then((r) => r.json())
      .then((d: TaskRow[]) => setTasks(Array.isArray(d) ? d : []))
      .catch(() => setErr('无法加载任务'))
  }, [spaceId])

  useEffect(() => {
    load()
    const id = window.setInterval(load, 3000)
    return () => window.clearInterval(id)
  }, [load])

  const postDemo = (kind?: 'signoff') => {
    const body =
      kind === 'signoff'
        ? JSON.stringify({
          kind: 'signoff',
          skill_name: 'artifact.feishu-doc.write',
          payload: activeSessionId ? { session_id: activeSessionId } : undefined,
        })
        : JSON.stringify({ skill_name: 'demo-task' })
    void fetch(`${SIDECAR_URL}/tasks${qsSpace(spaceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).then(() => load())
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-surface-container-lowest)',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-outline-variant)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <button type="button" onClick={onBack} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
          ← 返回
        </button>
        <span style={{ fontWeight: 700 }}>自动化</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => postDemo()}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-outline-variant)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            + 演示任务
          </button>
          <button
            type="button"
            onClick={() => postDemo('signoff')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid var(--color-error)',
              color: 'var(--color-error)',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            + 签批演示
          </button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {err && <p style={{ color: 'var(--color-error)' }}>{err}</p>}
        {!err && tasks.length === 0 && (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>暂无后台任务。</p>
        )}
        {tasks.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '12px',
              marginBottom: '8px',
              borderRadius: '10px',
              border: '1px solid var(--color-outline-variant)',
              fontSize: '13px',
            }}
          >
            <div style={{ fontWeight: 600 }}>{t.skill_name ?? 'task'}</div>
            <div style={{ color: 'var(--color-on-surface-variant)' }}>
              {t.state} · progress {(t.progress * 100).toFixed(0)}%
            </div>
            {t.message && <div>{t.message}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
