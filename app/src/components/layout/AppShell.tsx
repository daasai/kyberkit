import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { AppHeader } from './AppHeader'
import { LeftSidebar } from './LeftSidebar'
import { CenterPanel } from './CenterPanel'
import { RightPanel } from './RightPanel'
import { SkillStore } from '../skill-store/SkillStore'
import { AutomationCenter } from '../automation/AutomationCenter'
import { NotificationCenter } from '../notifications/NotificationCenter'
import { GlobalSearchView } from '../search/GlobalSearchView'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { useDynamicIslandState, type IslandEvent } from '../../hooks/useDynamicIslandState'

function ArtifactAutoLoader() {
  const { activeSessionId, spaceId } = useSession()
  const { loadArtifact, clearArtifact, artifact } = useArtifact()
  const loadedFor = useRef<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeSessionId

  useEffect(() => {
    if (!activeSessionId) return
    // Don't reload if already loaded for this session, or if currently streaming
    if (loadedFor.current === activeSessionId && !artifact.streaming) return
    if (artifact.streaming) return

    const sid = activeSessionId
    fetch(`${SIDECAR_URL}/sessions/${sid}${qsSpace(spaceId)}`)
      .then(r => r.json())
      .then(data => {
        if (activeIdRef.current !== sid) return
        loadedFor.current = sid
        if (data.artifactContent) {
          loadArtifact(sid, data.artifactContent)
        } else {
          clearArtifact()
        }
      })
      .catch(() => { /* Sidecar not ready */ })
  }, [activeSessionId, spaceId, artifact.streaming, loadArtifact, clearArtifact])

  return null
}

const PANEL_SIZES_KEY = 'kevin:panel-sizes-v2'

function getSavedSizes(): number[] {
  try {
    const saved = localStorage.getItem(PANEL_SIZES_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((n: unknown) => typeof n === 'number')) {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return [20, 55, 25]
}

function ResizeHandle() {
  return (
    <PanelResizeHandle
      style={{
        width: '4px',
        flexShrink: 0,
        cursor: 'col-resize',
        background: 'transparent',
        border: 'none',
        transition: 'background 200ms ease',
        position: 'relative',
        zIndex: 10,
      }}
      onDragging={(isDragging) => {
        document.body.style.cursor = isDragging ? 'col-resize' : ''
        document.body.style.userSelect = isDragging ? 'none' : ''
      }}
    >
      {/* Visual indicator line */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transition: 'background 200ms ease',
        }}
        className="resize-handle-inner"
      />
    </PanelResizeHandle>
  )
}

export function AppShell({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const savedSizes = getSavedSizes()
  const { spaceId } = useSession()
  const [centerView, setCenterView] = useState<'editor' | 'skillstore' | 'automation'>('editor')
  const [searchOpen, setSearchOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [islandEvents, setIslandEvents] = useState<IslandEvent[]>([])
  const islandState = useDynamicIslandState(islandEvents)

  useEffect(() => {
    const ISLAND_EVENT = 'kevin:island-event'
    const listener = (evt: Event) => {
      const detail = (evt as CustomEvent<IslandEvent>).detail
      if (!detail) return
      setIslandEvents((prev) => [...prev.slice(-5), detail])
    }
    window.addEventListener(ISLAND_EVENT, listener)
    return () => window.removeEventListener(ISLAND_EVENT, listener)
  }, [])

  const onLayout = useCallback((sizes: number[]) => {
    try {
      localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify(sizes))
    } catch { /* ignore */ }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <ArtifactAutoLoader />
      <AppHeader
        onOpenSettings={onOpenSettings}
        onOpenNotifications={() => setNotifOpen((v) => !v)}
        islandState={islandState}
        notifyBadge={islandState.mode === 'awaiting_signoff'}
      />
      <NotificationCenter open={notifOpen} onClose={() => setNotifOpen(false)} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', minHeight: 0 }}>
        <PanelGroup
          direction="horizontal"
          onLayout={onLayout}
          style={{ width: '100%', height: '100%' }}
        >
          <Panel defaultSize={savedSizes[0]} minSize={15} maxSize={30}>
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <LeftSidebar
                onOpenSkillStore={() => setCenterView('skillstore')}
                onOpenAutomation={() => setCenterView('automation')}
                onOpenSearch={() => setSearchOpen(true)}
              />
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={savedSizes[1]} minSize={35}>
            <div id="kevin-center-panel" style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
              {centerView === 'editor' && <CenterPanel />}
              {centerView === 'skillstore' && <SkillStore onBack={() => setCenterView('editor')} />}
              {centerView === 'automation' && <AutomationCenter spaceId={spaceId} onBack={() => setCenterView('editor')} />}
              {searchOpen && <GlobalSearchView onBack={() => setSearchOpen(false)} />}
            </div>
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={savedSizes[2]} minSize={18} maxSize={40}>
            <div style={{ height: '100%', overflow: 'hidden' }}>
              <RightPanel />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <style>{`
        .resize-handle-inner:hover,
        [data-resize-handle-active] .resize-handle-inner {
          background: color-mix(in srgb, var(--color-primary) 30%, transparent) !important;
        }
      `}</style>
    </div>
  )
}
