import { describe, expect, it } from 'vitest'
import { qsSpace } from './sidecarUrl'

describe('qsSpace', () => {
  it('always includes space_id when space is present', () => {
    const sid = 'a0000000-0000-4000-8000-000000000001'
    expect(qsSpace(sid)).toBe(`?space_id=${sid}`)
    expect(qsSpace('b0000000-0000-4000-8000-000000000002')).toBe(
      '?space_id=b0000000-0000-4000-8000-000000000002',
    )
  })

  it('returns empty string when space id is empty', () => {
    expect(qsSpace('')).toBe('')
  })
})
