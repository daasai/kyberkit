import { describe, expect, it } from 'bun:test'
import { classifyForgeDistillError, parseForgeDistillJson } from './forgeDistillLlm.js'

describe('parseForgeDistillJson', () => {
  it('parses raw JSON object', () => {
    const raw = JSON.stringify({
      suggestedName: 'doc-search-compile',
      suggestedDescription: 'When the user asks to search the library and compile findings.',
      bodyMarkdown: '## When to use\n\n...\n\n## Steps\n\n1. One\n',
    })
    const p = parseForgeDistillJson(raw)
    expect(p?.suggestedName).toBe('doc-search-compile')
    expect(p?.suggestedDescription.length).toBeGreaterThan(10)
    expect(p?.bodyMarkdown).toContain('## Steps')
  })

  it('strips markdown fences', () => {
    const raw = '```json\n{"suggestedName":"a-b","suggestedDescription":"Desc here.","bodyMarkdown":"## X\\n"}\n```'
    const p = parseForgeDistillJson(raw)
    expect(p?.suggestedName).toBe('a-b')
  })

  it('extracts first object from noisy output', () => {
    const raw = 'Here you go:\n{"suggestedName":"x","suggestedDescription":"d","bodyMarkdown":"## S\\nok"}\ntrailing'
    const p = parseForgeDistillJson(raw)
    expect(p?.suggestedName).toBe('x')
  })

  it('returns null on invalid', () => {
    expect(parseForgeDistillJson('not json')).toBeNull()
    expect(parseForgeDistillJson('{"suggestedName":""}')).toBeNull()
  })
})

describe('classifyForgeDistillError', () => {
  it('maps Anthropic 401 / invalid key to auth_401', () => {
    expect(classifyForgeDistillError(new Error('401 {"type":"error","error":{"type":"authentication_error"}}'))).toBe(
      'auth_401',
    )
    expect(classifyForgeDistillError(new Error('invalid x-api-key'))).toBe('auth_401')
  })
})
