import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { dbCreateSession, dbDeleteSession, dbGetSession, dbListSessions } from './db'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KEVIN_NODE_ROOT
})

describe('db session scope isolation', () => {
  it('isolates sessions by space within one library db', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-db-scope-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root

    const libraryId = randomUUID()
    const spaceA = randomUUID()
    const spaceB = randomUUID()

    const a = dbCreateSession(libraryId, spaceA, randomUUID(), 'A session')
    const b = dbCreateSession(libraryId, spaceB, randomUUID(), 'B session')

    const listA = dbListSessions(libraryId, spaceA)
    const listB = dbListSessions(libraryId, spaceB)
    expect(listA.some((x) => x.id === a.id)).toBe(true)
    expect(listA.some((x) => x.id === b.id)).toBe(false)
    expect(listB.some((x) => x.id === b.id)).toBe(true)
    expect(listB.some((x) => x.id === a.id)).toBe(false)
  })

  it('rejects cross-space get/delete on same library', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-db-cross-space-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root

    const libraryId = randomUUID()
    const ownerSpace = randomUUID()
    const otherSpace = randomUUID()
    const row = dbCreateSession(libraryId, ownerSpace, randomUUID(), 'Owned')

    expect(dbGetSession(libraryId, otherSpace, row.id)).toBeNull()
    dbDeleteSession(libraryId, otherSpace, row.id)
    expect(dbGetSession(libraryId, ownerSpace, row.id)).not.toBeNull()

    dbDeleteSession(libraryId, ownerSpace, row.id)
    expect(dbGetSession(libraryId, ownerSpace, row.id)).toBeNull()
  })
})
