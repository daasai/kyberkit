/**
 * ArtifactContext — holds per-session artifact content and streaming state.
 *
 * When the Sidecar emits artifact_start / artifact_delta / artifact_end events,
 * RightPanel feeds them into this context. CenterPanel subscribes and updates
 * the Milkdown editor accordingly — no more window.dispatchEvent hacks.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ArtifactState {
  /** Accumulated artifact content for the active session. */
  content: string
  /** True while artifact_delta events are still flowing. */
  streaming: boolean
  /** Which session this artifact belongs to. */
  sessionId: string | null
}

interface ArtifactContextType {
  artifact: ArtifactState
  onArtifactStart: (sessionId: string) => void
  onArtifactDelta: (text: string) => void
  onArtifactEnd: () => void
  /** Load a saved artifact (e.g. when user clicks a past session). */
  loadArtifact: (sessionId: string, content: string) => void
  clearArtifact: () => void
}

const ArtifactContext = createContext<ArtifactContextType | null>(null)

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [artifact, setArtifact] = useState<ArtifactState>({
    content: '',
    streaming: false,
    sessionId: null,
  })

  const onArtifactStart = useCallback((sessionId: string) => {
    setArtifact({ content: '', streaming: true, sessionId })
  }, [])

  const onArtifactDelta = useCallback((text: string) => {
    setArtifact(prev => ({ ...prev, content: prev.content + text }))
  }, [])

  const onArtifactEnd = useCallback(() => {
    setArtifact(prev => ({ ...prev, streaming: false }))
  }, [])

  const loadArtifact = useCallback((sessionId: string, content: string) => {
    setArtifact({ content, streaming: false, sessionId })
  }, [])

  const clearArtifact = useCallback(() => {
    setArtifact({ content: '', streaming: false, sessionId: null })
  }, [])

  return (
    <ArtifactContext.Provider value={{
      artifact,
      onArtifactStart,
      onArtifactDelta,
      onArtifactEnd,
      loadArtifact,
      clearArtifact,
    }}>
      {children}
    </ArtifactContext.Provider>
  )
}

export function useArtifact(): ArtifactContextType {
  const ctx = useContext(ArtifactContext)
  if (!ctx) throw new Error('useArtifact must be used within ArtifactProvider')
  return ctx
}
