import { existsSync } from 'fs'
import { join } from 'path'

/** First Markdown H1 text, else first non-empty line (trimmed), for naming files. */
export function extractMarkdownTitleForFilename(text: string): string {
  const t = text.trim()
  if (!t) return ''
  for (const line of t.split(/\n/)) {
    const trimmed = line.trim()
    const m = trimmed.match(/^#{1,3}\s+(.+)/)
    if (m) {
      const title = m[1].trim()
      if (title) return title.length > 200 ? title.slice(0, 200) : title
    }
  }
  const plain = t.replace(/\s+/g, ' ').trim()
  return plain.length > 120 ? plain.slice(0, 120) : plain
}

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g

/** Safe single-segment file base (no extension, no slashes). */
export function sanitizeMarkdownBaseName(raw: string): string {
  let s = raw.replace(ILLEGAL, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(/^\.+|\.+$/g, '').trim()
  if (!s) return '未命名制品'
  if (s.length > 120) s = s.slice(0, 120).trim()
  return s || '未命名制品'
}

function yyyymmddLocal(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

export type PickUniqueMdOpts = {
  /** If set, this absolute path is treated as unoccupied (rename-in-place). */
  ignoreAbsPath?: string
}

/**
 * Picks `basename.md` under `targetDirAbs` that does not exist yet.
 * On collision: `base-YYYYMMDD.md`, then `base-YYYYMMDD-2.md`, …
 */
export function pickUniqueMarkdownFileName(
  targetDirAbs: string,
  baseWithoutExt: string,
  opts?: PickUniqueMdOpts,
): string {
  const base = sanitizeMarkdownBaseName(baseWithoutExt)
  const occupied = (name: string) => {
    const abs = join(targetDirAbs, name)
    if (opts?.ignoreAbsPath && abs === opts.ignoreAbsPath) return false
    return existsSync(abs)
  }

  let candidate = `${base}.md`
  if (!occupied(candidate)) return candidate

  const stamp = yyyymmddLocal()
  candidate = `${base}-${stamp}.md`
  if (!occupied(candidate)) return candidate

  for (let n = 2; ; n += 1) {
    candidate = `${base}-${stamp}-${n}.md`
    if (!occupied(candidate)) return candidate
  }
}
