import { describe, it, expect } from 'bun:test'
import { runExternalProjectionTask } from './ExternalProjectionTask.js'
import { createMockManager } from './_testUtils/mockTaskManager.js'

describe('ExternalProjectionTask', () => {
  it('happy path — returns approved ExternalProjectionResult', async () => {
    const { manager, taskId } = createMockManager('external_projection', {
      spaceId: 'sp-1',
      artifactId: 'art-1',
      targetConnectorId: 'feishu',
      targetDocTitle: 'Test Doc',
    })

    const result = await runExternalProjectionTask(
      {
        taskId,
        spaceId: 'sp-1',
        artifactId: 'art-1',
        targetConnectorId: 'feishu',
        targetDocTitle: 'Test Doc',
      },
      manager,
    )

    expect(result.status).toBe('approved')
    expect(typeof result.actionRequestId).toBe('string')
    expect(result.actionRequestId.length).toBeGreaterThan(0)
    expect(result.externalUrl).toMatch(/feishu\.cn/)
  }, 5_000)

  it('result is JSON serializable (format degradation safety)', async () => {
    const { manager, taskId } = createMockManager('external_projection', {
      spaceId: 'sp-2',
      artifactId: 'art-2',
      targetConnectorId: 'feishu',
      targetDocTitle: 'Doc',
    })

    const result = await runExternalProjectionTask(
      { taskId, spaceId: 'sp-2', artifactId: 'art-2', targetConnectorId: 'feishu', targetDocTitle: 'Doc' },
      manager,
    )

    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow()
  }, 5_000)
})
