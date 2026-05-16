/**
 * Kevin v1.5 — Tier 1/2/3 path constants & directory initialization.
 * See packages/kevin-docs/specs/kevin1.5/tier-architecture.md
 */

import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs'

const DEFAULT_USER_ID = 'default'

/** RFC 4122 UUID v1–v5 string form (lowercase hex with dashes). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuidString(value: string): boolean {
  return UUID_RE.test(value.trim())
}

export function kyberHome(): string {
  const raw = process.env.KYBER_HOME?.trim()
  if (raw) return raw
  return join(homedir(), '.kyberkit')
}

export function kevinNodeRoot(): string {
  const raw = process.env.KEVIN_NODE_ROOT?.trim()
  if (raw) return raw
  return join(homedir(), '.kyberkit', 'kevin')
}

export function globalSkillsDir(): string {
  return join(kyberHome(), 'global', 'skills')
}

export function userRoot(userId: string = DEFAULT_USER_ID): string {
  return join(kyberHome(), 'users', userId)
}

export function userConfigPath(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'config.enc')
}

export function userProfilePath(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'profile.json')
}

export function userSkillsDir(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'skills')
}

export function userCredentialsDir(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'credentials')
}

export function userTemplatesDir(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'templates')
}

export function userAuditDir(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'audit')
}

export function kevinRegistryDir(): string {
  return join(kevinNodeRoot(), 'registry')
}

export function kevinSpaceLibraryRegistryPath(): string {
  return join(kevinRegistryDir(), 'space-library-map.json')
}

export function libraryTechRoot(libraryId: string): string {
  return join(kevinNodeRoot(), `lib-${libraryId}`)
}

/** Cron job definitions for {@link CronEngine} — JSON array of `{ id, space_id, cron, skill_name }`. */
export function userCrontabPath(userId: string = DEFAULT_USER_ID): string {
  return join(userRoot(userId), 'crontab.json')
}

export function spaceTierRoot(spaceId: string): string {
  return join(kyberHome(), 'spaces', spaceId)
}

export function spaceDocsDir(spaceId: string): string {
  return join(spaceTierRoot(spaceId), 'docs')
}

export function spaceSkillsDir(spaceId: string): string {
  return join(spaceTierRoot(spaceId), 'skills')
}

/**
 * Creates ~/.kyberkit layout for Global + default User + minimal Space skeleton.
 */
export function ensureTierLayout(userId: string = DEFAULT_USER_ID): void {
  const dirs = [
    globalSkillsDir(),
    userSkillsDir(userId),
    userCredentialsDir(userId),
    userTemplatesDir(userId),
    userAuditDir(userId),
    join(kyberHome(), 'spaces'),
  ]
  for (const d of dirs) {
    mkdirSync(d, { recursive: true })
  }


  const profilePath = userProfilePath(userId)
  if (!existsSync(profilePath)) {
    const profile = {
      userId,
      createdAt: new Date().toISOString(),
      onboardingComplete: false,
    }
    writeFileSync(profilePath, JSON.stringify(profile, null, 2), 'utf-8')
  }
}

/**
 * Ensures Rev3 Kevin layout roots under ${KEVIN_NODE_ROOT}.
 */
export function ensureKevinLayout(): void {
  const dirs = [kevinNodeRoot(), kevinRegistryDir()]
  for (const d of dirs) {
    mkdirSync(d, { recursive: true })
  }
}

// ── Phase 1 sidecar layout ────────────────────────────────────────────────────

/**
 * Root directory for the Kevin sidecar's persistent data.
 * Override with KEVIN_SIDECAR_HOME env var (used in tests).
 */
export function kevinSidecarHome(): string {
  const raw = process.env.KEVIN_SIDECAR_HOME?.trim()
  if (raw) return raw
  return join(homedir(), '.kevin', 'sidecar')
}

/**
 * Ensures the Phase 1 sidecar directory layout exists.
 * Creates ~/.kevin/sidecar/framework/ and adjacent directories.
 */
export function ensureKevinPhase1Layout(): void {
  const dirs = [
    kevinSidecarHome(),
    join(kevinSidecarHome(), 'framework'),
    join(kevinSidecarHome(), 'learning'),
  ]
  for (const d of dirs) {
    mkdirSync(d, { recursive: true })
  }
}

/** Ensures Tier 3 dirs for one Space (docs + skills + parents). */
export function ensureSpaceTier(spaceId: string): void {
  mkdirSync(spaceDocsDir(spaceId), { recursive: true })
  mkdirSync(spaceSkillsDir(spaceId), { recursive: true })
}

export function readProfile(userId: string = DEFAULT_USER_ID): {
  userId: string
  createdAt: string
  onboardingComplete?: boolean
} {
  const p = userProfilePath(userId)
  if (!existsSync(p)) {
    return { userId, createdAt: new Date().toISOString(), onboardingComplete: false }
  }
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as {
      userId: string
      createdAt: string
      onboardingComplete?: boolean
    }
  } catch {
    return { userId, createdAt: new Date().toISOString(), onboardingComplete: false }
  }
}

