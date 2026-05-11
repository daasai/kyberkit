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
  /** Library ref path after last artifact_end save (e.g. `@/libraries/<id>/file.md`). */
  savedPath: string | null
  /**
   * When the user opens a library Markdown file in the canvas, Save writes to this ref.
   * Cleared when loading session artifacts or starting a new streamed artifact.
   */
  libraryFileRef: string | null
  /**
   * Bumped on each explicit canvas load (saved artifact, library file, session hydrate).
   * Lets Milkdown re-apply when markdown text is unchanged (e.g. two saved versions with identical body).
   */
  loadSeq: number
}

interface ArtifactContextType {
  artifact: ArtifactState
  onArtifactStart: (sessionId: string) => void
  onArtifactDelta: (text: string) => void
  onArtifactEnd: () => void
  /** Load a saved artifact (e.g. when user clicks a past session). */
  loadArtifact: (sessionId: string, content: string) => void
  /** Load a library file body for Milkdown; `libraryFileRef` enables Save back to disk. */
  openLibraryDocument: (sessionId: string, content: string, libraryFileRef: string) => void
  clearArtifact: () => void
  setSavedPath: (path: string | null) => void
}

const ArtifactContext = createContext<ArtifactContextType | null>(null)

export function ArtifactProvider({ children }: { children: ReactNode }) {
  const [artifact, setArtifact] = useState<ArtifactState>({
    content: '',
    streaming: false,
    sessionId: null,
    savedPath: null,
    libraryFileRef: null,
    loadSeq: 0,
  })

  const onArtifactStart = useCallback((sessionId: string) => {
    setArtifact((prev) => ({
      content: '',
      streaming: true,
      sessionId,
      savedPath: null,
      libraryFileRef: null,
      loadSeq: prev.loadSeq + 1,
    }))
  }, [])

  const onArtifactDelta = useCallback((text: string) => {
    setArtifact(prev => ({ ...prev, content: prev.content + text }))
  }, [])

  const onArtifactEnd = useCallback(() => {
    setArtifact(prev => ({ ...prev, streaming: false }))
  }, [])

  const loadArtifact = useCallback((sessionId: string, content: string) => {
    setArtifact((prev) => ({
      content,
      streaming: false,
      sessionId,
      savedPath: null,
      libraryFileRef: null,
      loadSeq: prev.loadSeq + 1,
    }))
  }, [])

  const openLibraryDocument = useCallback((sessionId: string, content: string, libraryFileRef: string) => {
    setArtifact((prev) => ({
      content,
      streaming: false,
      sessionId,
      savedPath: null,
      libraryFileRef,
      loadSeq: prev.loadSeq + 1,
    }))
  }, [])

  const clearArtifact = useCallback(() => {
    setArtifact({ content: '', streaming: false, sessionId: null, savedPath: null, libraryFileRef: null, loadSeq: 0 })
  }, [])

  const setSavedPath = useCallback((path: string | null) => {
    setArtifact((prev) => ({ ...prev, savedPath: path, libraryFileRef: path ? null : prev.libraryFileRef }))
  }, [])

  return (
    <ArtifactContext.Provider value={{
      artifact,
      onArtifactStart,
      onArtifactDelta,
      onArtifactEnd,
      loadArtifact,
      openLibraryDocument,
      clearArtifact,
      setSavedPath,
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
