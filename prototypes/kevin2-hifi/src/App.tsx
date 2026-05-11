import { useState } from 'react'
import { SetupWorkspace } from './screens/SetupWorkspace'
import { WorkspaceHome } from './screens/WorkspaceHome'
import { WorkspaceStage } from './screens/WorkspaceStage'
import { ArtifactFocus } from './screens/ArtifactFocus'
import { ActionPanelOverlay } from './screens/ActionPanelOverlay'
import { MyKevin } from './screens/MyKevin'
import { FirstEncounter } from './screens/FirstEncounter'

type ScreenId =
  | 'setup'
  | 'firstEncounter'
  | 'home'
  | 'workspace'
  | 'artifact'
  | 'action'
  | 'mykevin'

const NAV: { id: ScreenId; label: string; hint: string }[] = [
  { id: 'setup', label: 'Setup', hint: 'ia v2 §5.1' },
  { id: 'firstEncounter', label: '第一次见面', hint: '11 §2' },
  { id: 'home', label: 'Workspace Home', hint: '05 §4.1' },
  { id: 'workspace', label: 'Workspace 阶段', hint: 'ia v2 §5.2' },
  { id: 'artifact', label: 'Artifact Focus', hint: 'ia v2 §5.3' },
  { id: 'action', label: 'Action Panel', hint: '05 §4.2' },
  { id: 'mykevin', label: 'My Kevin', hint: '05 §4.5' },
]

export function App() {
  const [screen, setScreen] = useState<ScreenId>('home')
  const [actionOverlay, setActionOverlay] = useState(false)

  return (
    <div className="flex h-screen min-h-0 bg-j-bg text-j-ink">
      <aside className="flex w-56 shrink-0 flex-col border-r border-white/10 text-j-cream">
        <div className="border-b border-white/10 p-4">
          <p className="font-display text-lg leading-tight text-j-cream">Kevin 2.0</p>
          <p className="mt-1 text-[10px] leading-snug text-j-cream/55">高保真静态原型 · Junior DS</p>
        </div>
        <nav className="proto-scroll flex-1 space-y-0.5 overflow-auto p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setScreen(item.id)
                if (item.id !== 'artifact') setActionOverlay(false)
              }}
              className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                screen === item.id && !actionOverlay ? 'bg-j-brand text-j-cream' : 'hover:bg-white/10'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-[10px] text-j-cream/45">{item.hint}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3 text-[10px] text-j-cream/45">
          <code className="break-all">prototypes/kevin2-hifi</code>
        </div>
      </aside>

      <main className="relative min-w-0 flex-1 bg-j-cream">
        {screen === 'setup' && <SetupWorkspace />}
        {screen === 'firstEncounter' && <FirstEncounter />}
        {screen === 'home' && <WorkspaceHome />}
        {screen === 'workspace' && <WorkspaceStage />}
        {screen === 'artifact' && (
          <ArtifactFocus onOpenActionPanel={() => setActionOverlay(true)} />
        )}
        {screen === 'action' && <ActionPanelOverlay mode="fullscreen" onClose={() => setScreen('artifact')} />}
        {screen === 'mykevin' && <MyKevin />}
      </main>

      {actionOverlay && screen === 'artifact' && (
        <ActionPanelOverlay mode="overlay" onClose={() => setActionOverlay(false)} />
      )}
    </div>
  )
}
