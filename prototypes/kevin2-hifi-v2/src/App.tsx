import { FlowProvider, useFlow } from './flow/FlowContext'
import { SetupWorkspace } from './screens/SetupWorkspace'
import { WorkspaceStage } from './screens/WorkspaceStage'
import { ArtifactFocus } from './screens/ArtifactFocus'
import { ActionPanelOverlay } from './screens/ActionPanelOverlay'
import { MyKevin } from './screens/MyKevin'
import { FirstEncounter } from './screens/FirstEncounter'
import { SettingsPlaceholder } from './screens/SettingsPlaceholder'
import { SvgGallery } from './screens/SvgGallery'

function AppRoutes() {
  const { screen, actionOverlay, openAction, closeAction, go } = useFlow()

  return (
    <>
      <main className="relative min-h-0 flex-1 overflow-hidden bg-cd-page">
        {screen === 'setup' && <SetupWorkspace />}
        {screen === 'firstEncounter' && <FirstEncounter />}
        {screen === 'workspace' && <WorkspaceStage />}
        {screen === 'artifact' && <ArtifactFocus onOpenActionPanel={openAction} />}
        {screen === 'action' && (
          <ActionPanelOverlay mode="fullscreen" onClose={() => go('workspace')} variant="flow" />
        )}
        {screen === 'mykevin' && <MyKevin />}
        {screen === 'settings' && <SettingsPlaceholder />}
        {screen === 'svgGallery' && <SvgGallery />}
      </main>
      {actionOverlay && screen === 'artifact' && (
        <ActionPanelOverlay mode="overlay" onClose={closeAction} variant="flow" />
      )}
    </>
  )
}

export function App() {
  return (
    <FlowProvider>
      <div className="flex h-screen min-h-0 flex-col text-j-ink">
        <AppRoutes />
      </div>
    </FlowProvider>
  )
}
