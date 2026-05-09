import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  dbDeleteTask,
  dbGetTask,
  dbInsertTask,
  dbListTasks,
  dbUpdateTaskState,
  type TaskRow,
} from './db'
import {
  ensureKevinLayout,
  upsertSpaceLibraryBinding,
} from '../src/runtime/paths/PathResolver.js'

const tempRoots: string[] = []

function bootstrapBinding(): { spaceId: string; libraryId: string } {
  const root = mkdtempSync(join(tmpdir(), 'kyberkit-tasks-'))
  tempRoots.push(root)
  process.env.KEVIN_NODE_ROOT = root
  ensureKevinLayout()
  const spaceId = randomUUID()
  const libraryId = randomUUID()
  const mountPath = mkdtempSync(join(tmpdir(), 'kyberkit-tasks-mount-'))
  tempRoots.push(mountPath)
  upsertSpaceLibraryBinding({ spaceId, libraryId, mountPath, displayName: 'T' })
  return { spaceId, libraryId }
}

afterEach(() => {
  for (const r of tempRoots.splice(0)) rmSync(r, { recursive: true, force: true })
  delete process.env.KEVIN_NODE_ROOT
})

function makeRow(spaceId: string, overrides: Partial<TaskRow> = {}): TaskRow {
  const now = new Date().toISOString()
  return {
    id: randomUUID(),
    space_id: spaceId,
    state: 'queued',
    skill_name: null,
    trigger_kind: 'manual',
    payload: null,
    progress: 0,
    message: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
}

describe('db tasks (Sprint C — Sign-off + async lifecycle)', () => {
  it('inserts and retrieves a task by id', () => {
    const { spaceId } = bootstrapBinding()
    const row = makeRow(spaceId, { skill_name: 'standup' })
    dbInsertTask(row)

    const fetched = dbGetTask(row.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(row.id)
    expect(fetched!.skill_name).toBe('standup')
    expect(fetched!.space_id).toBe(spaceId)
  })

  it('lists tasks scoped to a single space', () => {
    const { spaceId } = bootstrapBinding()
    const otherSpace = randomUUID()
    const otherLibrary = randomUUID()
    const otherMount = mkdtempSync(join(tmpdir(), 'kyberkit-tasks-mount-other-'))
    tempRoots.push(otherMount)
    upsertSpaceLibraryBinding({ spaceId: otherSpace, libraryId: otherLibrary, mountPath: otherMount, displayName: 'O' })

    dbInsertTask(makeRow(spaceId, { skill_name: 'mine' }))
    dbInsertTask(makeRow(otherSpace, { skill_name: 'theirs' }))

    const list = dbListTasks(spaceId)
    expect(list.map((t) => t.skill_name)).toEqual(['mine'])
    const otherList = dbListTasks(otherSpace)
    expect(otherList.map((t) => t.skill_name)).toEqual(['theirs'])
  })

  it('updates state, progress, and message', () => {
    const { spaceId } = bootstrapBinding()
    const row = makeRow(spaceId)
    dbInsertTask(row)

    dbUpdateTaskState(row.id, { state: 'running', progress: 0.5, message: 'mid' })

    const fetched = dbGetTask(row.id)
    expect(fetched!.state).toBe('running')
    expect(fetched!.progress).toBe(0.5)
    expect(fetched!.message).toBe('mid')
    // updated_at should change
    expect(fetched!.updated_at).not.toBe(row.updated_at)
  })

  it('deletes a task', () => {
    const { spaceId } = bootstrapBinding()
    const row = makeRow(spaceId)
    dbInsertTask(row)
    dbDeleteTask(row.id)
    expect(dbGetTask(row.id)).toBeNull()
  })

  it('returns null for unknown task id', () => {
    bootstrapBinding()
    expect(dbGetTask('does-not-exist')).toBeNull()
  })

  it('lists tasks ordered by updated_at desc', () => {
    const { spaceId } = bootstrapBinding()
    const a = makeRow(spaceId, { skill_name: 'a' })
    dbInsertTask(a)
    Bun.sleepSync(5)
    const b = makeRow(spaceId, { skill_name: 'b' })
    dbInsertTask(b)
    Bun.sleepSync(5)
    dbUpdateTaskState(a.id, { progress: 0.1 })

    const list = dbListTasks(spaceId)
    expect(list[0].id).toBe(a.id) // most recently updated
    expect(list[1].id).toBe(b.id)
  })
})
