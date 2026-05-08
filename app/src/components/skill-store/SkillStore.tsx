/**
 * Skill Store B 形态（PRD §12.7）— 双 Tab，数据来自 GET /skills
 */

import { useEffect, useState } from 'react'
import { SIDECAR_URL } from '../../config/sidecarUrl'

interface SkillCard {
  name: string
  description: string
  whenToUse: string
  sourcePath: string
  allowedTools: string[]
  kevin?: {
    scope: string
    risk: string
    triggers: string[]
    learningEnabled: boolean
  }
}

export function SkillStore({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'public' | 'mine'>('mine')
  const [skills, setSkills] = useState<SkillCard[]>([])
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${SIDECAR_URL}/skills`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((d: SkillCard[]) => setSkills(Array.isArray(d) ? d : []))
      .catch(() => setErr('无法加载 Skills（需完成 Onboarding 且 Sidecar 就绪）'))
  }, [])

  const mine = skills.filter((s) => (s.kevin?.scope ?? 'space') !== 'global')
  const pub = skills.filter((s) => s.kevin?.scope === 'global')
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
        {err && <p style={{ color: 'var(--color-error)' }}>{err}</p>}
        {!err && visible.length === 0 && (
          <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '14px' }}>暂无技能包。</p>
        )}
        {!err &&
          visible.map((s) => (
            <div
              key={s.name + s.sourcePath}
              style={{
                padding: '12px',
                marginBottom: '8px',
                borderRadius: '10px',
                border: '1px solid var(--color-outline-variant)',
                fontSize: '13px',
              }}
            >
              <div style={{ fontWeight: 700 }}>{s.name}</div>
              <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '4px' }}>{s.description}</div>
              <div style={{ marginTop: '6px', fontSize: '12px' }}>
                scope: {s.kevin?.scope ?? '—'} · risk: {s.kevin?.risk ?? '—'} · tools: {s.allowedTools?.length ?? 0}
              </div>
            </div>
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
