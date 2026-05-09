import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { filterSkillsByQuery, useSkillDirectory, type SkillDirectoryEntry } from './useSkillDirectory'

const SAMPLE: SkillDirectoryEntry[] = [
  { name: 'standup-brief', description: 'Daily standup brief', scope: 'space', risk: 'low', allowedTools: [], triggers: ['manual'] },
  { name: 'pdf-to-markdown', description: 'Convert PDF to Markdown', scope: 'global', risk: 'low', allowedTools: [], triggers: ['manual'] },
  { name: 'feishu-write', description: 'Write Feishu doc', scope: 'space', risk: 'medium', allowedTools: ['artifact.feishu-doc.write'], triggers: ['manual'] },
]

describe('useSkillDirectory', () => {
  beforeEach(() => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.includes('/skills')) {
        return new Response(JSON.stringify(SAMPLE), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('Not Found', { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the L1 directory when given a spaceId', async () => {
    const { result } = renderHook(() => useSkillDirectory('11111111-1111-4111-8111-111111111111'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.skills).toHaveLength(3)
    expect(result.current.skills.map((s) => s.name)).toContain('standup-brief')
    expect(result.current.error).toBeNull()
  })

  it('returns empty list when spaceId is null', async () => {
    const { result } = renderHook(() => useSkillDirectory(null))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.skills).toHaveLength(0)
  })
})

describe('filterSkillsByQuery', () => {
  it('returns full list for empty query', () => {
    expect(filterSkillsByQuery(SAMPLE, '')).toHaveLength(3)
  })

  it('matches by name fragment', () => {
    const out = filterSkillsByQuery(SAMPLE, 'pdf')
    expect(out).toHaveLength(1)
    expect(out[0].name).toBe('pdf-to-markdown')
  })

  it('matches by description fragment', () => {
    const out = filterSkillsByQuery(SAMPLE, 'feishu')
    expect(out.map((s) => s.name)).toEqual(['feishu-write'])
  })

  it('is case insensitive', () => {
    const out = filterSkillsByQuery(SAMPLE, 'STANDUP')
    expect(out[0].name).toBe('standup-brief')
  })
})
