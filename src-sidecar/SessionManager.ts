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
import type { KyberRuntime } from '../src/runtime/KyberRuntime.js'
import type { AgentSession } from '../src/runtime/AgentSession.js'
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
  private replayChatIntoAgent(session: AgentSession, sessionId: string): void {
    for (const row of dbListChatMessages(sessionId)) {
      if (row.role === 'user') session.agent.addMessage('user', row.content)
      else session.agent.addMessage('assistant', row.content)
    }
  }

  /** Create a brand-new session (runtime + DB). */
  async create(): Promise<SessionMeta> {
    const id = randomUUID()
    const row = dbCreateSession(id, 'New Session')
    const session = await this.runtime.createSession({ reliability: 'inmemory', agentId: id })
    this.runtimeSessions.set(id, session)
    return rowToMeta(row)
  }

  /** Get the runtime AgentSession for a given id (creates runtime session if missing or broken). */
  async getSession(id: string): Promise<AgentSession | null> {
    const row = dbGetSession(id)
    if (!row) return null

    const existing = this.runtimeSessions.get(id)
    if (existing) {
      // If agent landed in a terminal-error state (failed/killed), it cannot recover via
      // the default send() reset — spin up a fresh runtime session for this conversation ID.
      const status: string = existing.agent.status
      if (status === 'failed' || status === 'killed') {
        console.log(`[SessionManager] Session ${id.slice(0, 8)} agent is ${status}, recreating runtime session.`)
        try { await (existing as any).close?.() } catch { /* ignore */ }
        this.runtimeSessions.delete(id)
      } else {
        return existing
      }
    }

    const session = await this.runtime.createSession({ reliability: 'inmemory', agentId: id })
    this.runtimeSessions.set(id, session)
    this.replayChatIntoAgent(session, id)
    return session
  }

  /** List all sessions with artifact previews. */
  list(): SessionMeta[] {
    return dbListSessions().map((row) => {
      const artifact = dbGetArtifact(row.id)
      return rowToMeta(row, artifact.slice(0, 120) || undefined)
    })
  }

  /** Get the full artifact content for a session. */
  getArtifact(sessionId: string): string {
    return dbGetArtifact(sessionId)
  }

  /** Save/update artifact content after generation completes. */
  saveArtifact(sessionId: string, content: string): void {
    dbUpsertArtifact(sessionId, content)
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
  autoTitle(sessionId: string, firstMessage: string): void {
    const title = firstMessage.slice(0, 30).trim() || 'New Session'
    dbUpdateSessionTitle(sessionId, title)
  }

  /** Delete session (DB + runtime). */
  async delete(sessionId: string): Promise<void> {
    const session = this.runtimeSessions.get(sessionId)
    if (session) {
      try { await session.close() } catch { /* ignore */ }
      this.runtimeSessions.delete(sessionId)
    }
    dbDeleteSession(sessionId)
  }
}
