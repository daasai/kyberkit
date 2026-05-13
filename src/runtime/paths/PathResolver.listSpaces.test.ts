import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  listRegistrySpaces,
  removeSpaceLibraryBinding,
  updateSpaceLibraryDisplayName,
  upsertSpaceLibraryBinding,
} from './PathResolver'

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

  it('updateSpaceLibraryDisplayName changes label source', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-spaces-rename-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')

    const sid = '58eb8f53-f5d3-4cd4-ad17-2d72622f22b5'
    const lid = 'f3e0b0f4-a340-4fa8-ab56-913fda726ba8'
    upsertSpaceLibraryBinding({
      spaceId: sid,
      libraryId: lid,
      mountPath: join(root, 'vault-a'),
      displayName: 'old',
    })
    expect(updateSpaceLibraryDisplayName(sid, '  new name  ')?.displayName).toBe('new name')
    expect(listRegistrySpaces()[0].label).toBe('new name')
  })

  it('removeSpaceLibraryBinding removes row', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-spaces-remove-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')

    const sid = '58eb8f53-f5d3-4cd4-ad17-2d72622f22b5'
    upsertSpaceLibraryBinding({
      spaceId: sid,
      libraryId: 'f3e0b0f4-a340-4fa8-ab56-913fda726ba8',
      mountPath: join(root, 'vault-a'),
      displayName: 'x',
    })
    expect(removeSpaceLibraryBinding(sid)?.spaceId).toBe(sid)
    expect(listRegistrySpaces()).toEqual([])
  })
})