export function writeProfile(
  userId: string,
  patch: Partial<{ onboardingComplete: boolean }>,
): void {
  const prev = readProfile(userId)
  const next = { ...prev, ...patch }
  writeFileSync(userProfilePath(userId), JSON.stringify(next, null, 2), 'utf-8')
}

export interface SpaceListEntry {
  id: string
  label: string
  libraryId?: string
  mountPath?: string
}

export interface SpaceLibraryBinding {
  spaceId: string
  libraryId: string
  mountPath: string
  displayName?: string
  connectorByzEnabled?: boolean
  connectorByzAlias?: string
  connectorSyncStatePath?: string
  /** Kevin 2.0 onboarding: capability matrix + connector deferral (JSON-serializable object). */
  workspaceSettings?: Record<string, unknown>
  [key: string]: unknown
}

export interface SpaceDocTreeNode {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: SpaceDocTreeNode[]
}

function spaceDisplayLabel(spaceId: string): string {
  if (spaceId === 'default') return '默认 Space'
  return spaceId
}

export function readSpaceLibraryRegistry(): SpaceLibraryBinding[] {
  ensureKevinLayout()
  const p = kevinSpaceLibraryRegistryPath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw
      .filter((row): row is SpaceLibraryBinding => {
        if (!row || typeof row !== 'object') return false
        const r = row as Partial<SpaceLibraryBinding>
        return Boolean(r.spaceId && r.libraryId && r.mountPath)
      })
      .map((row) => ({
        ...row,
        spaceId: row.spaceId.trim(),
        libraryId: row.libraryId.trim(),
        mountPath: row.mountPath.trim(),
        displayName: row.displayName?.trim(),
      }))
  } catch {
    return []
  }
}

function writeSpaceLibraryRegistry(rows: SpaceLibraryBinding[]): void {
  ensureKevinLayout()
  writeFileSync(kevinSpaceLibraryRegistryPath(), JSON.stringify(rows, null, 2), 'utf-8')
}

export function upsertSpaceLibraryBinding(binding: SpaceLibraryBinding): void {
  const sid = binding.spaceId.trim()
  const lid = binding.libraryId.trim()
  if (!isUuidString(sid) || !isUuidString(lid)) {
    throw new Error('spaceId and libraryId must be UUIDs')
  }
  const rows = readSpaceLibraryRegistry()
  const existing = rows.find((row) => row.spaceId === sid || row.libraryId === lid)
  const next: SpaceLibraryBinding = {
    ...existing,
    spaceId: sid,
    libraryId: lid,
    mountPath: binding.mountPath.trim(),
    displayName: binding.displayName?.trim(),
  }
  if (binding.connectorByzEnabled !== undefined) {
    next.connectorByzEnabled = binding.connectorByzEnabled
  }
  if (binding.connectorByzAlias !== undefined) {
    next.connectorByzAlias = binding.connectorByzAlias
  }
  if (binding.connectorSyncStatePath !== undefined) {
    next.connectorSyncStatePath = binding.connectorSyncStatePath
  }
  if (binding.workspaceSettings !== undefined) {
    next.workspaceSettings = binding.workspaceSettings
  }
  const filtered = rows.filter((row) => row.spaceId !== next.spaceId && row.libraryId !== next.libraryId)
  filtered.push(next)
  writeSpaceLibraryRegistry(filtered)
}

export function updateLibraryConnectorSettings(params: {
  libraryId: string
  spaceId?: string | null
  patch: {
    connectorByzEnabled?: boolean
    connectorByzAlias?: string | null
    connectorSyncStatePath?: string | null
  }
}): SpaceLibraryBinding | null {
  const lid = params.libraryId.trim()
  if (!isUuidString(lid)) {
    throw new Error('libraryId must be a UUID')
  }

  const rows = readSpaceLibraryRegistry()
  const idx = rows.findIndex((row) => row.libraryId === lid)
  if (idx < 0) return null

  const sid = params.spaceId?.trim()
  if (sid && rows[idx].spaceId !== sid) return null

  const nextRow: SpaceLibraryBinding = { ...rows[idx] }
  if (params.patch.connectorByzEnabled !== undefined) {
    nextRow.connectorByzEnabled = params.patch.connectorByzEnabled
  }
  if (params.patch.connectorByzAlias !== undefined) {
    if (params.patch.connectorByzAlias === null) {
      delete nextRow.connectorByzAlias
    } else {
      nextRow.connectorByzAlias = params.patch.connectorByzAlias.trim()
    }
  }
  if (params.patch.connectorSyncStatePath !== undefined) {
    if (params.patch.connectorSyncStatePath === null) {
      delete nextRow.connectorSyncStatePath
    } else {
      nextRow.connectorSyncStatePath = params.patch.connectorSyncStatePath.trim()
    }
  }

  const copy = [...rows]
  copy[idx] = nextRow
  writeSpaceLibraryRegistry(copy)
  return nextRow
}

