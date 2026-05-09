/**
 * Kevin v1.5 — Skill three-tier scanner & loader.
 *
 * Reads SKILL.md from Global / User / Space directories, validates frontmatter,
 * and merges into a single map with conflict resolution: Space > User > Global.
 *
 * See docs/specs/kevin1.5/skill-architecture.md §3-§4 (loader + L1/L2 disclosure).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'
import {
  globalSkillsDir,
  spaceSkillsDir,
  userSkillsDir,
} from '../src/runtime/paths/PathResolver.js'

export type SkillScope = 'global' | 'user' | 'space'
export type SkillRisk = 'low' | 'medium' | 'high'

export interface SkillRecord {
  name: string
  description: string
  scope: SkillScope
  risk: SkillRisk
  allowedTools: string[]
  triggers: string[]
  /** Cron expression from kevin.cron frontmatter, when scheduler trigger is enabled. */
  cron?: string
  scopeDir: string
  absPath: string
  frontmatter: Record<string, unknown>
}

export interface SkillFullRecord extends SkillRecord {
  body: string
}

const TIER_PRECEDENCE: SkillScope[] = ['global', 'user', 'space']

function listSkillFolders(rootDir: string): string[] {
  if (!existsSync(rootDir)) return []
  let entries: string[] = []
  try {
    entries = readdirSync(rootDir)
  } catch {
    return []
  }
  return entries.filter((name) => {
    const abs = join(rootDir, name)
    try {
      return statSync(abs).isDirectory()
    } catch {
      return false
    }
  })
}

function readFrontmatter(skillFile: string): {
  data: Record<string, unknown>
  body: string
} | null {
  let raw: string
  try {
    raw = readFileSync(skillFile, 'utf-8')
  } catch {
    return null
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null
  let data: unknown
  try {
    data = parseYaml(match[1]) ?? {}
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return { data: data as Record<string, unknown>, body: match[2] ?? '' }
}

function pickList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean)
}

function pickRisk(kevinBlock: unknown): SkillRisk {
  if (!kevinBlock || typeof kevinBlock !== 'object') return 'low'
  const k = kevinBlock as Record<string, unknown>
  const raw = typeof k.risk === 'string' ? k.risk.toLowerCase() : ''
  if (raw === 'medium' || raw === 'high') return raw
  return 'low'
}

function pickTriggers(kevinBlock: unknown): string[] {
  if (!kevinBlock || typeof kevinBlock !== 'object') return ['manual']
  const k = kevinBlock as Record<string, unknown>
  const list = pickList(k.triggers)
  return list.length > 0 ? list : ['manual']
}

function pickCron(kevinBlock: unknown): string | undefined {
  if (!kevinBlock || typeof kevinBlock !== 'object') return undefined
  const k = kevinBlock as Record<string, unknown>
  const raw = typeof k.cron === 'string' ? k.cron.trim() : ''
  return raw.length > 0 ? raw : undefined
}

function buildRecord(
  scope: SkillScope,
  scopeDir: string,
  slug: string,
): SkillRecord | null {
  const skillFile = join(scopeDir, slug, 'SKILL.md')
  if (!existsSync(skillFile)) return null
  const parsed = readFrontmatter(skillFile)
  if (!parsed) return null

  const fm = parsed.data
  const name = typeof fm.name === 'string' ? fm.name.trim() : ''
  const description = typeof fm.description === 'string' ? fm.description.trim() : ''
  if (!name || !description) return null

  return {
    name,
    description,
    scope,
    risk: pickRisk(fm.kevin),
    allowedTools: pickList(fm['allowed-tools'] ?? fm.allowedTools),
    triggers: pickTriggers(fm.kevin),
    cron: pickCron(fm.kevin),
    scopeDir,
    absPath: skillFile,
    frontmatter: fm,
  }
}

function tierDir(scope: SkillScope, spaceId: string, userId: string): string {
  switch (scope) {
    case 'global':
      return globalSkillsDir()
    case 'user':
      return userSkillsDir(userId)
    case 'space':
      return spaceSkillsDir(spaceId)
  }
}

/**
 * Scan all three tiers visible to a Space; later tiers override earlier on `name` collision.
 * Order: Global → User → Space (so Space wins, per skill-architecture.md §3).
 */
export function scanSkillsForSpace(spaceId: string, userId = 'default'): SkillRecord[] {
  const merged = new Map<string, SkillRecord>()
  for (const scope of TIER_PRECEDENCE) {
    const dir = tierDir(scope, spaceId, userId)
    for (const slug of listSkillFolders(dir)) {
      const record = buildRecord(scope, dir, slug)
      if (record) merged.set(record.name, record)
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Resolve a single skill by name (after merge) and return its full body for L2 disclosure.
 */
export function loadSkillFull(
  spaceId: string,
  name: string,
  userId = 'default',
): SkillFullRecord | null {
  const list = scanSkillsForSpace(spaceId, userId)
  const meta = list.find((s) => s.name === name)
  if (!meta) return null
  const parsed = readFrontmatter(meta.absPath)
  if (!parsed) return null
  return { ...meta, body: parsed.body }
}

/**
 * CC-style L1 directory line per skill — `- name: description` — for system-prompt injection.
 */
export function formatSkillDirectoryLine(record: SkillRecord): string {
  return `- ${record.name}: ${record.description}`
}

/**
 * Build the entire L1 directory block to inject into system prompt.
 * PRD §12.5 — fixed-width budget; v1.5 caps at 50, then top-30 by frequency (deferred).
 */
export function buildSkillDirectory(records: SkillRecord[]): string {
  if (records.length === 0) return ''
  const lines = records.map(formatSkillDirectoryLine)
  return ['## Available Skills', '', ...lines, ''].join('\n')
}
