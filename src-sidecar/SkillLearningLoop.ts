/**
 * Kevin v1.5 — Skill LearningLoop Layer 1 (style notes).
 *
 * Layer 1 mechanic per PRD §12.4.1:
 *   1. After a Skill execution, diff (original output) vs (user-edited output).
 *   2. Append the diff (or hand-written note) to `<skillRoot>/learning/style-notes.md`.
 *   3. On next L2 load of the same Skill, the notes block is composed into the
 *      effective system prompt.
 *
 * Layer 2 (Fork) is intentionally out of scope (deferred to v1.5.1 — see plan §3 L-1).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs'
import { dirname, join } from 'path'
import { spaceSkillsDir, userSkillsDir } from '../src/runtime/paths/PathResolver.js'

/** Hard cap to prevent style-notes from growing unboundedly. */
export const MAX_STYLE_NOTES_BYTES = 64 * 1024

const HEADER = '# Layer 1 — User Style Notes\n\n_Auto-collected from your edits. Edit freely._\n\n'

interface SkillLocation {
  skillRoot: string
}

function findSkillRoot(spaceId: string, skillName: string, userId = 'default'): SkillLocation | null {
  const candidates = [
    join(spaceSkillsDir(spaceId), skillName),
    join(userSkillsDir(userId), skillName),
  ]
  for (const root of candidates) {
    if (existsSync(join(root, 'SKILL.md'))) {
      return { skillRoot: root }
    }
  }
  return null
}

export function readStyleNotesPath(
  spaceId: string,
  skillName: string,
  userId = 'default',
): string | null {
  const loc = findSkillRoot(spaceId, skillName, userId)
  if (!loc) return null
  return join(loc.skillRoot, 'learning', 'style-notes.md')
}

export function loadStyleNotes(
  spaceId: string,
  skillName: string,
  userId = 'default',
): string {
  const p = readStyleNotesPath(spaceId, skillName, userId)
  if (!p || !existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}

export interface AppendStyleNoteInput {
  spaceId: string
  skillName: string
  note: string
  userId?: string
}

export function appendStyleNote(input: AppendStyleNoteInput): void {
  const loc = findSkillRoot(input.spaceId, input.skillName, input.userId)
  if (!loc) {
    throw new Error(`Skill not found: ${input.skillName}`)
  }
  const learningDir = join(loc.skillRoot, 'learning')
  mkdirSync(learningDir, { recursive: true })
  const file = join(learningDir, 'style-notes.md')
  if (!existsSync(file)) {
    writeFileSync(file, HEADER, 'utf-8')
  }
  const stamp = new Date().toISOString()
  const entry = `\n## ${stamp}\n\n${input.note.trim()}\n`
  appendFileSync(file, entry, 'utf-8')

  // Rolling cap: trim from the start (preserve header) when over budget.
  rollIfNeeded(file)
}

function rollIfNeeded(file: string): void {
  let raw: string
  try {
    raw = readFileSync(file, 'utf-8')
  } catch {
    return
  }
  if (Buffer.byteLength(raw, 'utf-8') <= MAX_STYLE_NOTES_BYTES) return

  // Keep header + tail; we trim oldest entries past the byte budget.
  const headerEnd = raw.indexOf('\n## ')
  const header = headerEnd === -1 ? HEADER : raw.slice(0, headerEnd + 1)
  const body = headerEnd === -1 ? raw.slice(HEADER.length) : raw.slice(headerEnd + 1)

  // Slice from the right keeping budget - header.
  const budget = MAX_STYLE_NOTES_BYTES - Buffer.byteLength(header, 'utf-8')
  const trimmedBody = sliceFromRight(body, budget)
  // Re-anchor on the next `## ` so we don't start mid-entry.
  const startIdx = trimmedBody.indexOf('## ')
  const safeBody = startIdx === -1 ? '' : trimmedBody.slice(startIdx)

  writeFileSync(file, `${header}${safeBody}`, 'utf-8')
}

function sliceFromRight(text: string, budget: number): string {
  const buf = Buffer.from(text, 'utf-8')
  if (buf.byteLength <= budget) return text
  return buf.slice(buf.byteLength - budget).toString('utf-8')
}

export interface RecordSkillEditDiffInput {
  spaceId: string
  skillName: string
  original: string
  edited: string
  userId?: string
}

/**
 * Records a "user edited the artifact" diff as a style note.
 *
 * MVP scope: stores both halves verbatim (LLM diff summarisation is left to a
 * follow-up that already has model access — keeping the loop side-effect free).
 */
export function recordSkillEditDiff(input: RecordSkillEditDiffInput): void {
  const note = [
    '_User edited the agent output. Original below; edited follows._',
    '',
    '### Original',
    '',
    '```',
    input.original.slice(0, 4000),
    '```',
    '',
    '### Edited',
    '',
    '```',
    input.edited.slice(0, 4000),
    '```',
  ].join('\n')
  appendStyleNote({
    spaceId: input.spaceId,
    skillName: input.skillName,
    note,
    userId: input.userId,
  })
}

/**
 * Compose a Skill's effective body (raw + style notes) for L2 disclosure.
 * Callers (e.g. PromptAssembler / Sidecar message handler) use this when
 * actually injecting Skill content into the model.
 */
export function composeSkillBody(rawBody: string, styleNotes: string): string {
  const trimmed = styleNotes.trim()
  if (!trimmed) return rawBody
  return `${rawBody.trimEnd()}\n\n${trimmed}\n`
}

/**
 * Convenience: read style notes and compose with provided body in one call.
 * Used by the Sidecar `/skills/:name` route to surface the augmented body.
 */
export function loadComposedSkillBody(
  spaceId: string,
  skillName: string,
  rawBody: string,
  userId = 'default',
): string {
  const notes = loadStyleNotes(spaceId, skillName, userId)
  return composeSkillBody(rawBody, notes)
}

// Quiet unused-import warnings if dirname isn't used elsewhere.
void dirname
