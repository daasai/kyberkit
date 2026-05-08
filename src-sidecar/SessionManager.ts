/**
 * SessionManager — manages multiple AgentSession instances with SQLite persistence.
 *
 * Responsibilities:
 *  - Create new sessions (runtime + DB record)
 *  - Route messages to the correct session
 *  - Persist session metadata + artifact content to SQLite
 *  - Restore session list from DB on startup; chat turns persist in SQLite
 *    and are replayed into a fresh AgentSession when the runtime map misses.
 */

import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import type { KyberRuntime } from '../src/runtime/KyberRuntime.js'
import type { AgentSession } from '../src/runtime/AgentSession.js'
import { libraryTechRoot } from '../src/runtime/paths/PathResolver.js'
import type { AgentExecutionContext } from '../src/runtime/AgentExecutionContext.js'
import {
  dbCreateSession,
  dbDeleteSession,
  dbGetArtifact,
  dbGetSession,
  dbListChatMessages,
  dbListSessions,
  dbUpdateSessionTitle,
  dbUpsertArtifact,
  type SessionRow,
} from './db.js'

export interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  artifactPreview?: string
}

export interface SessionScope {
  spaceId: string
  libraryId: string
  /** Absolute Library mount path from registry. */
  mountPath: string
}

export interface SavedArtifactFile {
  absPath: string
  relativePath: string
  fileName: string
}

function toSafeRelativeDir(raw: string | null | undefined): string {
  const normalized = (raw ?? '').trim().replaceAll('\\', '/').replace(/^\/+/, '')
  if (!normalized || normalized === '.') return ''
  if (normalized.includes('..')) return ''
  return normalized
}

function executionContextForScope(scope: SessionScope, sessionId: string): AgentExecutionContext {
  const absMount = resolve(scope.mountPath)
  const absTech = resolve(libraryTechRoot(scope.libraryId))
  return {
    spaceId: scope.spaceId,
    libraryId: scope.libraryId,
    libraryMountPath: absMount,
    libraryTechRoot: absTech,
    cwd: absMount,
    allowedRoots: [absMount, absTech],
    // RS-10 deferred: MCP filesystem root remains process-global for now.
    mcpRoots: [],
    sessionId,
  }
}

function rowToMeta(row: SessionRow, artifactPreview?: string): SessionMeta {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    artifactPreview,
  }
}

export class SessionManager {
  private runtimeSessions = new Map<string, AgentSession>()
  /** Prevent concurrent sends to the same session from corrupting agent state. */
  private sendLocks = new Map<string, boolean>()

  constructor(private runtime: KyberRuntime) {}

  /** Replay persisted chat into agent memory (cold start / new runtime). */
  private replayChatIntoAgent(session: AgentSession, scope: SessionScope, sessionId: string): void {
    for (const row of dbListChatMessages(scope.libraryId, sessionId)) {
      if (row.role === 'user') session.agent.addMessage('user', row.content)
      else session.agent.addMessage('assistant', row.content)
    }
  }

  /** Create a brand-new session (runtime + DB). */
  async create(scope: SessionScope): Promise<SessionMeta> {
    const id = randomUUID()
    const row = dbCreateSession(scope.libraryId, scope.spaceId, id, 'New Session')
    const session = await this.runtime.createSession({
      reliability: 'inmemory',
      agentId: id,
      agentExecution: executionContextForScope(scope, id),
    })
    this.runtimeSessions.set(id, session)
    return rowToMeta(row)
  }

  /** Get the runtime AgentSession for a given id (creates runtime session if missing or broken). */
  async getSession(scope: SessionScope, id: string): Promise<AgentSession | null> {
    const row = dbGetSession(scope.libraryId, scope.spaceId, id)
    if (!row) return null

    const existing = this.runtimeSessions.get(id)
    if (existing) {
      // If agent landed in a terminal-error state (failed/killed), it cannot recover via
      // the default send() reset — spin up a fresh runtime session for this conversation ID.
      const status: string = existing.agent.status
      if (status === 'failed' || status === 'killed') {
        console.log(`[SessionManager] Session ${id.slice(0, 8)} agent is ${status}, recreating runtime session.`)
        try { await existing.close() } catch { /* ignore */ }
        this.runtimeSessions.delete(id)
      } else {
        return existing
      }
    }

    const session = await this.runtime.createSession({
      reliability: 'inmemory',
      agentId: id,
      agentExecution: executionContextForScope(scope, id),
    })
    this.runtimeSessions.set(id, session)
    this.replayChatIntoAgent(session, scope, id)
    return session
  }

  /** List all sessions with artifact previews. */
  list(scope: SessionScope): SessionMeta[] {
    return dbListSessions(scope.libraryId, scope.spaceId).map((row) => {
      const artifact = dbGetArtifact(scope.libraryId, row.id)
      return rowToMeta(row, artifact.slice(0, 120) || undefined)
    })
  }

  /** Get the full artifact content for a session. */
  getArtifact(scope: SessionScope, sessionId: string): string {
    return dbGetArtifact(scope.libraryId, sessionId)
  }

  /** Save/update artifact content after generation completes and persist a markdown file under Library mount. */
  saveArtifact(
    scope: SessionScope,
    sessionId: string,
    content: string,
    preferredRelativeDir?: string | null,
  ): SavedArtifactFile | null {
    dbUpsertArtifact(scope.libraryId, sessionId, content)
    const relDir = toSafeRelativeDir(preferredRelativeDir)
    const baseDir = resolve(scope.mountPath)
    const targetDir = relDir ? resolve(baseDir, relDir) : baseDir
    if (!targetDir.startsWith(baseDir)) return null
    mkdirSync(targetDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const fileName = `artifact-${sessionId.slice(0, 8)}-${stamp}.md`
    const file = join(targetDir, fileName)
    writeFileSync(file, content, 'utf-8')
    const relativePath = relDir ? `${relDir}/${fileName}` : fileName
    return { absPath: file, relativePath, fileName }
  }

  /** Returns true if this session is currently streaming a response. */
  isBusy(sessionId: string): boolean {
    return this.sendLocks.get(sessionId) === true
  }

  lockSession(sessionId: string): void {
    this.sendLocks.set(sessionId, true)
  }

  unlockSession(sessionId: string): void {
    this.sendLocks.delete(sessionId)
  }

  /** Auto-title a session from the first user message. */
  autoTitle(scope: SessionScope, sessionId: string, firstMessage: string): void {
    const title = firstMessage.slice(0, 30).trim() || 'New Session'
    dbUpdateSessionTitle(scope.libraryId, scope.spaceId, sessionId, title)
  }

  /** Delete session (DB + runtime). */
  async delete(scope: SessionScope, sessionId: string): Promise<boolean> {
    const row = dbGetSession(scope.libraryId, scope.spaceId, sessionId)
    if (!row) return false
    const session = this.runtimeSessions.get(sessionId)
    if (session) {
      try { await session.close() } catch { /* ignore */ }
      this.runtimeSessions.delete(sessionId)
    }
    dbDeleteSession(scope.libraryId, scope.spaceId, sessionId)
    return true
  }
}
