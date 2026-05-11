import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

/** 沉浸式主流程（无侧栏导航） */
export type FlowScreen =
  | 'setup'
  | 'firstEncounter'
  | 'workspace'
  | 'artifact'
  | 'action'
  | 'mykevin'
  | 'settings'
  | 'svgGallery'

type FlowValue = {
  screen: FlowScreen
  go: (next: FlowScreen) => void
  actionOverlay: boolean
  openAction: () => void
  closeAction: () => void
}

const FlowContext = createContext<FlowValue | null>(null)

export function FlowProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<FlowScreen>('workspace')
  const [actionOverlay, setActionOverlay] = useState(false)

  const go = useCallback((next: FlowScreen) => {
    setScreen(next)
    setActionOverlay(false)
  }, [])

  const openAction = useCallback(() => setActionOverlay(true), [])
  const closeAction = useCallback(() => setActionOverlay(false), [])

  const value = useMemo(
    () => ({
      screen,
      go,
      actionOverlay,
      openAction,
      closeAction,
    }),
    [screen, actionOverlay, go, openAction, closeAction],
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useFlow() {
  const ctx = useContext(FlowContext)
  if (!ctx) throw new Error('useFlow must be used within FlowProvider')
  return ctx
}
