import { closeSync, openSync, readSync, statSync } from 'fs'
import { resolve as resolvePath } from 'path'
import { listSpaceDocsTree, type SpaceDocTreeNode } from '../src/runtime/paths/PathResolver.js'

export type LibrarySearchScope = { spaceId: string; libraryId: string; mountPath: string }

export type LibrarySearchHit = {
  /** Full `@/libraries/<id>/rel` ref */
  path: string
  /** Short display path under mount */
  relLabel: string
  snippet: string
}

const MIN_QUERY_LEN = 2
const MAX_HITS = 50
const MAX_FILES_SCANNED = 600
const PER_FILE_READ_CAP = 512 * 1024

const TEXT_NAME_RE =
  /\.(md|mdx|txt|markdown|json|ya?ml|toml|csv|html|htm|xml|rst|log|ts|tsx|js|jsx|mjs|cjs|css|scss|less|adoc)$/i

function isLikelyBinary(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  for (const b of sample) {
    if (b === 0) return true
  }
  return false
}

function flattenFiles(nodes: SpaceDocTreeNode[]): SpaceDocTreeNode[] {
  const files: SpaceDocTreeNode[] = []
  const walk = (ns: SpaceDocTreeNode[]) => {
    for (const n of ns) {
      if (n.kind === 'file') files.push(n)
      else if (n.children?.length) walk(n.children)
    }
  }
  walk(nodes)
  return files
}

function relFromLibraryPath(libraryId: string, fullPath: string): string | null {
  const head = `@/libraries/${libraryId}/`
  if (!fullPath.startsWith(head)) return null
  const rel = fullPath.slice(head.length).replace(/^\/+/, '')
  return rel && !rel.includes('..') ? rel : null
}

function snippetAround(text: string, needleLower: string, needleRawLen: number, radius = 90): string {
  const lower = text.toLowerCase()
  const i = lower.indexOf(needleLower)
  if (i < 0) return ''
  const start = Math.max(0, i - radius)
  const end = Math.min(text.length, i + Math.max(needleRawLen, needleLower.length) + radius)
  let s = text.slice(start, end).replace(/\s+/g, ' ').trim()
  if (start > 0) s = `…${s}`
  if (end < text.length) s = `${s}…`
  return s
}

/**
 * Full-text-ish search over Library text files (bounded scan for MVP).
 */
export function searchLibraryFiles(scope: LibrarySearchScope, query: string): LibrarySearchHit[] {
  const q = query.trim()
  if (q.length < MIN_QUERY_LEN) return []
  const needle = q.toLowerCase()
  const root = resolvePath(scope.mountPath)

  let tree: SpaceDocTreeNode[]
  try {
    tree = listSpaceDocsTree(scope.spaceId)
  } catch {
    return []
  }

  const files = flattenFiles(tree).filter((n) => TEXT_NAME_RE.test(n.name))
  const hits: LibrarySearchHit[] = []
  let scanned = 0

  for (const node of files) {
    if (hits.length >= MAX_HITS) break
    if (scanned >= MAX_FILES_SCANNED) break
    const rel = relFromLibraryPath(scope.libraryId, node.path)
    if (!rel) continue
    const abs = resolvePath(scope.mountPath, rel)
    if (!abs.startsWith(root)) continue

    let st: ReturnType<typeof statSync>
    try {
      st = statSync(abs)
    } catch {
      continue
    }
    if (!st.isFile() || st.size === 0) continue

    scanned += 1

    const nameMatch = node.name.toLowerCase().includes(needle)
    const readLen = Math.min(st.size, PER_FILE_READ_CAP)
    let text = ''
    let contentMatch = false

    try {
      const fd = openSync(abs, 'r')
      const buf = Buffer.allocUnsafe(readLen)
      readSync(fd, buf, 0, readLen, 0)
      closeSync(fd)
      if (isLikelyBinary(buf)) continue
      text = buf.toString('utf-8')
      contentMatch = text.toLowerCase().includes(needle)
    } catch {
      continue
    }

    if (!nameMatch && !contentMatch) continue

    const snippet = contentMatch
      ? snippetAround(text, needle, q.length)
      : `（文件名匹配）${node.name}`

    hits.push({
      path: node.path,
      relLabel: rel,
      snippet: snippet || node.name,
    })
  }

  return hits
}
