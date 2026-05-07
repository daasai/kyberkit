import { describe, it, expect, beforeEach } from 'bun:test'
import { mkdirSync, writeFileSync, existsSync } from 'fs'
import { mkdtempSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureSpaceTier, ensureTierLayout, spaceSkillsDir, userSkillsDir } from '../src/runtime/paths/PathResolver.js'
import { copyUserSkillToSpace, promoteSpaceSkillToUser } from './skillTierOps.js'

describe('skillTierOps path safety', () => {
  beforeEach(() => {
    const home = mkdtempSync(join(tmpdir(), 'kyber-skills-'))
    process.env.KYBER_HOME = home
    ensureTierLayout('default')
    ensureSpaceTier('space-a')
  })

  it('rejects path traversal skill folder names', async () => {
    await expect(promoteSpaceSkillToUser('space-a', '../evil')).rejects.toThrow()
    await expect(copyUserSkillToSpace('/abs/path', 'space-a')).rejects.toThrow()
  })

  it('promotes and copies valid folders', async () => {
    const sourceSpace = join(spaceSkillsDir('space-a'), 'daily-brief')
    mkdirSync(sourceSpace, { recursive: true })
    writeFileSync(join(sourceSpace, 'SKILL.md'), '---\nname: daily-brief\n---\nBody\n', 'utf-8')

    await promoteSpaceSkillToUser('space-a', 'daily-brief')
    expect(existsSync(join(userSkillsDir('default'), 'daily-brief'))).toBe(true)
    expect(existsSync(sourceSpace)).toBe(false)

    await copyUserSkillToSpace('daily-brief', 'space-a')
    expect(existsSync(join(spaceSkillsDir('space-a'), 'daily-brief'))).toBe(true)
  })
})
