/**
 * Slash command palette — filters installed Skills when input starts with `/`.
 */

export type SlashSkillHint = { name: string; description: string }

export function SlashCommandMenu({
  items,
  selectedIndex,
  onSelectIndex,
  onPick,
  emptyMode = 'filtered',
}: {
  items: SlashSkillHint[]
  selectedIndex: number
  onSelectIndex: (i: number) => void
  onPick: (skill: SlashSkillHint) => void
  /** `none` = no Skills loaded; `filtered` = query excluded all Skills. */
  emptyMode?: 'none' | 'filtered'
}) {
  if (items.length === 0) {
    const hint =
      emptyMode === 'none'
        ? '当前 Space 下暂无已安装的 Skill。可直接发送文字对话；若要让 Kevin 蒸馏流程为 Skill，可在回复中说「记住这个流程」或使用 /save-as-skill 名称。'
        : '无匹配 Skill。继续输入以筛选，或按 Esc 取消。'
    return (
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: '8px',
          right: '8px',
          marginBottom: '8px',
          maxHeight: '220px',
          overflowY: 'auto',
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          padding: '10px 12px',
          fontSize: '12px',
          color: 'var(--color-on-surface-variant)',
          zIndex: 5,
          lineHeight: 1.45,
        }}
      >
        {hint}
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '8px',
        right: '8px',
        marginBottom: '8px',
        maxHeight: '220px',
        overflowY: 'auto',
        background: 'var(--color-surface-container-lowest)',
        border: '1px solid var(--color-outline-variant)',
        borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        zIndex: 5,
      }}
    >
      {items.map((s, i) => {
        const active = i === selectedIndex
        return (
          <button
            key={s.name}
            type="button"
            data-active={active ? 'true' : 'false'}
            onMouseEnter={() => onSelectIndex(i)}
            onClick={() => onPick(s)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '8px 12px',
              fontSize: '12px',
              border: 'none',
              background: active ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)' : 'transparent',
              cursor: 'pointer',
              color: 'var(--color-on-surface)',
            }}
          >
            <span style={{ fontWeight: 700 }}>[{s.name}]</span>
            <span style={{ color: 'var(--color-on-surface-variant)', fontWeight: 400 }}>
              {' — '}
              {s.description || '（无描述）'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
