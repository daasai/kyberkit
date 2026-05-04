export const KEVIN_FOCUS_CENTER_EVENT = 'kevin:focus-center'

export function requestFocusKevinCenter(): void {
  window.dispatchEvent(new CustomEvent(KEVIN_FOCUS_CENTER_EVENT))
}
