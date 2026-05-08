import { describe, expect, it } from 'bun:test'
import { listDiscoveredSpaces } from './PathResolver'

describe('listDiscoveredSpaces', () => {
  it('always includes default Space id', () => {
    const list = listDiscoveredSpaces()
    expect(list.some((s) => s.id === 'default')).toBe(true)
  })

  it('returns id and label for each entry', () => {
    const list = listDiscoveredSpaces()
    for (const row of list) {
      expect(typeof row.id).toBe('string')
      expect(row.id.length).toBeGreaterThan(0)
      expect(typeof row.label).toBe('string')
    }
  })
})
