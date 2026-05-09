import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import {
  ensureKevinLayout,
  upsertSpaceLibraryBinding,
} from '../src/runtime/paths/PathResolver.js'
import { TaskManager } from './TaskManager'
import {
  _resetSpaceSubscribers,
  subscribeSpaceEvents,
  type SpaceScopedEvent,
} from './spaceEventBroadcast.js'

const tempRoots: string[] = []

function bootBinding(): { spaceId: string; libraryId: string } {
  const root = mkdtempSync(join(tmpdir(), 'kyberkit-tm-'))
  tempRoots.push(root)
  process.env.KEVIN_NODE_ROOT = root
  ensureKevinLayout()
  const spaceId = randomUUID()
  const libraryId = randomUUID()
  const mountPath = mkdtempSync(join(tmpdir(), 'kyberkit-tm-mount-'))
  tempRoots.push(mountPath)
  upsertSpaceLibraryBinding({ spaceId, libraryId, mountPath, displayName: 'TM' })
  return { spaceId, libraryId }
}

beforeEach(() => {
  _resetSpaceSubscribers()
})

afterEach(() => {
  for (const r of tempRoots.splice(0)) rmSync(r, { recursive: true, force: true })
  delete process.env.KEVIN_NODE_ROOT
  _resetSpaceSubscribers()
})

describe('TaskManager — sign-off lifecycle', () => {
  it('emits task_progress on createTask', async () => {
    const { spaceId } = bootBinding()
    const events: SpaceScopedEvent[] = []
    subscribeSpaceEvents(spaceId, (e) => events.push(e))

    const mgr = new TaskManager({}, 60_000)
    const row = mgr.createTask(spaceId, { skill_name: 'standup', trigger_kind: 'manual' })

    expect(row.state).toBe('queued')
    expect(events.some((e) => e.type === 'task_progress')).toBe(true)
  })

  it('createSignoffTask transitions to awaiting-signoff after delay and emits signoff_required', async () => {
    const { spaceId } = bootBinding()
    const events: SpaceScopedEvent[] = []
    subscribeSpaceEvents(spaceId, (e) => events.push(e))

    const mgr = new TaskManager({}, 20)
    const row = mgr.createSignoffTask(spaceId, { skill_name: 'artifact.feishu-doc.write', payload: { doc: 'X' } })
    expect(row.state).toBe('running')

    await new Promise((r) => setTimeout(r, 60))
    expect(events.some((e) => e.type === 'signoff_required' && e.task_id === row.id)).toBe(true)
    expect(mgr.get(row.id)!.state).toBe('awaiting-signoff')
  })

  it('resolveSignoff(approved) transitions to completed and emits task_completed', async () => {
    const { spaceId } = bootBinding()
    const events: SpaceScopedEvent[] = []
    subscribeSpaceEvents(spaceId, (e) => events.push(e))

    const mgr = new TaskManager({}, 1)
    const row = mgr.createSignoffTask(spaceId, { skill_name: 'artifact.feishu-doc.write' })
    await new Promise((r) => setTimeout(r, 30))

    const resolved = mgr.resolveSignoff(row.id, true)
    expect(resolved!.state).toBe('completed')
    expect(events.some((e) => e.type === 'task_completed')).toBe(true)
  })

  it('resolveSignoff(rejected) transitions to cancelled', async () => {
    const { spaceId } = bootBinding()
    const events: SpaceScopedEvent[] = []
    subscribeSpaceEvents(spaceId, (e) => events.push(e))

    const mgr = new TaskManager({}, 1)
    const row = mgr.createSignoffTask(spaceId)
    await new Promise((r) => setTimeout(r, 30))
    const resolved = mgr.resolveSignoff(row.id, false)
    expect(resolved!.state).toBe('cancelled')
    expect(events.some((e) => e.type === 'task_cancelled')).toBe(true)
  })

  it('does not deliver events from other Spaces', async () => {
    const a = bootBinding()
    // Add a second binding under the SAME node root so both spaces are reachable.
    const b = { spaceId: randomUUID(), libraryId: randomUUID() }
    const bMount = mkdtempSync(join(tmpdir(), 'kyberkit-tm-mount-b-'))
    tempRoots.push(bMount)
    upsertSpaceLibraryBinding({
      spaceId: b.spaceId,
      libraryId: b.libraryId,
      mountPath: bMount,
      displayName: 'B',
    })
    const aEvents: SpaceScopedEvent[] = []
    const bEvents: SpaceScopedEvent[] = []
    subscribeSpaceEvents(a.spaceId, (e) => aEvents.push(e))
    subscribeSpaceEvents(b.spaceId, (e) => bEvents.push(e))

    const mgr = new TaskManager({}, 60_000)
    mgr.createTask(a.spaceId, { skill_name: 'A' })

    expect(aEvents.length).toBeGreaterThan(0)
    expect(bEvents.length).toBe(0)
  })
})
