import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { ensureSpaceTier, ensureTierLayout, spaceSkillsDir } from '../src/runtime/paths/PathResolver.js'
import { acceptForgeDraft, suggestForgeDraft } from './SkillForge.js'

let tempHome: string

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'kyber-forge-'))
  process.env.KYBER_HOME = tempHome
  ensureTierLayout('default')
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  delete process.env.KYBER_HOME
})

describe('SkillForge — P0 trigger detection (suggestForgeDraft)', () => {
  it('detects explicit /save-as-skill slash command', () => {
    const draft = suggestForgeDraft({
      message: '/save-as-skill site-traffic-analysis',
      assistantSummary: 'Analyzed site traffic and produced a daily report.',
    })
    expect(draft).not.toBeNull()
    expect(draft!.suggestedName).toBe('site-traffic-analysis')
    expect(draft!.trigger).toBe('slash')
  })

  it('detects "以后都这样" Chinese explicit trigger', () => {
    const draft = suggestForgeDraft({
      message: '以后都这样做：把昨日数据汇总成简报',
      assistantSummary: 'Summarized yesterday data.',
    })
    expect(draft).not.toBeNull()
    expect(draft!.trigger).toBe('explicit')
    expect(draft!.suggestedName.length).toBeGreaterThan(0)
  })

  it('detects "save as skill" English explicit trigger', () => {
    const draft = suggestForgeDraft({
      message: 'Please save this as a skill called daily-brief',
      assistantSummary: 'Daily brief generated.',
    })
    expect(draft).not.toBeNull()
    expect(draft!.trigger).toBe('explicit')
    expect(draft!.suggestedName).toBe('daily-brief')
  })

  it('returns null when no trigger present', () => {
    expect(
      suggestForgeDraft({
        message: 'What is the status of yesterday tasks?',
        assistantSummary: 'Pulled tasks from board.',
      }),
    ).toBeNull()
  })

  it('slugifies a free-form name from /save-as-skill argument', () => {
    const draft = suggestForgeDraft({
      message: '/save-as-skill My Daily Brief 2026',
      assistantSummary: 'OK',
    })
    expect(draft).not.toBeNull()
    expect(draft!.suggestedName).toBe('my-daily-brief-2026')
  })
})

describe('SkillForge — acceptForgeDraft', () => {
  it('writes SKILL.md into Space tier with correct frontmatter', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    const written = acceptForgeDraft({
      spaceId,
      name: 'site-traffic-analysis',
      description: 'Analyze site traffic anomalies',
      bodyMarkdown: '## Steps\n\n1. Pull DW.\n2. Diff with last week.\n',
    })

    expect(written.absPath).toContain('site-traffic-analysis')
    expect(existsSync(written.absPath)).toBe(true)
    const raw = readFileSync(written.absPath, 'utf-8')
    expect(raw).toContain('name: site-traffic-analysis')
    expect(raw).toContain('description: Analyze site traffic anomalies')
    expect(raw).toContain('## Steps')
  })

  it('refuses to overwrite an existing skill folder', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    acceptForgeDraft({
      spaceId,
      name: 'pinned',
      description: 'First',
      bodyMarkdown: 'A',
    })
    expect(() =>
      acceptForgeDraft({
        spaceId,
        name: 'pinned',
        description: 'Second',
        bodyMarkdown: 'B',
      }),
    ).toThrow(/already exists/i)
  })

  it('rejects path-traversal slugs', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    expect(() =>
      acceptForgeDraft({
        spaceId,
        name: '../evil',
        description: 'X',
        bodyMarkdown: 'X',
      }),
    ).toThrow()
  })

  it('rejects invalid slug characters', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    expect(() =>
      acceptForgeDraft({
        spaceId,
        name: 'Bad Name!',
        description: 'X',
        bodyMarkdown: 'X',
      }),
    ).toThrow()
  })

  it('lands the new skill into the L1 directory immediately', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    acceptForgeDraft({
      spaceId,
      name: 'instant-skill',
      description: 'Loaded right away',
      bodyMarkdown: 'Body',
    })
    // Verify it's writable in the right tier directory.
    expect(existsSync(join(spaceSkillsDir(spaceId), 'instant-skill', 'SKILL.md'))).toBe(true)
  })
})
