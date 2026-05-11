/**
 * Forge 建议卡片（PRD §12.3.3 / 计划 S-3）
 *
 * 调用方负责传入 draft（来自 POST /skills/forge/suggest 或 SSE skill.suggested）。
 * 三按钮：「留下这个」「查看完整 SKILL.md」「稍后再说」。
 * 「留下这个」→ POST /skills/forge/accept；成功后调用 onAccepted(name)。
 */

import { useState, type CSSProperties } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'

export interface ForgeDraft {
  trigger: 'slash' | 'explicit'
  suggestedName: string
  suggestedDescription: string
  bodySeed: string
  /** Server-side LLM distill succeeded. */
  distilled?: boolean
  /** Present when distill failed or was skipped (e.g. no API key). */
  distillError?: string
}

export interface ForgeSuggestionCardProps {
  draft: ForgeDraft
  spaceId: string
  onAccepted: (name: string) => void
  onDismissed: () => void
}

function distillErrorLabel(code: string): string {
  const c = code.trim()
  if (c === 'no_api_key') return '未配置 Anthropic API Key（侧栏配置或环境变量 ANTHROPIC_API_KEY）'
  if (c === 'auth_401')
    return '模型 API 认证失败（401）：请检查 ANTHROPIC_API_KEY 是否正确；若走兼容网关，请配置与主对话一致的 KYBER_MODEL_BASE_URL。'
  if (c === 'rate_limit') return '模型限流（429），请稍后再试。'
  if (c === 'overloaded') return '模型服务繁忙，请稍后再试。'
  if (c === 'no_assistant_content') return '本轮没有可用的助手正文或制品内容'
  if (c === 'empty_context') return '缺少助手上下文'
  if (c === 'parse_error') return '模型返回格式无法解析为 JSON'
  return c.length > 120 ? `${c.slice(0, 120)}…` : c
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

  const fieldStyle: CSSProperties = {
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--color-outline-variant)',
    background: 'var(--color-surface-container-lowest)',
    color: 'var(--color-on-surface)',
    fontSize: '13px',
    outline: 'none',
  }

  const ghostButtonStyle: CSSProperties = {
    padding: '6px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-outline)',
    background: 'var(--color-surface-container-lowest)',
    color: 'var(--color-on-surface)',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  }

  return (
    <section
      aria-label="Forge 建议卡片"
      style={{
        margin: '12px 0',
        padding: '14px 16px',
        borderRadius: '12px',
        border: '1px solid var(--color-outline-variant)',
        /* 不用 tertiary-container：主题里为深棕，与 on-surface 对比极差 */
        background: 'var(--color-secondary-container)',
        color: 'var(--color-on-secondary-container)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        fontSize: '13px',
        boxShadow: '0 1px 3px color-mix(in srgb, var(--color-on-surface) 8%, transparent)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--color-on-secondary-container)', fontSize: '14px' }}>Skill Forge</strong>
        <span style={{ fontSize: '11px', color: 'var(--color-on-secondary-container)', opacity: 0.92 }}>
          触发：{draft.trigger === 'slash' ? '/save-as-skill' : '显式语句'}
          {draft.distilled === true ? ' · 已蒸馏' : draft.distilled === false ? ' · 草稿未蒸馏' : ''}
        </span>
      </header>

      {draft.distillError && (
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--color-on-error-container)',
            background: 'var(--color-error-container)',
            border: '1px solid var(--color-error)',
            padding: '10px 12px',
            borderRadius: '8px',
          }}
        >
          <strong style={{ display: 'block', marginBottom: '4px' }}>蒸馏未完成</strong>
          {distillErrorLabel(draft.distillError)}
          <span style={{ display: 'block', marginTop: '6px', opacity: 0.9 }}>
            下方为占位草稿，保存前请核对或手动编辑正文。
          </span>
        </p>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-on-secondary-container)' }}>
          名称（kebab-case）
        </span>
        <input
          aria-label="Skill 名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-on-secondary-container)' }}>描述</span>
        <input
          aria-label="Skill 描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={fieldStyle}
        />
      </label>

      {showBody && (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-on-secondary-container)' }}>
            SKILL.md 正文（草稿）
          </span>
          <textarea
            aria-label="SKILL 正文"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            style={{
              ...fieldStyle,
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              lineHeight: 1.45,
              resize: 'vertical',
            }}
          />
        </label>
      )}

      {error && (
        <div
          style={{
            color: 'var(--color-on-error-container)',
            background: 'var(--color-error-container)',
            padding: '8px 10px',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      <footer style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={accept}
          disabled={submitting || !name || !description}
          style={{
            padding: '8px 14px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            cursor: submitting || !name || !description ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            opacity: submitting || !name || !description ? 0.55 : 1,
          }}
        >
          {submitting ? '保存中…' : '留下这个'}
        </button>
        <button type="button" onClick={() => setShowBody((v) => !v)} style={ghostButtonStyle}>
          {showBody ? '收起 SKILL.md' : '查看完整 SKILL.md'}
        </button>
        <button type="button" onClick={onDismissed} style={{ ...ghostButtonStyle, marginLeft: 'auto' }}>
          稍后再说
        </button>
      </footer>
    </section>
  )
}
