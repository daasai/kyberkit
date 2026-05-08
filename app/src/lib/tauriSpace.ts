export type SpaceSwitchOutcome = 'noop' | 'focused' | 'failed'

type TauriWindowApi = {
  __TAURI__?: {
    core?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>
    }
  }
}

/**
 * Opens and focuses the requested space window in desktop builds.
 * Falls back to no-op in browser/dev contexts where Tauri isn't available.
 */
export async function openAndFocusSpace(targetSpaceId: string): Promise<boolean> {
  const tauriWindow = window as TauriWindowApi
  const invoke = tauriWindow.__TAURI__?.core?.invoke
  if (invoke) {
    await invoke('open_and_focus_space_window', { targetSpaceId })
    return true
  }

  // Browser/dev fallback: emulate dedicated-space behavior with a new tab/window.
  const nextUrl = new URL(window.location.href)
  nextUrl.searchParams.set('space_id', targetSpaceId)
  const popup = window.open(nextUrl.toString(), '_blank', 'noopener,noreferrer')
  if (!popup) return false
  popup.focus()
  return true
}

