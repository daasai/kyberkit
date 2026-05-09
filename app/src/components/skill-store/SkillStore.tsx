/**
 * Skill Store (PRD §12.7 / 计划 S-10)
 *
 * - 双 Tab：「公共 Skills」(scope = global) / 「我的 Skills」(scope = space | user)
 * - 「我的 Skills」每条卡片支持「提升为用户级」(POST /skills/promote { from: 'space' })
 * - 数据来自 useSkillDirectory(spaceId) 钩子（GET /skills?space_id=...）
 *
 * 「+ 新建私有 Skill」按钮按计划 §3 L-2 延后到 v1.5.1，依旧 disabled，提示通过 Forge 蒸馏。
 */

import { useCallback, useState } from 'react'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import {
  filterSkillsByQuery,
  useSkillDirectory,
  type SkillDirectoryEntry,
} from '../../hooks/useSkillDirectory'

export interface SkillStoreProps {
  onBack: () => void
  /** When omitted (e.g. legacy callers / tests), the store still renders but skips fetch. */
  spaceId?: string | null
}

export function SkillStore({ onBack, spaceId = null }: SkillStoreProps) {
  const [tab, setTab] = useState<'public' | 'mine'>('mine')
  const [query, setQuery] = useState('')
  const [promoting, setPromoting] = useState<string | null>(null)
  const [promoteError, setPromoteError] = useState<string | null>(null)
  const { skills, error, refresh } = useSkillDirectory(spaceId)

  const promote = useCallback(
    async (name: string) => {
      if (!spaceId) {
        setPromoteError('未选中 Space，无法提升')
        return
      }
      setPromoting(name)
      setPromoteError(null)
      try {
        const res = await fetch(`${SIDECAR_URL}/skills/promote${qsSpace(spaceId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skillName: name, from: 'space' }),
        })
        if (!res.ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || `Promote failed: ${res.status}`)
        }
        await refresh()
      } catch (err) {
        setPromoteError(err instanceof Error ? err.message : String(err))
      } finally {
        setPromoting(null)
      }
    },
    [spaceId, refresh],
  )

  const filtered = filterSkillsByQuery(skills, query)
  const mine = filtered.filter((s) => s.scope !== 'global')
  const pub = filtered.filter((s) => s.scope === 'global')
  const visible = tab === 'mine' ? mine : pub

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
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
        >
          ← 返回
        </button>
        <span style={{ fontWeight: 700 }}>Skill Store</span>
        <input
          aria-label="搜索 Skills"
          placeholder="搜索 Skill 名称或描述"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            marginLeft: 'auto',
            padding: '6px 10px',
            border: '1px solid var(--color-outline-variant)',
            borderRadius: '6px',
            background: 'var(--color-surface)',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', padding: '12px 16px' }}>
        {(['public', 'mine'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border:
                tab === k ? '2px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {k === 'public' ? '公共 Skills' : '我的 Skills'}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}
        {promoteError && <p style={{ color: 'var(--color-error)' }}>{promoteError}</p>}
        {!error && visible.length === 0 && (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>
            {spaceId ? '暂无技能包。' : '请先在左侧选择一个 Space 以加载它的 Skills。'}
          </p>
        )}
        {!error &&
          visible.map((s) => (
            <SkillCard
              key={`${s.scope}:${s.name}`}
              skill={s}
              showPromote={tab === 'mine' && s.scope === 'space' && Boolean(spaceId)}
              promoting={promoting === s.name}
              onPromote={() => promote(s.name)}
            />
          ))}
        {tab === 'mine' && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              borderRadius: '10px',
              border: '1px dashed var(--color-outline-variant)',
              background: 'var(--color-surface-container-lowest)',
            }}
          >
            <button
              type="button"
              disabled
              title="将通过 Forge 蒸馏后确认落盘"
              aria-describedby="private-skill-forge-note"
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface-container)',
                color: 'var(--color-on-surface-variant)',
                cursor: 'not-allowed',
                fontWeight: 600,
              }}
            >
              + 新建私有 Skill
            </button>
            <p
              id="private-skill-forge-note"
              style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--color-on-surface-variant)' }}
            >
              私有 Skill 将通过 Forge 蒸馏后确认落盘。
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface SkillCardProps {
  skill: SkillDirectoryEntry
  showPromote: boolean
  promoting: boolean
  onPromote: () => void
}

function SkillCard({ skill, showPromote, promoting, onPromote }: SkillCardProps) {
  return (
    <div
      style={{
        padding: '12px',
        marginBottom: '8px',
        borderRadius: '10px',
        border: '1px solid var(--color-outline-variant)',
        fontSize: '13px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
        <div style={{ fontWeight: 700 }}>{skill.name}</div>
        <span
          aria-label={`scope-${skill.scope}`}
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '999px',
            background:
              skill.scope === 'space'
                ? 'var(--color-tertiary-container, #ddeeff)'
                : skill.scope === 'user'
                ? 'var(--color-secondary-container, #f0eeff)'
                : 'var(--color-surface-container, #eee)',
          }}
        >
          {skill.scope}
        </span>
        <span
          aria-label={`risk-${skill.risk}`}
          style={{
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '999px',
            background:
              skill.risk === 'medium'
                ? 'var(--color-error-container, #ffe4e1)'
                : skill.risk === 'high'
                ? 'var(--color-error, #ffb4ab)'
                : 'var(--color-surface-container, #eee)',
          }}
        >
          risk: {skill.risk}
        </span>
      </div>
      <div style={{ color: 'var(--color-on-surface-variant)' }}>{skill.description}</div>
      <div style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
        triggers: {skill.triggers.join(', ') || '—'} · tools: {skill.allowedTools.length}
      </div>
      {showPromote && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            onClick={onPromote}
            disabled={promoting}
            aria-label={`提升 ${skill.name} 为用户级`}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid var(--color-outline-variant)',
              background: promoting ? 'var(--color-surface-container)' : 'transparent',
              cursor: promoting ? 'wait' : 'pointer',
              fontSize: '12px',
            }}
          >
            {promoting ? '提升中…' : '提升为用户级'}
          </button>
        </div>
      )}
    </div>
  )
}
