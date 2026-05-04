import { AppShell } from './components/layout/AppShell'
import { SessionProvider } from './contexts/SessionContext'
import { ArtifactProvider } from './contexts/ArtifactContext'

export default function App() {
  return (
    <SessionProvider>
      <ArtifactProvider>
        <AppShell />
      </ArtifactProvider>
    </SessionProvider>
  )
}
