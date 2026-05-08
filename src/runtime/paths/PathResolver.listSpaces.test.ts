import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listRegistrySpaces, upsertSpaceLibraryBinding } from './PathResolver'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KYBER_HOME
  delete process.env.KEVIN_NODE_ROOT
})

describe('listRegistrySpaces', () => {
  it('returns empty when no registry rows', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-spaces-empty-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')
    expect(listRegistrySpaces()).toEqual([])
  })

  it('returns id and label for each registry row', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-spaces-registry-'))
    tempRoots.push(root)
    process.env.KYBER_HOME = join(root, 'legacy-home')
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')

    upsertSpaceLibraryBinding({
      spaceId: '58eb8f53-f5d3-4cd4-ad17-2d72622f22b5',
      libraryId: 'f3e0b0f4-a340-4fa8-ab56-913fda726ba8',
      mountPath: join(root, 'vault-a'),
      displayName: 'vault-a',
    })

    const list = listRegistrySpaces()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('58eb8f53-f5d3-4cd4-ad17-2d72622f22b5')
    expect(list[0].label).toBe('vault-a')
  })
})
