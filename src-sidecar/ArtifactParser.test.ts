import { describe, expect, it } from 'bun:test'
import { ArtifactParser } from './ArtifactParser.js'

describe('ArtifactParser', () => {
  it('parses a simple wrapped artifact', () => {
    const p = new ArtifactParser()
    expect(p.feed('Hi ')).toEqual([{ type: 'text_delta', text: 'Hi ' }])
    const mid = p.feed('<artifact># T\n')
    expect(mid).toEqual([
      { type: 'artifact_start' },
      { type: 'artifact_delta', text: '# T\n' },
    ])
    const end = p.feed('</artifact>done')
    expect(end).toEqual([
      { type: 'artifact_end' },
      { type: 'text_delta', text: 'done' },
    ])
  })

  it('strips nested <artifact...> inside body before closing (anti duplicate canvas)', () => {
    const p = new ArtifactParser()
    const all: SidecarTextEvent[] = []
    all.push(...p.feed('<artifact># Part4\n\nBody\n'))
    all.push(...p.feed('我已经完成。<artifact>\n# 能源产业研究报告\n执行摘要\n'))
    expect(all.some((e) => e.type === 'artifact_start')).toBe(true)
    expect(all.filter((e) => e.type === 'artifact_start').length).toBe(1)
    const joined = all
      .filter((e): e is { type: 'artifact_delta'; text: string } => e.type === 'artifact_delta')
      .map((e) => e.text)
      .join('')
    expect(joined).toContain('# Part4')
    expect(joined).toContain('我已经完成。')
    expect(joined).toContain('# 能源产业研究报告')
    expect(joined).not.toMatch(/<artifact/i)
    const close = p.feed('</artifact>')
    expect(close).toEqual([{ type: 'artifact_end' }])
  })

  it('handles attributed nested open tag', () => {
    const p = new ArtifactParser()
    p.feed('<artifact># A\n')
    const out = p.feed('x<artifact type="markdown">\n# B\n')
    const deltas = out.filter((e) => e.type === 'artifact_delta').map((e) => (e as { text: string }).text)
    expect(deltas.join('')).toBe('x# B\n')
  })
})
