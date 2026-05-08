/**
 * Kevin v1.5 — Tier 1/2/3 path constants & directory initialization.
 * See docs/specs/kevin1.5/tier-architecture.md
 */

import { homedir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs'

const DEFAULT_USER_ID = 'default'

export function kyberHome(): string {
  const raw = process.env.KYBER_HOME?.trim()
  if (raw) return raw
  return join(homedir(), '.kyberkit')
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

/**
 * Lists Space vault ids under ~/.kyberkit/spaces (one directory per Space).
 * Always includes `default` even before first explicit folder creation.
 */
export function listDiscoveredSpaces(): SpaceListEntry[] {
  const root = join(kyberHome(), 'spaces')
  mkdirSync(root, { recursive: true })
  const ids = new Set<string>(['default'])
  try {
    for (const name of readdirSync(root)) {
      if (name.startsWith('.')) continue
      const p = join(root, name)
      try {
        if (statSync(p).isDirectory()) ids.add(name)
      } catch {
        /* skip broken entries */
      }
    }
  } catch {
    /* ignore */
  }
  const sorted = [...ids].sort((a, b) => {
    if (a === 'default') return -1
    if (b === 'default') return 1
    return a.localeCompare(b)
  })
  return sorted.map((id) => ({ id, label: spaceDisplayLabel(id) }))
}

function toRefPath(spaceId: string, relPath: string): string {
  const normalized = relPath.replaceAll('\\', '/').replace(/^\/+/, '')
  return `@/spaces/${spaceId}/docs/${normalized}`
}

/**
 * Lists tree nodes under one Space docs root.
 * The root path is always `spaceDocsDir(spaceId)` and children are sorted as:
 * directories first, then files; both alphabetically.
 */
export function listSpaceDocsTree(spaceId: string): SpaceDocTreeNode[] {
  const root = spaceDocsDir(spaceId)
  mkdirSync(root, { recursive: true })

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
          path: toRefPath(spaceId, rel),
          kind: 'dir',
          children: walk(abs, rel),
        })
      } else {
        files.push({
          name,
          path: toRefPath(spaceId, rel),
          kind: 'file',
        })
      }
    }
    const byName = (a: SpaceDocTreeNode, b: SpaceDocTreeNode) => a.name.localeCompare(b.name)
    dirs.sort(byName)
    files.sort(byName)
    return [...dirs, ...files]
  }

  return walk(root, '')
}
