import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  ensureKevinLayout,
  ensureSpaceTier,
  libraryTechRoot,
  upsertSpaceLibraryBinding,
} from '../src/runtime/paths/PathResolver.js'
import { searchLibraryFiles } from './librarySearch'

let tempHome: string
let nodeRoot: string

beforeEach(() => {
  tempHome = mkdtempSync(join(tmpdir(), 'kyber-lib-search-'))
  nodeRoot = join(tempHome, 'node')
  process.env.KYBER_HOME = tempHome
  process.env.KEVIN_NODE_ROOT = nodeRoot
  mkdirSync(nodeRoot, { recursive: true })
  ensureKevinLayout()
})

afterEach(() => {
  rmSync(tempHome, { recursive: true, force: true })
  delete process.env.KYBER_HOME
  delete process.env.KEVIN_NODE_ROOT
})

describe('searchLibraryFiles', () => {
  it('matches file content (substring)', () => {
    const spaceId = randomUUID()
    const libraryId = randomUUID()
    ensureSpaceTier(spaceId)
    mkdirSync(libraryTechRoot(libraryId), { recursive: true })
    mkdirSync(join(tempHome, 'docs'), { recursive: true })
    writeFileSync(join(tempHome, 'docs', 'alpha.md'), '# Title\nquantum foam detail\n')
    upsertSpaceLibraryBinding({ spaceId, libraryId, mountPath: tempHome, displayName: 'Lib' })

    const hits = searchLibraryFiles({ spaceId, libraryId, mountPath: tempHome }, 'foam')
    expect(hits.some((h) => h.relLabel.endsWith('alpha.md'))).toBe(true)
    expect(hits.find((h) => h.relLabel.endsWith('alpha.md'))?.snippet.toLowerCase()).toContain('foam')
  })

  it('returns empty for short query', () => {
    const spaceId = randomUUID()
    const libraryId = randomUUID()
    expect(searchLibraryFiles({ spaceId, libraryId, mountPath: tempHome }, 'x')).toEqual([])
  })
})
