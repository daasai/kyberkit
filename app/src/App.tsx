import { useState } from 'react'
import { AppShell } from './components/layout/AppShell'
import { SessionProvider } from './contexts/SessionContext'
import { ArtifactProvider } from './contexts/ArtifactContext'
import { ConfigProvider, useKevinConfig } from './contexts/ConfigContext'
import { OnboardingWizard } from './components/onboarding/OnboardingWizard'
import { SettingsPanel } from './components/settings/SettingsPanel'

function KevinGate() {
  const { config, loading, error, refresh } = useKevinConfig()
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-on-surface-variant)' }}>
        加载中…
      </div>
    )
  }

  if (error && !config) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px' }}>
        <p>无法连接 Sidecar（{error}）</p>
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
          请确认 Kevin Sidecar 已在 localhost:3001 运行。
        </p>
      </div>
    )
  }

  const needsOnboarding = !config?.onboardingComplete || !config?.user.apiKeyConfigured

  if (needsOnboarding) {
    return <OnboardingWizard onComplete={refresh} />
  }

  return (
    <>
      <SessionProvider>
        <ArtifactProvider>
          <AppShell onOpenSettings={() => setSettingsOpen(true)} />
        </ArtifactProvider>
      </SessionProvider>
      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={refresh}
      />
    </>
  )
}

export default function App() {
  return (
    <ConfigProvider>
      <KevinGate />
    </ConfigProvider>
  )
}