/** Updates `displayName` for a bound Space; empty string clears custom name. */
export function updateSpaceLibraryDisplayName(spaceId: string, displayName: string): SpaceLibraryBinding | null {
  const sid = spaceId.trim()
  const rows = readSpaceLibraryRegistry()
  const idx = rows.findIndex((r) => r.spaceId === sid)
  if (idx < 0) return null
  const trimmed = displayName.trim()
  const nextRow: SpaceLibraryBinding = {
    ...rows[idx],
    displayName: trimmed.length > 0 ? trimmed : undefined,
  }
  const copy = [...rows]
  copy[idx] = nextRow
  writeSpaceLibraryRegistry(copy)
  return nextRow
}

/** Removes the registry row for this Space and returns the removed binding, if any. */
export function removeSpaceLibraryBinding(spaceId: string): SpaceLibraryBinding | null {
  const sid = spaceId.trim()
  const rows = readSpaceLibraryRegistry()
  const found = rows.find((r) => r.spaceId === sid) ?? null
  if (!found) return null
  writeSpaceLibraryRegistry(rows.filter((r) => r.spaceId !== sid))
  return found
}

export function resolveSpaceToLibrary(spaceId: string): SpaceLibraryBinding | null {
  const key = spaceId.trim()
  if (!key) return null
  const rows = readSpaceLibraryRegistry()
  return rows.find((row) => row.spaceId === key) ?? null
}

export function resolveLibraryMountPath(libraryId: string): string | null {
  const key = libraryId.trim()
  if (!key) return null
  const rows = readSpaceLibraryRegistry()
  return rows.find((row) => row.libraryId === key)?.mountPath ?? null
}

/**
 * Rev3: Spaces exposed to the app come only from the Space–Library registry (UUID ids).
 */
export function listRegistrySpaces(): SpaceListEntry[] {
  const rows = readSpaceLibraryRegistry()
  const sorted = [...rows].sort((a, b) => a.spaceId.localeCompare(b.spaceId))
  return sorted.map((row) => ({
    id: row.spaceId,
    label: row.displayName?.trim() || row.spaceId.slice(0, 8) + '…',
    libraryId: row.libraryId,
    mountPath: row.mountPath,
  }))
}

/**
 * @deprecated Legacy discovery under ~/.kyberkit/spaces; prefer {@link listRegistrySpaces} for Kevin desktop.
 */
export function listDiscoveredSpaces(): SpaceListEntry[] {
  return listRegistrySpaces()
}

function toRefPath(spaceId: string, relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/').replace(/^\/+/, '')
  return `@/spaces/${spaceId}/docs/${normalized}`
}

function walkTree(absRoot: string, toPath: (relPath: string) => string): SpaceDocTreeNode[] {
  const walk = (absDir: string, relDir: string): SpaceDocTreeNode[] => {
    const dirs: SpaceDocTreeNode[] = []
    const files: SpaceDocTreeNode[] = []
    for (const name of readdirSync(absDir)) {
      if (name.startsWith('.')) continue
      const abs = join(absDir, name)
      let isDir = false
      try {
        isDir = statSync(abs).isDirectory()
      } catch {
        continue
      }
      const rel = relDir ? `${relDir}/${name}` : name
      if (isDir) {
        dirs.push({
          name,
          path: toPath(rel),
          kind: 'dir',
          children: walk(abs, rel),
        })
      } else {
        files.push({
          name,
          path: toPath(rel),
          kind: 'file',
        })
      }
    }
    const byName = (a: SpaceDocTreeNode, b: SpaceDocTreeNode) => a.name.localeCompare(b.name)
    dirs.sort(byName)
    files.sort(byName)
    return [...dirs, ...files]
  }
  return walk(absRoot, '')
}

function toLibraryRefPath(libraryId: string, relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/').replace(/^\/+/, '')
  return `@/libraries/${libraryId}/${normalized}`
}

/**
 * Lists tree nodes under the Library mount for this Space (Rev3).
 * Requires a registry binding; no legacy ~/.kyberkit/spaces/.../docs fallback.
 */
export function listSpaceDocsTree(spaceId: string): SpaceDocTreeNode[] {
  const binding = resolveSpaceToLibrary(spaceId)
  if (!binding) {
    throw new Error(`No library binding for space ${spaceId}`)
  }
  const root = binding.mountPath
  mkdirSync(root, { recursive: true })
  return walkTree(root, (rel) => toLibraryRefPath(binding.libraryId, rel))
}
