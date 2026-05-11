import { describe, expect, it } from 'vitest'
import { visibleAssistantFromMessage } from './assistantMessageVisibleText'

describe('visibleAssistantFromMessage', () => {
  it('clears placeholder-only content', () => {
    expect(visibleAssistantFromMessage('\n\n__ARTIFACT_PLACEHOLDER__', false)).toBe('')
  })

  it('keeps narration outside artifact tags', () => {
    const raw = 'Here you go.\n\n<artifact>\n# Hi\n</artifact>'
    expect(visibleAssistantFromMessage(raw, false)).toBe('Here you go.')
  })

  it('drops incomplete artifact tag while streaming', () => {
    const raw = 'Intro\n<artifact>\n# partial'
    expect(visibleAssistantFromMessage(raw, true)).toBe('Intro')
  })
})
