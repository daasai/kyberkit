import { describe, it, expect } from 'bun:test'
import type { Kevin2Events } from './kevin2-events.js'

describe('Kevin2Events', () => {
  it('stage_started payload shape', () => {
    const e: Kevin2Events['kevin2.task.stage_started'] = {
      taskId: 't1',
      taskType: 'first_encounter',
      stageIndex: 0,
      stageName: 'scan',
      timestamp: 1,
    }
    expect(e.stageName).toBe('scan')
  })

  it('block_ready includes evidenceRefs', () => {
    const e: Kevin2Events['kevin2.artifact.block_ready'] = {
      taskId: 't1',
      artifactId: 'a1',
      blockIndex: 0,
      blockType: 'problem',
      content: 'x',
      evidenceRefs: [],
      timestamp: 1,
    }
    expect(e.content).toBe('x')
  })
})
