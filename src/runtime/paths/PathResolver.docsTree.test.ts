import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listSpaceDocsTree, upsertSpaceLibraryBinding } from './PathResolver'

const SID = '58eb8f53-f5d3-4cd4-ad17-2d72622f22b5'
const LID = 'f3e0b0f4-a340-4fa8-ab56-913fda726ba8'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KYBER_HOME
  delete process.env.KEVIN_NODE_ROOT
})

describe('listSpaceDocsTree', () => {
  it('lists tree under library mount when Space–Library is bound (Rev3)', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-docs-tree-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')

    const mount = join(root, 'vault')
    mkdirSync(join(mount, 'specs', 'uat'), { recursive: true })
    writeFileSync(join(mount, 'README.md'), '# hello')
    writeFileSync(join(mount, 'specs', 'task-lifecycle.md'), '# task')
    writeFileSync(join(mount, 'specs', 'uat', 'report.md'), '# report')

    upsertSpaceLibraryBinding({
      spaceId: SID,
      libraryId: LID,
      mountPath: mount,
      displayName: 'Test',
    })

    const tree = listSpaceDocsTree(SID)
    expect(tree.length).toBeGreaterThan(0)

    const specs = tree.find((n) => n.kind === 'dir' && n.name === 'specs')
    expect(specs).toBeTruthy()
    expect(specs?.path).toBe(`@/libraries/${LID}/specs`)
    expect(specs?.children?.some((n) => n.name === 'task-lifecycle.md')).toBe(true)

    const readme = tree.find((n) => n.kind === 'file' && n.name === 'README.md')
    expect(readme?.path).toBe(`@/libraries/${LID}/README.md`)
  })

  it('uses registry mount over legacy paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-docs-tree-registry-'))
    tempRoots.push(root)
    process.env.KYBER_HOME = join(root, 'legacy-home')
    process.env.KEVIN_NODE_ROOT = join(root, 'kevin')

    const mount = join(root, 'library-mount')
    mkdirSync(join(mount, 'plans'), { recursive: true })
    writeFileSync(join(mount, 'plans', 'todo.md'), '# todo')

    upsertSpaceLibraryBinding({
      spaceId: SID,
      libraryId: LID,
      mountPath: mount,
      displayName: 'My Library',
    })

    const tree = listSpaceDocsTree(SID)
    expect(tree.length).toBeGreaterThan(0)
    const plans = tree.find((n) => n.kind === 'dir' && n.name === 'plans')
    expect(plans?.path).toBe(`@/libraries/${LID}/plans`)
    expect(plans?.children?.some((n) => n.path === `@/libraries/${LID}/plans/todo.md`)).toBe(true)
  })
})
