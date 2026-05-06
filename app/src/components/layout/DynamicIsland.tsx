import type { DynamicIslandState } from '../../hooks/useDynamicIslandState'

type DynamicIslandProps = {
  state: DynamicIslandState
}

export function DynamicIsland({ state }: DynamicIslandProps) {
  const tone =
    state.mode === 'awaiting_signoff'
      ? '#dc2626'
      : state.mode === 'running'
        ? '#2563eb'
        : state.mode === 'completed_transient'
          ? '#16a34a'
          : '#6b7280'

  return (
    <output
      role="status"
      aria-live="polite"
      data-mode={state.mode}
      className="kevin-island-bar"
      style={{
        height: '30px',
        minWidth: '280px',
        maxWidth: '520px',
        borderRadius: '999px',
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'var(--color-surface-container)',
        border: '1px solid var(--color-outline-variant)',
        color: 'var(--color-on-surface)',
        fontSize: '12px',
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      <span
        aria-hidden
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: tone,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {state.label}
      </span>
    </output>
  )
}

