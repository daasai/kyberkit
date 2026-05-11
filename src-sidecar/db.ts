/**
 * SQLite database for Kevin Sidecar — sessions + artifacts + chat messages.
 * Uses bun:sqlite (built-in, zero deps).
 */

import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  libraryTechRoot,
  readSpaceLibraryRegistry,
  resolveSpaceToLibrary,
} from '../src/runtime/paths/PathResolver.js'

export interface SessionRow {
  id: string
  space_id: string
  library_id: string
  title: string
  created_at: string
  updated_at: string
  /** 1 = pinned to top of default list */
  pinned: number
  /** 1 = hidden from default list (archived view) */
  archived: number
}

export interface ArtifactRow {
  session_id: string
  content: string
  updated_at: string
}

/** One row per artifact file saved during a session (append-only; canvas may show latest only). */
export interface SessionSavedArtifactRow {
  id: string
  session_id: string
  library_relative_path: string | null
  summary: string
  created_at: string
}

export interface ChatMessageRow {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export type TaskState =
  | 'queued'
  | 'running'
  | 'awaiting-signoff'
  | 'completed'
  | 'cancelled'
  | 'failed'

export interface TaskRow {
  id: string
  space_id: string
  state: TaskState
  skill_name: string | null
  trigger_kind: string
  payload: string | null
  progress: number
  message: string | null
  created_at: string
  updated_at: string
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

/**
 * Close the SQLite handle for this library (if open) and delete `sessions.db`
 * under {@link libraryTechRoot}. Caller should delete sessions/tasks first if needed.
 */
export function evictLibraryDatabase(libraryId: string): void {
  const key = libraryId.trim()
  const existing = dbByLibraryId.get(key)
  if (existing) {
    try {
      existing.close(true)
    } catch {
      /* ignore */
    }
    dbByLibraryId.delete(key)
  }
  try {
    const dbPath = join(libraryTechRoot(key), 'sessions.db')
    if (existsSync(dbPath)) unlinkSync(dbPath)
  } catch {
    /* ignore */
  }
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
      updated_at  TEXT NOT NULL,
      pinned      INTEGER NOT NULL DEFAULT 0,
      archived    INTEGER NOT NULL DEFAULT 0
    )
  `)
  migrateSessionsPinArchive(db)
  db.run(`
    CREATE TABLE IF NOT EXISTS artifacts (
      session_id  TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
      content     TEXT NOT NULL DEFAULT '',
      updated_at  TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS session_saved_artifacts (
      id                      TEXT PRIMARY KEY,
      session_id              TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      library_relative_path   TEXT,
      summary                 TEXT NOT NULL DEFAULT '',
      created_at              TEXT NOT NULL
    )
  `)
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_session_saved_artifacts_session ON session_saved_artifacts(session_id, created_at DESC)`,
  )
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content     TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id            TEXT PRIMARY KEY,
      space_id      TEXT NOT NULL,
      state         TEXT NOT NULL,
      skill_name    TEXT,
      trigger_kind  TEXT NOT NULL DEFAULT 'manual',
      payload       TEXT,
      progress      REAL NOT NULL DEFAULT 0,
      message       TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id, updated_at DESC, id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at, id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_space ON tasks(space_id, updated_at DESC, id)`)
  console.log(`[DB] Connected: ${dbPath}`)
  dbByLibraryId.set(key, db)
  return db
}

/** Add pinned/archived columns to pre-v1.5-gap DBs (idempotent). */
function migrateSessionsPinArchive(db: Database): void {
  const cols = db.query('PRAGMA table_info(sessions)').all() as Array<{ name: string }>
  const names = new Set(cols.map((c) => c.name))
  if (!names.has('pinned')) {
    try {
      db.run('ALTER TABLE sessions ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0')
    } catch {
      /* ignore */
    }
  }
  if (!names.has('archived')) {
    try {
      db.run('ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
    } catch {
      /* ignore */
    }
  }
}

function dbForSpace(spaceId: string): Database | null {
  const binding = resolveSpaceToLibrary(spaceId)
  if (!binding) return null
  return getDb(binding.libraryId)
}

/** Locate any task by id across all known library DBs (tasks are space-scoped, not space-pinned in path). */
function findTaskById(id: string): { db: Database; row: TaskRow } | null {
  for (const binding of readSpaceLibraryRegistry()) {
    const db = getDb(binding.libraryId)
    const row = db.query('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | null
    if (row) return { db, row }
  }
  return null
}

export function dbInsertTask(row: TaskRow): void {
  const db = dbForSpace(row.space_id)
  if (!db) throw new Error(`No library bound for space ${row.space_id}`)
  db.run(
    `INSERT INTO tasks (id, space_id, state, skill_name, trigger_kind, payload, progress, message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.space_id,
      row.state,
      row.skill_name,
      row.trigger_kind,
      row.payload,
      row.progress,
      row.message,
      row.created_at,
      row.updated_at,
    ],
  )
}

