/**
 * Forge 建议卡片（PRD §12.3.3 / 计划 S-3）
 *
 * 调用方负责传入 draft（来自 POST /skills/forge/suggest 或 SSE skill.suggested）。
 * 三按钮：「留下这个」「查看完整 SKILL.md」「稍后再说」。
 * 「留下这个」→ POST /skills/forge/accept；成功后调用 onAccepted(name)。
 */

import { useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'

export interface ForgeDraft {
  trigger: 'slash' | 'explicit'
  suggestedName: string
  suggestedDescription: string
  bodySeed: string
}

export interface ForgeSuggestionCardProps {
  draft: ForgeDraft
  spaceId: string
  onAccepted: (name: string) => void
  onDismissed: () => void
}

export function ForgeSuggestionCard({
  draft,
  spaceId,
  onAccepted,
  onDismissed,
}: ForgeSuggestionCardProps) {
  const [name, setName] = useState(draft.suggestedName)
  const [description, setDescription] = useState(draft.suggestedDescription)
  const [body, setBody] = useState(draft.bodySeed)
  const [showBody, setShowBody] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`${SIDECAR_URL}/skills/forge/accept${qsSpace(spaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, body }),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || `Save failed: ${res.status}`)
      }
      onAccepted(name)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section
      role="region"
      aria-label="Forge 建议卡片"
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--color-tertiary, #b8c8ff)',
        background: 'var(--color-tertiary-container, #eef2ff)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontSize: '13px',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <strong>Skill Forge</strong>
        <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>
          触发：{draft.trigger === 'slash' ? '/save-as-skill' : '显式语句'}
        </span>
      </header>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>名称（kebab-case）</span>
        <input
          aria-label="Skill 名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '6px',
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>描述</span>
        <input
          aria-label="Skill 描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{
            padding: '6px 10px',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '6px',
          }}
        />
      </label>

      {showBody && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>SKILL.md 正文（草稿）</span>
          <textarea
            aria-label="SKILL 正文"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            style={{
              padding: '6px 10px',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: '6px',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            }}
          />
        </label>
      )}

      {error && <div style={{ color: 'var(--color-error)' }}>{error}</div>}

      <footer style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={accept}
          disabled={submitting || !name || !description}
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
          {submitting ? '保存中…' : '留下这个'}
        </button>
        <button
          type="button"
          onClick={() => setShowBody((v) => !v)}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-outline-variant)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {showBody ? '收起 SKILL.md' : '查看完整 SKILL.md'}
        </button>
        <button
          type="button"
          onClick={onDismissed}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid var(--color-outline-variant)',
            background: 'transparent',
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          稍后再说
        </button>
      </footer>
    </section>
  )
}
