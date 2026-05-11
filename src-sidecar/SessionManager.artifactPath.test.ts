import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
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

function scope(mountPath: string): SessionScope {
  return { spaceId: randomUUID(), libraryId: randomUUID(), mountPath }
}

describe('SessionManager artifact default path', () => {
  it('writes artifact to selected directory under current library mount', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-art-dir-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root
    const mount = join(root, 'library')
    const manager = new SessionManager(createFakeRuntime() as never)
    const s = scope(mount)
    const session = await manager.create(s)

    manager.saveArtifact(s, session.id, '# artifact', 'reports/daily')
    const files = readdirSync(join(mount, 'reports/daily')).filter((n) => n.endsWith('.md'))
    expect(files.length).toBe(1)
    expect(files[0]).toMatch(/^artifact\.md$/i)
    const body = readFileSync(join(mount, 'reports/daily', files[0]), 'utf-8')
    expect(body).toContain('# artifact')
  })

  it('falls back to library root when no directory is selected', async () => {
    const root = mkdtempSync(join(tmpdir(), 'kyberkit-art-root-'))
    tempRoots.push(root)
    process.env.KEVIN_NODE_ROOT = root
    const mount = join(root, 'library')
    const manager = new SessionManager(createFakeRuntime() as never)
    const s = scope(mount)
    const session = await manager.create(s)

    manager.saveArtifact(s, session.id, 'root artifact', '')
    const files = readdirSync(mount).filter((n) => n.endsWith('.md'))
    expect(files.length).toBe(1)
    expect(files[0]).toBe('root artifact.md')
    expect(existsSync(join(mount, files[0]))).toBe(true)
  })
})
