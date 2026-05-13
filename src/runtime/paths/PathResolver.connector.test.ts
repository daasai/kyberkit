import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  kevinSpaceLibraryRegistryPath,
  readSpaceLibraryRegistry,
  upsertSpaceLibraryBinding,
} from './PathResolver'

const SID = 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee'
const LID = '11111111-2222-4333-8444-555555555555'

let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kevin-connector-'))
  process.env.KEVIN_NODE_ROOT = root
  mkdirSync(join(root, 'registry'), { recursive: true })
  writeFileSync(
    kevinSpaceLibraryRegistryPath(),
    JSON.stringify([
      {
        spaceId: SID,
        libraryId: LID,
        mountPath: '/tmp/mount',
        displayName: 'L',
        connectorByzEnabled: true,
        connectorByzAlias: 'gateway',
        connectorSyncStatePath: '/tmp/state.json',
      },
    ]),
    'utf-8',
  )
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  delete process.env.KEVIN_NODE_ROOT
})

describe('SpaceLibraryBinding connector fields', () => {
  it('preserves connector fields when reading registry', () => {
    const rows = readSpaceLibraryRegistry()

    expect(rows[0].connectorByzEnabled).toBe(true)
    expect(rows[0].connectorByzAlias).toBe('gateway')
    expect(rows[0].connectorSyncStatePath).toBe('/tmp/state.json')
  })

  it('round-trips connector fields through upsert', () => {
    upsertSpaceLibraryBinding({
      spaceId: SID,
      libraryId: LID,
      mountPath: '/tmp/updated-mount',
      displayName: 'Updated',
      connectorByzEnabled: false,
      connectorByzAlias: 'updated-gateway',
      connectorSyncStatePath: '/tmp/updated-state.json',
    })

    const rows = readSpaceLibraryRegistry()
    expect(rows[0]).toMatchObject({
      spaceId: SID,
      libraryId: LID,
      mountPath: '/tmp/updated-mount',
      displayName: 'Updated',
      connectorByzEnabled: false,
      connectorByzAlias: 'updated-gateway',
      connectorSyncStatePath: '/tmp/updated-state.json',
    })
  })
})
