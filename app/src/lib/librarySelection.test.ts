import { describe, expect, it } from 'vitest'
import {
  collectAncestorDirRefsForLibraryFile,
  collectLibraryFileRefsInMessage,
  joinLibraryFileRef,
  LIBRARY_CHAT_MENTION_PREFIX,
  toFullLibraryFileRef,
  toShortLibraryMention,
} from './librarySelection'

const id = '8f4e5c8c-6272-47a5-a80a-8a99ada6c371'
const full = `@/libraries/${id}/quant-wiki/docs/x.md`

describe('library chat mentions', () => {
  it('shortens full ref for active library', () => {
    expect(toShortLibraryMention(full, id)).toBe(`${LIBRARY_CHAT_MENTION_PREFIX}quant-wiki/docs/x.md`)
  })

  it('returns null when library id does not match path', () => {
    expect(toShortLibraryMention(full, '00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('rejects path traversal in relative segment', () => {
    expect(toShortLibraryMention(`@/libraries/${id}/../x`, id)).toBeNull()
  })

  it('expands short token to full ref', () => {
    expect(toFullLibraryFileRef(`${LIBRARY_CHAT_MENTION_PREFIX}quant-wiki/docs/x.md`, id)).toBe(full)
  })

  it('leaves full ref unchanged', () => {
    expect(toFullLibraryFileRef(full, id)).toBe(full)
  })

  it('collect merges short and full without duplicate', () => {
    const msg = `See ${LIBRARY_CHAT_MENTION_PREFIX}a.md and @/libraries/${id}/b.md`
    const refs = collectLibraryFileRefsInMessage(msg, id)
    expect(refs).toEqual([`@/libraries/${id}/b.md`, `@/libraries/${id}/a.md`])
  })

  it('collect ignores short mentions when no libraryId', () => {
    const msg = `${LIBRARY_CHAT_MENTION_PREFIX}a.md`
    expect(collectLibraryFileRefsInMessage(msg, null)).toEqual([])
  })

  it('joinLibraryFileRef joins dir and file name', () => {
    expect(joinLibraryFileRef(`@/libraries/${id}`, 'x.md')).toBe(`@/libraries/${id}/x.md`)
    expect(joinLibraryFileRef(`@/libraries/${id}/quant-wiki`, 'x.md')).toBe(
      `@/libraries/${id}/quant-wiki/x.md`,
    )
  })

  it('joinLibraryFileRef rejects bad file names', () => {
    expect(joinLibraryFileRef(`@/libraries/${id}`, 'a/b')).toBe('')
    expect(joinLibraryFileRef(`@/libraries/${id}`, '..')).toBe('')
  })

  it('collectAncestorDirRefsForLibraryFile lists parent dirs', () => {
    const p = `@/libraries/${id}/a/b/c.md`
    expect(collectAncestorDirRefsForLibraryFile(p)).toEqual([
      `@/libraries/${id}/a`,
      `@/libraries/${id}/a/b`,
    ])
  })
})
