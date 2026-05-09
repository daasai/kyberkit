import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { previewFeishuDocDiff, runFeishuDocWriteMock, type FeishuDocWriteInput } from './feishuDocWrite'

let tempRoot: string

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), 'kyber-feishu-'))
})

afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true })
})

const SAMPLE_INPUT: FeishuDocWriteInput = {
  title: 'Daily Brief — 2026-05-09',
  bodyMarkdown: '# Daily Brief\n\n- Pulled DW.\n- Sent to channel.\n',
  spaceId: 'space-1',
  sessionId: 'sess-1',
}

describe('feishuDocWrite — diff preview', () => {
  it('returns added/removed line counts and per-line diff vs prior content', () => {
    const prior = '# Daily Brief\n\n- Pulled DW.\n'
    const next = '# Daily Brief\n\n- Pulled DW.\n- Sent to channel.\n'
    const diff = previewFeishuDocDiff({ prior, next })
    expect(diff.added.some((l) => l.includes('Sent to channel'))).toBe(true)
    expect(diff.removed).toEqual([])
    expect(diff.preview).toContain('+ - Sent to channel.')
  })

  it('returns the next body when prior is empty (new doc)', () => {
    const diff = previewFeishuDocDiff({ prior: '', next: '# Hello\nWorld\n' })
    expect(diff.added).toEqual(['# Hello', 'World'])
    expect(diff.removed).toEqual([])
  })

  it('handles unchanged content', () => {
    const same = 'identical\nbody\n'
    const diff = previewFeishuDocDiff({ prior: same, next: same })
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

describe('feishuDocWrite — mock sink', () => {
  it('writes to a mock file under the supplied target dir and returns metadata', () => {
    const result = runFeishuDocWriteMock(SAMPLE_INPUT, { mockDir: tempRoot })
    expect(result.mocked).toBe(true)
    expect(result.docId).toMatch(/^mock-doc-/)
    expect(result.absPath.startsWith(tempRoot)).toBe(true)
    expect(result.url).toContain('feishu')
  })

  it('does not call any external network', () => {
    const result = runFeishuDocWriteMock(SAMPLE_INPUT, { mockDir: tempRoot })
    expect(result.network).toBe('mocked')
  })
})
