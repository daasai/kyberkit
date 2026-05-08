const PREFIX = '@/libraries/'
export const KEVIN_LIBRARY_SELECTION_EVENT = 'kevin:library-selection'

export type LibrarySelectionEventDetail = {
  spaceId: string
  selectedPath: string | null
  selectedDirPath: string | null
}

function storageKey(spaceId: string): string {
  return `kevin:selected-library-dir:${spaceId}`
}

export function getSelectedLibraryDir(spaceId: string): string | null {
  if (!spaceId) return null
  try {
    const v = localStorage.getItem(storageKey(spaceId))?.trim() ?? ''
    return v || null
  } catch {
    return null
  }
}

export function setSelectedLibraryDir(spaceId: string, path: string | null): void {
  if (!spaceId) return
  try {
    const key = storageKey(spaceId)
    const next = path?.trim() ?? ''
    if (!next) {
      localStorage.removeItem(key)
      emitLibrarySelection({ spaceId, selectedPath: null, selectedDirPath: null })
      return
    }
    localStorage.setItem(key, next)
    emitLibrarySelection({ spaceId, selectedPath: null, selectedDirPath: next })
  } catch {
    // ignore storage errors
  }
}

/** Returns the parent directory reference for a library file/dir reference path. */
export function toParentLibraryDir(path: string): string | null {
  const raw = path.trim()
  if (!raw.startsWith(PREFIX)) return null
  const rest = raw.slice(PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return raw
  const libraryId = rest.slice(0, slash)
  const sub = rest.slice(slash + 1)
  if (!sub) return `${PREFIX}${libraryId}`
  const parts = sub.split('/').filter(Boolean)
  if (parts.length <= 1) return `${PREFIX}${libraryId}`
  return `${PREFIX}${libraryId}/${parts.slice(0, -1).join('/')}`
}

export function emitLibrarySelection(detail: LibrarySelectionEventDetail): void {
  window.dispatchEvent(new CustomEvent<LibrarySelectionEventDetail>(KEVIN_LIBRARY_SELECTION_EVENT, { detail }))
}

export function shortenLibraryPath(path: string | null, keep = 40): string {
  const raw = (path ?? '').trim()
  if (!raw) return '(Library 根目录)'
  if (raw.length <= keep) return raw
  const head = raw.slice(0, Math.floor(keep * 0.45))
  const tail = raw.slice(raw.length - Math.floor(keep * 0.45))
  return `${head}...${tail}`
}

/** Convert "@/libraries/<libraryId>/foo/bar" -> "foo/bar". */
export function toLibraryRelativePath(path: string | null): string {
  const raw = (path ?? '').trim()
  if (!raw) return ''
  if (!raw.startsWith(PREFIX)) return raw
  const rest = raw.slice(PREFIX.length)
  const slash = rest.indexOf('/')
  if (slash < 0) return ''
  return rest.slice(slash + 1).replace(/^\/+/, '')
}

/**
 * Human-friendly directory label:
 * - shows Library-relative path only
 * - keeps bottom segments when too long (e.g. ".../foo/bar/baz")
 */
export function formatDirectoryBadge(path: string | null, maxChars = 44): string {
  const rel = toLibraryRelativePath(path)
  if (!rel) return '根目录'
  if (rel.length <= maxChars) return rel

  const parts = rel.split('/').filter(Boolean)
  if (parts.length === 0) return '根目录'

  let out = parts[parts.length - 1]
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const candidate = `${parts[i]}/${out}`
    if (candidate.length + 4 > maxChars) break
    out = candidate
  }
  return `.../${out}`
}