export function dbGetTask(id: string): TaskRow | null {
  const found = findTaskById(id)
  return found ? found.row : null
}

export function dbListTasks(spaceId: string): TaskRow[] {
  const db = dbForSpace(spaceId)
  if (!db) return []
  return db
    .query('SELECT * FROM tasks WHERE space_id = ? ORDER BY updated_at DESC, id')
    .all(spaceId) as TaskRow[]
}

export function dbUpdateTaskState(
  id: string,
  patch: Partial<Pick<TaskRow, 'state' | 'progress' | 'message'>>,
): void {
  const found = findTaskById(id)
  if (!found) return
  const now = new Date().toISOString()
  const next: TaskRow = {
    ...found.row,
    ...(patch.state !== undefined ? { state: patch.state } : {}),
    ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
    ...(patch.message !== undefined ? { message: patch.message } : {}),
    updated_at: now,
  }
  found.db.run(
    `UPDATE tasks SET state = ?, progress = ?, message = ?, updated_at = ? WHERE id = ?`,
    [next.state, next.progress, next.message, next.updated_at, id],
  )
}

export function dbDeleteTask(id: string): void {
  const found = findTaskById(id)
  if (!found) return
  found.db.run('DELETE FROM tasks WHERE id = ?', [id])
}

/** All sessions for a space (default + archived) — used before tearing down a library DB. */
export function dbListAllSessionsInSpace(libraryId: string, spaceId: string): SessionRow[] {
  return getDb(libraryId)
    .query('SELECT * FROM sessions WHERE space_id = ? ORDER BY updated_at DESC')
    .all(spaceId) as SessionRow[]
}

export function dbListSessions(
  libraryId: string,
  spaceId: string,
  opts?: { archived?: boolean },
): SessionRow[] {
  const archived = opts?.archived === true ? 1 : 0
  if (archived) {
    return getDb(libraryId)
      .query(
        'SELECT * FROM sessions WHERE space_id = ? AND archived = 1 ORDER BY updated_at DESC',
      )
      .all(spaceId) as SessionRow[]
  }
  return getDb(libraryId)
    .query(
      'SELECT * FROM sessions WHERE space_id = ? AND archived = 0 ORDER BY pinned DESC, updated_at DESC',
    )
    .all(spaceId) as SessionRow[]
}

export function dbSetSessionPinned(
  libraryId: string,
  spaceId: string,
  id: string,
  pinned: boolean,
): void {
  const now = new Date().toISOString()
  getDb(libraryId).run(
    'UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ? AND space_id = ?',
    [pinned ? 1 : 0, now, id, spaceId],
  )
}

export function dbSetSessionArchived(
  libraryId: string,
  spaceId: string,
  id: string,
  archived: boolean,
): void {
  const now = new Date().toISOString()
  getDb(libraryId).run(
    'UPDATE sessions SET archived = ?, pinned = CASE WHEN ? = 1 THEN 0 ELSE pinned END, updated_at = ? WHERE id = ? AND space_id = ?',
    [archived ? 1 : 0, archived ? 1 : 0, now, id, spaceId],
  )
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
    'INSERT INTO sessions (id, space_id, library_id, title, created_at, updated_at, pinned, archived) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
    [id, spaceId, libraryId, title, now, now],
  )
  return {
    id,
    space_id: spaceId,
    library_id: libraryId,
    title,
    created_at: now,
    updated_at: now,
    pinned: 0,
    archived: 0,
  }
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

export function dbInsertSessionSavedArtifact(
  libraryId: string,
  row: {
    id: string
    session_id: string
    library_relative_path: string
    summary: string
    created_at: string
  },
): void {
  getDb(libraryId).run(
    `INSERT OR IGNORE INTO session_saved_artifacts (id, session_id, library_relative_path, summary, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [row.id, row.session_id, row.library_relative_path, row.summary, row.created_at],
  )
}

export function dbListSessionSavedArtifacts(libraryId: string, sessionId: string): SessionSavedArtifactRow[] {
  return getDb(libraryId)
    .query(
      `SELECT id, session_id, library_relative_path, summary, created_at
       FROM session_saved_artifacts WHERE session_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(sessionId) as SessionSavedArtifactRow[]
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
