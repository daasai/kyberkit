import { describe, it, expect } from 'bun:test'
import { runFirstEncounterTask } from './FirstEncounterTask.js'
import { createMockManager } from './_testUtils/mockTaskManager.js'

describe('FirstEncounterTask', () => {
  it('happy path — returns DirectoryCognition with expected shape', async () => {
    const { manager, taskId } = createMockManager('first_encounter', {
      spaceId: 'sp-test',
      directoryPath: '/tmp/kevin-test-project',
    })

    const result = await runFirstEncounterTask(
      { taskId, spaceId: 'sp-test', directoryPath: '/tmp/kevin-test-project' },
      manager,
    )

    expect(typeof result.projectType).toBe('string')
    expect(typeof result.projectSummary).toBe('string')
    expect(Array.isArray(result.keyFindings)).toBe(true)
    expect(Array.isArray(result.suggestions)).toBe(true)
    expect(Array.isArray(result.uncertainties)).toBe(true)
    expect(typeof result.scannedFiles).toBe('number')
    expect(result.scannedFiles).toBeGreaterThanOrEqual(0)
  })

  it('infers project type from directory path keywords', async () => {
    const { manager, taskId } = createMockManager('first_encounter', {
      spaceId: 'sp-2',
      directoryPath: '/home/user/kevin-prd-repo',
    })
    const result = await runFirstEncounterTask(
      { taskId, spaceId: 'sp-2', directoryPath: '/home/user/kevin-prd-repo' },
      manager,
    )
    expect(result.projectType).toContain('产品规范')
  })

  it('task status becomes completed after run', async () => {
    const { manager, taskId } = createMockManager('first_encounter', {
      spaceId: 'sp-3',
      directoryPath: '/tmp',
    })
    await runFirstEncounterTask({ taskId, spaceId: 'sp-3', directoryPath: '/tmp' }, manager)
    const status = manager.getStatus(taskId)
    expect(status?.status).toBe('completed')
  })
})
