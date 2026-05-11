const PREFIX = '@/libraries/'
export const KEVIN_LIBRARY_SELECTION_EVENT = 'kevin:library-selection'

/** Open a library file from global search (LeftSidebar expands tree + selects node). */
export const KEVIN_OPEN_LIBRARY_FILE_EVENT = 'kevin:open-library-file'

export type OpenLibraryFileDetail = {
  spaceId: string
  path: string
}

export type LibrarySelectionEventDetail = {
  spaceId: string
  selectedPath: string | null
  selectedDirPath: string | null
}

/** Dir refs (`@/libraries/<id>/a/b`) that must be expanded to reveal `fullPath` in the tree. */
export function collectAncestorDirRefsForLibraryFile(fullPath: string): string[] {
  const raw = fullPath.trim()
  const m = raw.match(/^@\/libraries\/([^/]+)\/(.+)$/)
  if (!m) return []
  const libraryId = m[1]
  const rel = m[2]
  const parts = rel.split('/').filter(Boolean)
  if (parts.length <= 1) return []
  const out: string[] = []
  for (let i = 0; i < parts.length - 1; i++) {
    out.push(`@/libraries/${libraryId}/${parts.slice(0, i + 1).join('/')}`)
  }
  return out
}

export function emitOpenLibraryFile(detail: OpenLibraryFileDetail): void {
  window.dispatchEvent(new CustomEvent<OpenLibraryFileDetail>(KEVIN_OPEN_LIBRARY_FILE_EVENT, { detail }))
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

/**
 * User-facing library file token for the active Space (hides `libraries/<uuid>/`).
 * Resolved to a full `@/libraries/<id>/…` path before Sidecar `/library/file` calls.
 */
export const LIBRARY_CHAT_MENTION_PREFIX = '@/'

/**
 * "@/libraries/<libraryId>/rel" -> "@/rel" when id matches; otherwise null.
 */
export function toShortLibraryMention(fullPath: string, libraryId: string): string | null {
  const id = libraryId.trim()
  if (!id) return null
  const p = fullPath.trim()
  const head = `${PREFIX}${id}/`
  if (!p.startsWith(head)) return null
  const rel = p.slice(head.length).replace(/^\/+/, '')
  if (!rel || rel.includes('..')) return null
  return `${LIBRARY_CHAT_MENTION_PREFIX}${rel}`
}

/**
 * "@/libraries/…" passes through. "@/rel" -> "@/libraries/<libraryId>/rel" when id is set.
 */
export function toFullLibraryFileRef(token: string, libraryId: string | null): string | null {
  const t = token.trim()
  if (!t) return null
  if (t.startsWith(PREFIX)) return t
  const id = libraryId?.trim() ?? ''
  if (!id || !t.startsWith(LIBRARY_CHAT_MENTION_PREFIX)) return null
  const body = t.slice(LIBRARY_CHAT_MENTION_PREFIX.length).replace(/^\/+/, '')
  if (!body || body.includes('..')) return null
  if (body.startsWith('libraries/')) return null
  return `${PREFIX}${id}/${body}`
}

/** Build a full file ref from a library directory ref plus a file name (for `/library/move`). */
export function joinLibraryFileRef(dirRef: string, fileName: string): string {
  const d = dirRef.trim().replace(/\/+$/, '')
  const f = fileName.trim().replace(/^\/+/, '')
  if (!d || !f || f.includes('/') || f.includes('..')) return ''
  return `${d}/${f}`
}

/** Collect unique full `@/libraries/<id>/…` refs for expansion (full + short forms). */
export function collectLibraryFileRefsInMessage(text: string, libraryId: string | null): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (ref: string | null) => {
    if (!ref) return
    if (seen.has(ref)) return
    seen.add(ref)
    out.push(ref)
  }
  for (const m of text.match(/@\/libraries\/[^\s]+/g) ?? []) {
    add(m)
  }
  if (!libraryId?.trim()) return out
  const re = /(^|[\s\n])@\/(?!libraries\/)([^\s]+)/g
  for (;;) {
    const mm = re.exec(text)
    if (mm === null) break
    const token = `@/${mm[2]}`
    add(toFullLibraryFileRef(token, libraryId))
  }
  return out
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
