import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { dbCreateSession, dbDeleteSession, dbInsertSessionSavedArtifact, dbListSessionSavedArtifacts } from './db'

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KEVIN_NODE_ROOT
})

describe('session_saved_artifacts', () => {
  it('lists all saved rows for a session newest first', () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-saved-art-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root

    const libraryId = randomUUID()
    const spaceId = randomUUID()
    const sessionId = randomUUID()
    dbCreateSession(libraryId, spaceId, sessionId, 'S')

    const t1 = '2026-05-10T10:00:00.000Z'
    const t2 = '2026-05-10T11:00:00.000Z'
    dbInsertSessionSavedArtifact(libraryId, {
      id: randomUUID(),
      session_id: sessionId,
      library_relative_path: 'a/first.md',
      summary: 'First',
      created_at: t1,
    })
    dbInsertSessionSavedArtifact(libraryId, {
      id: randomUUID(),
      session_id: sessionId,
      library_relative_path: 'b/second.md',
      summary: 'Second',
      created_at: t2,
    })

    const rows = dbListSessionSavedArtifacts(libraryId, sessionId)
    expect(rows.length).toBe(2)
    expect(rows[0]!.summary).toBe('Second')
    expect(rows[1]!.summary).toBe('First')

    dbDeleteSession(libraryId, spaceId, sessionId)
    expect(dbListSessionSavedArtifacts(libraryId, sessionId).length).toBe(0)
  })
})
