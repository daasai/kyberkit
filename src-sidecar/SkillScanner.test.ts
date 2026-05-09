import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  ensureSpaceTier,
  ensureTierLayout,
  globalSkillsDir,
  spaceSkillsDir,
  userSkillsDir,
} from '../src/runtime/paths/PathResolver.js'
import { loadSkillFull, scanSkillsForSpace } from './SkillScanner.js'

let tempHome: string

function writeSkill(rootDir: string, slug: string, frontmatter: string, body = 'Body\n'): void {
  const dir = join(rootDir, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n${body}`, 'utf-8')
}

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'kyber-skill-scanner-'))
  process.env.KYBER_HOME = tempHome
  ensureTierLayout('default')
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  delete process.env.KYBER_HOME
})

describe('SkillScanner — three-tier merge', () => {
  it('returns L1 entries from Global, User, and Space', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    writeSkill(globalSkillsDir(), 'pdf-to-md', 'name: pdf-to-md\ndescription: Convert PDF to Markdown')
    writeSkill(userSkillsDir('default'), 'my-style', 'name: my-style\ndescription: Personal writing style')
    writeSkill(spaceSkillsDir(spaceId), 'standup', 'name: standup\ndescription: Daily standup brief')

    const list = scanSkillsForSpace(spaceId, 'default')
    const names = list.map((s) => s.name).sort()
    expect(names).toEqual(['my-style', 'pdf-to-md', 'standup'])

    const standup = list.find((s) => s.name === 'standup')!
    expect(standup.scope).toBe('space')
    expect(standup.risk).toBe('low')
    expect(standup.description).toBe('Daily standup brief')
  })

  it('resolves same-name conflicts with Space > User > Global', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    writeSkill(globalSkillsDir(), 'brief', 'name: brief\ndescription: Global brief')
    writeSkill(userSkillsDir('default'), 'brief', 'name: brief\ndescription: User brief')
    writeSkill(spaceSkillsDir(spaceId), 'brief', 'name: brief\ndescription: Space brief')

    const list = scanSkillsForSpace(spaceId, 'default')
    const briefs = list.filter((s) => s.name === 'brief')
    expect(briefs).toHaveLength(1)
    expect(briefs[0].scope).toBe('space')
    expect(briefs[0].description).toBe('Space brief')
  })

  it('rejects skills with missing name or description', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    writeSkill(spaceSkillsDir(spaceId), 'good', 'name: good\ndescription: Good skill')
    writeSkill(spaceSkillsDir(spaceId), 'no-name', 'description: Has no name')
    writeSkill(spaceSkillsDir(spaceId), 'no-desc', 'name: no-desc')

    const list = scanSkillsForSpace(spaceId, 'default')
    const names = list.map((s) => s.name).sort()
    expect(names).toEqual(['good'])
  })

  it('respects kevin.risk and allowed-tools defaults', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)

    writeSkill(
      spaceSkillsDir(spaceId),
      'feishu-write',
      'name: feishu-write\ndescription: Write Feishu doc\nallowed-tools:\n  - artifact.feishu-doc.write\nkevin:\n  risk: medium',
    )

    const list = scanSkillsForSpace(spaceId, 'default')
    const skill = list.find((s) => s.name === 'feishu-write')!
    expect(skill.risk).toBe('medium')
    expect(skill.allowedTools).toEqual(['artifact.feishu-doc.write'])
  })
})

describe('SkillScanner — L2 full load', () => {
  it('returns full markdown body and frontmatter for selected skill', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    writeSkill(
      spaceSkillsDir(spaceId),
      'standup',
      'name: standup\ndescription: Daily standup',
      '## Steps\n\n1. Pull yesterday data\n',
    )

    const full = loadSkillFull(spaceId, 'standup', 'default')
    expect(full).not.toBeNull()
    expect(full!.name).toBe('standup')
    expect(full!.scope).toBe('space')
    expect(full!.body).toContain('## Steps')
    expect(full!.body).toContain('Pull yesterday data')
    expect(full!.absPath).toContain('SKILL.md')
  })

  it('returns null for unknown skill', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    expect(loadSkillFull(spaceId, 'nonexistent', 'default')).toBeNull()
  })
})

describe('SkillScanner — L1 directory injection', () => {
  it('formats compact directory entry per skill (CC-style)', () => {
    const spaceId = randomUUID()
    ensureSpaceTier(spaceId)
    writeSkill(spaceSkillsDir(spaceId), 'standup', 'name: standup\ndescription: Daily brief')
    writeSkill(userSkillsDir('default'), 'pdf-to-md', 'name: pdf-to-md\ndescription: Convert PDF')

    const list = scanSkillsForSpace(spaceId, 'default')
    const directory = list.map((s) => `- ${s.name}: ${s.description}`).sort()
    expect(directory).toContain('- standup: Daily brief')
    expect(directory).toContain('- pdf-to-md: Convert PDF')
  })
})
