import { describe, expect, it } from 'vitest'
import { isMarkdownLibraryRef, markdownSaveTargetPath } from './markdownSaveTarget'

describe('markdownSaveTarget', () => {
  it('isMarkdownLibraryRef', () => {
    expect(isMarkdownLibraryRef('@/libraries/u/a.md')).toBe(true)
    expect(isMarkdownLibraryRef('@/libraries/u/a.markdown')).toBe(true)
    expect(isMarkdownLibraryRef('@/libraries/u/a.pdf')).toBe(false)
  })

  it('prefers libraryFileRef when streaming false', () => {
    expect(
      markdownSaveTargetPath({
        streaming: false,
        libraryFileRef: '@/libraries/u/x.md',
        savedPath: '@/libraries/u/y.md',
      }),
    ).toBe('@/libraries/u/x.md')
  })

  it('uses savedPath when no libraryFileRef', () => {
    expect(
      markdownSaveTargetPath({
        streaming: false,
        libraryFileRef: null,
        savedPath: '@/libraries/u/y.md',
      }),
    ).toBe('@/libraries/u/y.md')
  })

  it('returns null while streaming', () => {
    expect(
      markdownSaveTargetPath({
        streaming: true,
        libraryFileRef: '@/libraries/u/x.md',
        savedPath: null,
      }),
    ).toBeNull()
  })
})
