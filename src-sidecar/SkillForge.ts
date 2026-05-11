/**
 * Kevin v1.5 — Skill Forge (P0 trigger detection + write-on-accept).
 *
 * P0 trigger sub-set per the MVP-RC plan:
 *   1. Slash command:  `/save-as-skill [optional-name]`
 *   2. Explicit phrases (Chinese / English)
 *
 * Reuse-pattern detection (≥3 similar conversations in 7 days) is a P1 stretch
 * and is intentionally out of scope here.
 *
 * See docs/specs/kevin1.5/skill-architecture.md §5 (Forge contract).
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, normalize, resolve } from 'path'
import { spaceSkillsDir } from '../src/runtime/paths/PathResolver.js'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLASH_RE = /^\/save-as-skill\b\s*(.*)$/i
const ENGLISH_EXPLICIT = /save\s+(?:this|it)\s+as\s+a?\s*skill(?:\s+(?:called|named)\s+([a-z0-9-]+))?/i
const CN_EXPLICIT_PATTERNS = [
  /以后都这样/u,
  /把这个流程记下来/u,
  /每次.+都要/u,
  /** e.g. 「记住这个流程：…」— common UAT phrasing; previously only 「把这个流程记下来」 matched. */
  /记住.+流程/u,
]

export interface ForgeTriggerInput {
  message: string
  assistantSummary?: string
  /** Optional: most-recent assistant tool calls for naming hints (not used in P0). */
  toolNames?: string[]
}

export type ForgeTriggerKind = 'slash' | 'explicit'

export interface ForgeDraft {
  trigger: ForgeTriggerKind
  suggestedName: string
  suggestedDescription: string
  /** Free-form body suggestion derived from the assistant turn (placeholder for the L2 body). */
  bodySeed: string
}

/**
 * Public: returns a draft if a P0 trigger fires; otherwise null.
 * The caller (UI) confirms the draft before any disk write.
 */
export function suggestForgeDraft(input: ForgeTriggerInput): ForgeDraft | null {
  const slash = detectSlash(input.message)
  if (slash) return slash

  const explicit = detectExplicit(input)
  if (explicit) return explicit

  return null
}

function detectSlash(message: string): ForgeDraft | null {
  const m = message.trim().match(SLASH_RE)
  if (!m) return null
  const argRaw = (m[1] ?? '').trim()
  const slug = slugify(argRaw) || 'untitled-skill'
  return {
    trigger: 'slash',
    suggestedName: slug,
    suggestedDescription: 'Saved from `/save-as-skill`. Edit me to describe when this skill should fire.',
    bodySeed: '## Steps\n\nDescribe the steps the agent should follow.\n',
  }
}

function detectExplicit(input: ForgeTriggerInput): ForgeDraft | null {
  const eng = input.message.match(ENGLISH_EXPLICIT)
  if (eng) {
    const name = eng[1] ? slugify(eng[1]) : extractFallbackName(input)
    return {
      trigger: 'explicit',
      suggestedName: name || 'untitled-skill',
      suggestedDescription:
        input.assistantSummary?.slice(0, 200) ?? 'Auto-suggested from explicit phrasing.',
      bodySeed: '## Steps\n\nDescribe the steps the agent should follow.\n',
    }
  }

  if (CN_EXPLICIT_PATTERNS.some((re) => re.test(input.message))) {
    return {
      trigger: 'explicit',
      suggestedName: extractFallbackName(input) || 'untitled-skill',
      suggestedDescription:
        input.assistantSummary?.slice(0, 200) ?? '从用户显式语句蒸馏。请编辑这段描述以指导后续触发。',
      bodySeed: '## Steps\n\n描述这个 Skill 在被触发时应当依次完成的步骤。\n',
    }
  }
  return null
}

function extractFallbackName(input: ForgeTriggerInput): string {
  const summary = input.assistantSummary?.trim()
  if (summary) {
    const slug = slugify(summary.split(/[\s。.，,]/u).slice(0, 4).join(' '))
    if (slug) return slug
  }
  return ''
}

export function slugify(raw: string): string {
  const cleaned = raw
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.length <= 64 ? cleaned : cleaned.slice(0, 64).replace(/-+$/g, '')
}

export interface AcceptForgeInput {
  spaceId: string
  name: string
  description: string
  bodyMarkdown: string
  /** Optional risk override (default `low`). */
  risk?: 'low' | 'medium' | 'high'
}

export interface AcceptedSkillRecord {
  absPath: string
  name: string
  scopeDir: string
}

/**
 * Persist a confirmed Forge draft as a Space-scoped Skill.
 *
 * - Refuses path traversal, refuses overwrite of existing folder.
 * - Always writes `kevin.scope: space` and `kevin.risk: <risk>` defaults.
 */
export function acceptForgeDraft(input: AcceptForgeInput): AcceptedSkillRecord {
  const slug = input.name.trim()
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Invalid skill name "${input.name}": must be kebab-case slug`)
  }
  const description = input.description.trim()
  if (!description) {
    throw new Error('Skill description is required')
  }
  const scopeDir = spaceSkillsDir(input.spaceId)
  const absRoot = resolve(scopeDir)
  const absSkillDir = resolve(join(absRoot, normalize(slug)))
  if (absSkillDir !== absRoot && !absSkillDir.startsWith(`${absRoot}/`)) {
    throw new Error('Path traversal rejected')
  }
  if (existsSync(absSkillDir)) {
    throw new Error(`Skill folder already exists: ${absSkillDir}`)
  }
  mkdirSync(absSkillDir, { recursive: true })

  const risk = input.risk ?? 'low'
  const frontmatter = [
    '---',
    `name: ${slug}`,
    `description: ${description}`,
    'kevin:',
    `  scope: space`,
    `  risk: ${risk}`,
    `  triggers:`,
    `    - manual`,
    `  learning:`,
    `    enabled: true`,
    `    share: local`,
    '---',
    '',
  ].join('\n')

  const body = input.bodyMarkdown.trim() + '\n'
  const fileAbs = join(absSkillDir, 'SKILL.md')
  writeFileSync(fileAbs, `${frontmatter}${body}`, 'utf-8')

  return { absPath: fileAbs, name: slug, scopeDir }
}
