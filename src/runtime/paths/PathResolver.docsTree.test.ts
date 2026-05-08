import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listSpaceDocsTree } from './PathResolver'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KYBER_HOME
})

describe('listSpaceDocsTree', () => {
  it('returns a docs tree scoped to current space', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-docs-tree-'))
    tempRoots.push(root)
    process.env.KYBER_HOME = root

    const docsRoot = join(root, 'spaces', 'alpha', 'docs')
    mkdirSync(join(docsRoot, 'specs', 'uat'), { recursive: true })
    writeFileSync(join(docsRoot, 'README.md'), '# hello')
    writeFileSync(join(docsRoot, 'specs', 'task-lifecycle.md'), '# task')
    writeFileSync(join(docsRoot, 'specs', 'uat', 'report.md'), '# report')

    const tree = listSpaceDocsTree('alpha')
    expect(tree.length).toBeGreaterThan(0)

    const specs = tree.find((n) => n.kind === 'dir' && n.name === 'specs')
    expect(specs).toBeTruthy()
    expect(specs?.path).toBe('@/spaces/alpha/docs/specs')
    expect(specs?.children?.some((n) => n.name === 'task-lifecycle.md')).toBe(true)

    const readme = tree.find((n) => n.kind === 'file' && n.name === 'README.md')
    expect(readme?.path).toBe('@/spaces/alpha/docs/README.md')
  })
})
