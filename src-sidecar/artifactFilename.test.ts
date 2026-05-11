import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  extractMarkdownTitleForFilename,
  pickUniqueMarkdownFileName,
  sanitizeMarkdownBaseName,
} from './artifactFilename.js'

let dir: string | undefined
afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = undefined
  }
})

describe('artifactFilename', () => {
  it('extractMarkdownTitleForFilename prefers H1', () => {
    expect(extractMarkdownTitleForFilename('# Hello\n\nbody')).toBe('Hello')
    expect(extractMarkdownTitleForFilename('## Sub\n')).toBe('Sub')
  })

  it('sanitizeMarkdownBaseName strips illegal characters', () => {
    expect(sanitizeMarkdownBaseName('a/b')).toBe('a b')
    expect(sanitizeMarkdownBaseName('')).toBe('未命名制品')
  })

  it('pickUniqueMarkdownFileName returns base.md when free', () => {
    dir = mkdtempSync(join(tmpdir(), 'kyber-artfn-'))
    expect(pickUniqueMarkdownFileName(dir, 'Hello')).toBe('Hello.md')
  })

  it('pickUniqueMarkdownFileName adds date then counter on collision', () => {
    dir = mkdtempSync(join(tmpdir(), 'kyber-artfn-'))
    writeFileSync(join(dir, 'Hello.md'), 'x')
    const second = pickUniqueMarkdownFileName(dir, 'Hello')
    expect(second).toMatch(/^Hello-\d{8}\.md$/)
    writeFileSync(join(dir, second), 'y')
    const third = pickUniqueMarkdownFileName(dir, 'Hello')
    expect(third).toMatch(/^Hello-\d{8}-2\.md$/)
  })

  it('pickUniqueMarkdownFileName ignores anchor file when renaming', () => {
    dir = mkdtempSync(join(tmpdir(), 'kyber-artfn-'))
    const anchor = join(dir, 'Hello.md')
    writeFileSync(anchor, 'keep')
    expect(pickUniqueMarkdownFileName(dir, 'Hello', { ignoreAbsPath: anchor })).toBe('Hello.md')
  })
})
