import { describe, it, expect } from 'bun:test'
import { Kevin2TaskProfileRegistry } from './TaskProfileRegistry.js'
import type { Kevin2TaskType } from '../types/kevin2-models.js'

describe('Kevin2TaskProfileRegistry', () => {
  const registry = new Kevin2TaskProfileRegistry()

  it('has profile for first_encounter', () => {
    const profile = registry.get('first_encounter')
    expect(profile.totalStages).toBe(5)
    expect(profile.stageNames).toHaveLength(5)
  })

  it('has profile for artifact_generation', () => {
    const profile = registry.get('artifact_generation')
    expect(profile.stageNames).toContain('generate_blocks')
    expect(profile.stageNames).toContain('ground_evidence')
  })

  it('has profile for review_diff', () => {
    const profile = registry.get('review_diff')
    expect(profile.stageNames).toContain('generate_suggestions')
    expect(profile.stageNames).toContain('record_decisions')
  })

  it('has profile for external_projection', () => {
    const profile = registry.get('external_projection')
    expect(profile.stageNames).toContain('waiting_signoff')
  })

  it('throws for unknown task type', () => {
    expect(() => registry.get('unknown' as Kevin2TaskType)).toThrow()
  })

  it('system prompt template is callable', () => {
    const profile = registry.get('first_encounter')
    const prompt = profile.systemPromptTemplate({ directoryPath: '/tmp/test' })
    expect(prompt.length).toBeGreaterThan(20)
  })
})
