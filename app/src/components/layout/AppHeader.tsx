export function AppHeader() {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '56px',
        padding: '0 24px',
        backgroundColor: 'var(--color-surface-container-lowest)',
        borderBottom: '1px solid var(--color-outline-variant)',
        flexShrink: 0,
        zIndex: 40,
      }}
    >
      {/* Left: Logo + Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined filled" style={{ color: 'var(--color-primary)', fontSize: '22px' }}>terminal</span>
          Kevin
        </div>

        {/* Divider */}
        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-outline-variant)' }} />

        {/* Nav Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {['Drafts', 'Published', 'Reviews', 'Archive'].map((tab) => {
            const isActive = tab === 'Published'
            return (
              <a
                key={tab}
                href="#"
                style={{
                  padding: '16px 12px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: isActive ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
                  textDecoration: 'none',
                  borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                  transition: 'color 150ms ease, border-color 150ms ease',
                  display: 'flex',
                  alignItems: 'center',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--color-primary)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--color-on-surface-variant)' }}
              >
                {tab}
              </a>
            )
          })}
        </nav>
      </div>

      {/* Right: Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Icon Buttons */}
        {['settings', 'notifications'].map((icon) => (
          <button
            key={icon}
            style={{
              padding: '8px',
              background: 'transparent',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: 'var(--color-on-surface-variant)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>{icon}</span>
            {icon === 'notifications' && (
              <span style={{
                position: 'absolute', top: '8px', right: '8px',
                width: '7px', height: '7px',
                background: 'var(--color-error)',
                borderRadius: '50%',
              }} />
            )}
          </button>
        ))}

        <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--color-outline-variant)', margin: '0 4px' }} />

        {/* Export */}
        <button style={{
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '8px',
          color: 'var(--color-on-surface)',
          cursor: 'pointer',
          transition: 'background 150ms ease',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-surface-container-lowest)')}
        >
          Export
        </button>

        {/* Share */}
        <button style={{
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: 600,
          background: 'var(--color-primary)',
          border: 'none',
          borderRadius: '8px',
          color: 'var(--color-on-primary)',
          cursor: 'pointer',
          transition: 'background 150ms ease',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-primary-container)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-primary)')}
        >
          Share
        </button>

        {/* Avatar */}
        <div style={{
          width: '32px', height: '32px',
          borderRadius: '50%',
          background: 'var(--color-primary-container)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-on-primary)',
          fontSize: '13px',
          fontWeight: 600,
          marginLeft: '4px',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          S
        </div>
      </div>
    </header>
  )
}
