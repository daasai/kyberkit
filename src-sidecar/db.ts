/**
 * SQLite database for Kevin Sidecar — sessions + artifacts + chat messages.
 * Uses bun:sqlite (built-in, zero deps).
 */

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export interface SessionRow {
  id: string
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

function resolveDbPath(): string {
  const spacesRoot = process.env.KYBER_SPACES_ROOT ?? join(process.cwd(), 'spaces')
  const userName = process.env.KYBER_USER_NAME ?? 'default'
  const dir = join(spacesRoot, userName, '.kyberkit')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'sessions.db')
}

let _db: Database | null = null

export function getDb(): Database {
  if (_db) return _db
  const dbPath = resolveDbPath()
  _db = new Database(dbPath, { create: true })
  _db.run('PRAGMA journal_mode = WAL')
  _db.run('PRAGMA foreign_keys = ON')
  _db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT 'New Session',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    )
  `)
  _db.run(`
    CREATE TABLE IF NOT EXISTS artifacts (
      session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    )
  `)
  _db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content     TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    )
  `)
  _db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at, id)`)
  console.log(`[DB] Connected: ${dbPath}`)
  return _db
}

export function dbListSessions(): SessionRow[] {
  return getDb().query('SELECT * FROM sessions ORDER BY updated_at DESC').all() as SessionRow[]
}

export function dbGetSession(id: string): SessionRow | null {
  return getDb().query('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | null
}

export function dbCreateSession(id: string, title: string): SessionRow {
  const now = new Date().toISOString()
  getDb().run(
    'INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, title, now, now],
  )
  return { id, title, created_at: now, updated_at: now }
}

export function dbUpdateSessionTitle(id: string, title: string): void {
  const now = new Date().toISOString()
  getDb().run('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?', [title, now, id])
}

export function dbDeleteSession(id: string): void {
  getDb().run('DELETE FROM sessions WHERE id = ?', [id])
}

export function dbGetArtifact(sessionId: string): string {
  const row = getDb()
    .query('SELECT content FROM artifacts WHERE session_id = ?')
    .get(sessionId) as { content: string } | null
  return row?.content ?? ''
}

export function dbUpsertArtifact(sessionId: string, content: string): void {
  const now = new Date().toISOString()
  getDb().run(
    `INSERT INTO artifacts (session_id, content, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [sessionId, content, now],
  )
  getDb().run('UPDATE sessions SET updated_at = ? WHERE id = ?', [now, sessionId])
}

/** Ordered chat history for UI + agent replay (capped). */
export function dbListChatMessages(sessionId: string): ChatMessageRow[] {
  return getDb()
    .query(
      `SELECT id, session_id, role, content, created_at FROM messages
       WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 500`,
    )
    .all(sessionId) as ChatMessageRow[]
}

/** Persist one user + one assistant turn after streaming completes. */
export function dbPersistChatTurn(sessionId: string, userContent: string, assistantContent: string): void {
  const db = getDb()
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
