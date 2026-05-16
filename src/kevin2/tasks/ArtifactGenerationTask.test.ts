import { describe, it, expect } from 'bun:test'
import { runArtifactGenerationTask } from './ArtifactGenerationTask.js'
import { createMockManager } from './_testUtils/mockTaskManager.js'

describe('ArtifactGenerationTask', () => {
  it('happy path — prd returns GeneratedArtifact with correct block types', async () => {
    const { manager, taskId } = createMockManager('artifact_generation', {
      spaceId: 'sp-1',
      artifactType: 'prd',
      title: 'Test PRD',
      materialIds: ['m1', 'm2'],
    })

    const result = await runArtifactGenerationTask(
      { taskId, spaceId: 'sp-1', artifactType: 'prd', title: 'Test PRD', materialIds: ['m1', 'm2'] },
      manager,
    )

    expect(result.artifactType).toBe('prd')
    expect(result.title).toBe('Test PRD')
    expect(result.spaceId).toBe('sp-1')
    expect(Array.isArray(result.blocks)).toBe(true)
    expect(result.blocks.length).toBeGreaterThan(0)

    const blockTypes = result.blocks.map((b) => b.blockType)
    expect(blockTypes).toContain('problem')
    expect(blockTypes).toContain('goals')
    expect(blockTypes).toContain('features')
  }, 10_000)

  it('happy path — weekly_ops_review produces expected block set', async () => {
    const { manager, taskId } = createMockManager('artifact_generation', {
      spaceId: 'sp-2',
      artifactType: 'weekly_ops_review',
      title: 'Q2 Review',
      materialIds: [],
    })

    const result = await runArtifactGenerationTask(
      { taskId, spaceId: 'sp-2', artifactType: 'weekly_ops_review', title: 'Q2 Review', materialIds: [] },
      manager,
    )

    const blockTypes = result.blocks.map((b) => b.blockType)
    expect(blockTypes).toContain('metric_snapshot')
    expect(blockTypes).toContain('action_plan')
  }, 10_000)

  it('all blocks have reviewState pending on creation', async () => {
    const { manager, taskId } = createMockManager('artifact_generation', {
      spaceId: 'sp-3',
      artifactType: 'prd',
      title: 'T',
      materialIds: [],
    })

    const result = await runArtifactGenerationTask(
      { taskId, spaceId: 'sp-3', artifactType: 'prd', title: 'T', materialIds: [] },
      manager,
    )

    for (const block of result.blocks) {
      expect(block.reviewState).toBe('pending')
    }
  }, 10_000)
})
