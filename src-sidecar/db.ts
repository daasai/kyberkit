/**
 * SQLite database for Kevin Sidecar — sessions + artifacts + chat messages.
 * Uses bun:sqlite (built-in, zero deps).
 */

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { libraryTechRoot, readSpaceLibraryRegistry } from '../src/runtime/paths/PathResolver.js'

export interface SessionRow {
  id: string
  space_id: string
  library_id: string
  title: string
  created_at: string
  updated_at: string
}

export interface ArtifactRow {
  session_id: string
  content: string
  updated_at: string
}

export interface ChatMessageRow {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

function resolveDbPath(libraryId: string): string {
  const dir = libraryTechRoot(libraryId)
  mkdirSync(dir, { recursive: true })
  return join(dir, 'sessions.db')
}

const dbByLibraryId = new Map<string, Database>()

/** Total session rows across all Library DBs (for health metrics). */
export function dbCountAllSessions(): number {
  let n = 0
  for (const row of readSpaceLibraryRegistry()) {
    try {
      const r = getDb(row.libraryId)
        .query('SELECT COUNT(*) as c FROM sessions')
        .get() as { c: number }
      n += r.c
    } catch {
      /* skip */
    }
  }
  return n
}

export function getDb(libraryId: string): Database {
  const key = libraryId.trim()
  const existing = dbByLibraryId.get(key)
  if (existing) return existing
  const dbPath = resolveDbPath(key)
  const db = new Database(dbPath, { create: true })
  db.run('PRAGMA journal_mode = WAL')
  db.run('PRAGMA foreign_keys = ON')
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      space_id    TEXT NOT NULL,
      library_id  TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT 'New Session',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS artifacts (
      session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content     TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id, updated_at DESC, id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at, id)`)
  console.log(`[DB] Connected: ${dbPath}`)
  dbByLibraryId.set(key, db)
  return db
}

export function dbListSessions(libraryId: string, spaceId: string): SessionRow[] {
  return getDb(libraryId)
    .query('SELECT * FROM sessions WHERE space_id = ? ORDER BY updated_at DESC')
    .all(spaceId) as SessionRow[]
}

export function dbGetSession(libraryId: string, spaceId: string, id: string): SessionRow | null {
  return getDb(libraryId)
    .query('SELECT * FROM sessions WHERE id = ? AND space_id = ?')
    .get(id, spaceId) as SessionRow | null
}

export function dbCreateSession(
  libraryId: string,
  spaceId: string,
  id: string,
  title: string,
): SessionRow {
  const now = new Date().toISOString()
  getDb(libraryId).run(
    'INSERT INTO sessions (id, space_id, library_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, spaceId, libraryId, title, now, now],
  )
  return { id, space_id: spaceId, library_id: libraryId, title, created_at: now, updated_at: now }
}

export function dbUpdateSessionTitle(libraryId: string, spaceId: string, id: string, title: string): void {
  const now = new Date().toISOString()
  getDb(libraryId).run(
    'UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND space_id = ?',
    [title, now, id, spaceId],
  )
}

export function dbDeleteSession(libraryId: string, spaceId: string, id: string): void {
  getDb(libraryId).run('DELETE FROM sessions WHERE id = ? AND space_id = ?', [id, spaceId])
}

export function dbGetArtifact(libraryId: string, sessionId: string): string {
  const row = getDb(libraryId)
    .query('SELECT content FROM artifacts WHERE session_id = ?')
    .get(sessionId) as { content: string } | null
  return row?.content ?? ''
}

export function dbUpsertArtifact(libraryId: string, sessionId: string, content: string): void {
  const now = new Date().toISOString()
  getDb(libraryId).run(
    `INSERT INTO artifacts (session_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [sessionId, content, now],
  )
  getDb(libraryId).run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId])
}

/** Ordered chat history for UI + agent replay (capped). */
export function dbListChatMessages(libraryId: string, sessionId: string): ChatMessageRow[] {
  return getDb(libraryId)
    .query(
      `SELECT id, session_id, role, content, created_at FROM messages
       WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 500`,
    )
    .all(sessionId) as ChatMessageRow[]
}

/** Persist one user + one assistant turn after streaming completes. */
export function dbPersistChatTurn(
  libraryId: string,
  sessionId: string,
  userContent: string,
  assistantContent: string,
): void {
  const db = getDb(libraryId)
  const now = new Date().toISOString()
  const uid = randomUUID()
  const aid = randomUUID()
  db.run('BEGIN')
  try {
    db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
      [uid, sessionId, userContent, now],
    )
    db.run(
      `INSERT INTO messages (id, session_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`,
      [aid, sessionId, assistantContent, now],
    )
    db.run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId])
    db.run('COMMIT')
  } catch (e) {
    db.run('ROLLBACK')
    throw e
  }
}
