import { describe, it, expect } from 'bun:test'
import { runReviewDiffTask } from './ReviewDiffTask.js'
import { createMockManager } from './_testUtils/mockTaskManager.js'

describe('ReviewDiffTask', () => {
  it('happy path — returns ReviewDiffResult with suggestions array', async () => {
    const { manager, taskId } = createMockManager('review_diff', {
      spaceId: 'sp-1',
      artifactId: 'art-abc',
    })

    const result = await runReviewDiffTask(
      { taskId, spaceId: 'sp-1', artifactId: 'art-abc' },
      manager,
    )

    expect(result.artifactId).toBe('art-abc')
    expect(Array.isArray(result.suggestions)).toBe(true)
    expect(typeof result.acceptedCount).toBe('number')
    expect(typeof result.rejectedCount).toBe('number')
    expect(result.acceptedCount).toBe(0)
  }, 5_000)

  it('each suggestion has required fields', async () => {
    const { manager, taskId } = createMockManager('review_diff', {
      spaceId: 'sp-2',
      artifactId: 'art-xyz',
    })

    const result = await runReviewDiffTask(
      { taskId, spaceId: 'sp-2', artifactId: 'art-xyz' },
      manager,
    )

    for (const s of result.suggestions) {
      expect(typeof s.id).toBe('string')
      expect(typeof s.blockId).toBe('string')
      expect(typeof s.original).toBe('string')
      expect(typeof s.suggestion).toBe('string')
      expect(['must_fix', 'suggestion']).toContain(s.type)
      expect(Array.isArray(s.evidenceRefs)).toBe(true)
    }
  }, 5_000)
})
