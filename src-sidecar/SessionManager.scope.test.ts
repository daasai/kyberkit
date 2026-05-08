import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { SessionManager, type SessionScope } from './SessionManager'

type FakeAgentSession = {
  agent: {
    status: string
    addMessage: (role: 'user' | 'assistant', content: string) => void
  }
  close: () => Promise<void>
}

type FakeRuntime = {
  createSession: () => Promise<FakeAgentSession>
}

const tempRoots: string[] = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
  delete process.env.KEVIN_NODE_ROOT
})

function scope(root: string, spaceId: string, libraryId: string): SessionScope {
  return { spaceId, libraryId, mountPath: join(root, 'library-mount') }
}

function createFakeRuntime(): FakeRuntime {
  return {
    async createSession() {
      return {
        agent: {
          status: 'idle',
          addMessage() {
            // no-op
          },
        },
        async close() {
          // no-op
        },
      }
    },
  }
}

describe('SessionManager scope isolation', () => {
  it('does not resolve session from another space in same library', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-sm-scope-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root

    const runtime = createFakeRuntime()
    const manager = new SessionManager(runtime as never)
    const libraryId = randomUUID()
    const ownerSpace = randomUUID()
    const otherSpace = randomUUID()

    const created = await manager.create(scope(root, ownerSpace, libraryId))

    const ownerSession = await manager.getSession(scope(root, ownerSpace, libraryId), created.id)
    const otherSession = await manager.getSession(scope(root, otherSpace, libraryId), created.id)

    expect(ownerSession).not.toBeNull()
    expect(otherSession).toBeNull()
  })

  it('returns false when deleting session from wrong space', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-sm-delete-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root

    const runtime = createFakeRuntime()
    const manager = new SessionManager(runtime as never)
    const libraryId = randomUUID()
    const ownerSpace = randomUUID()
    const otherSpace = randomUUID()

    const created = await manager.create(scope(root, ownerSpace, libraryId))

    const deletedFromWrongScope = await manager.delete(scope(root, otherSpace, libraryId), created.id)
    const stillExists = await manager.getSession(scope(root, ownerSpace, libraryId), created.id)

    expect(deletedFromWrongScope).toBe(false)
    expect(stillExists).not.toBeNull()
  })
})
