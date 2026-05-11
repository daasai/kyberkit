/**
 * Skill Forge — server-side LLM distillation into a save-ready SKILL draft.
 *
 * Uses Anthropic Messages API (same key as Kevin). Intended to be cheap/fast
 * via Haiku by default (override with KYBER_FORGE_MODEL).
 */

import Anthropic from '@anthropic-ai/sdk'
import { loadConfig } from '../src/config/ConfigLoader.js'
import { applyUserConfigToEnv } from '../src/runtime/config/UserConfigStore.js'
import type { ForgeDraft } from './SkillForge.js'
import { slugify } from './SkillForge.js'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const MAX_PLAIN = 100_000
const MAX_ARTIFACT = 120_000
const FORGE_MODEL = () =>
  process.env.KYBER_FORGE_MODEL?.trim() || 'claude-haiku-35-20241022'

export interface ForgeDistillInput {
  userMessage: string
  assistantPlain: string
  assistantArtifact: string
  seed: ForgeDraft
}

export type ForgeDistillOutcome =
  | { ok: true; draft: ForgeDraft }
  | { ok: false; reason: string; draft: ForgeDraft }

/** Map Anthropic / network failures to a short UI-safe string (no raw JSON blobs). */
export function classifyForgeDistillError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  const one = raw.replace(/\s+/g, ' ').trim()
  if (/invalid x-api-key|authentication_error|"type":"error".*401|status:\s*401|\b401\b/.test(one)) {
    return 'auth_401'
  }
  if (/429|rate_limit|too many requests/i.test(one)) return 'rate_limit'
  if (/529|overloaded|unavailable/i.test(one)) return 'overloaded'
  return one.length > 220 ? `${one.slice(0, 220)}…` : one
}

function clip(label: string, text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}\n\n<!-- ${label}: truncated for distill context cap -->\n`
}

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim()
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/im)
  const body = fence ? fence[1].trim() : trimmed
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  return body.slice(start, end + 1)
}

/** Exported for unit tests — parses model output into raw fields. */
export function parseForgeDistillJson(text: string): {
  suggestedName: string
  suggestedDescription: string
  bodyMarkdown: string
} | null {
  const jsonStr = extractJsonObject(text)
  if (!jsonStr) return null
  try {
    const o = JSON.parse(jsonStr) as Record<string, unknown>
    const suggestedName = typeof o.suggestedName === 'string' ? o.suggestedName.trim() : ''
    const suggestedDescription =
      typeof o.suggestedDescription === 'string' ? o.suggestedDescription.trim() : ''
    const bodyMarkdown = typeof o.bodyMarkdown === 'string' ? o.bodyMarkdown.trim() : ''
    if (!suggestedName || !suggestedDescription || !bodyMarkdown) return null
    return { suggestedName, suggestedDescription, bodyMarkdown }
  } catch {
    return null
  }
}

function normalizeKebabSlug(raw: string): string {
  let s = slugify(raw)
  if (!s) s = `skill-${Date.now().toString(36)}`
  if (s.length > 64) s = s.slice(0, 64).replace(/-+$/g, '')
  if (!SLUG_RE.test(s)) {
    s = `skill-${Date.now().toString(36)}`
  }
  return s
}

const SYSTEM = `You distill one chat turn into a reusable Kevin Space Skill (SKILL.md body only — no YAML frontmatter).

Output a single JSON object with exactly these keys (no markdown fences, no extra keys):
- "suggestedName": string, kebab-case [a-z0-9-]+, max 48 chars, specific to this workflow (not "untitled-skill").
- "suggestedDescription": string, 1–4 sentences (Chinese or English), when this skill should run and what it achieves.
- "bodyMarkdown": string, Markdown for the SKILL file BODY (after frontmatter). Must be actionable and self-contained.

bodyMarkdown MUST include:
1. A "## 何时使用" or "## When to use" section grounded in the user's request.
2. A "## 步骤" or "## Steps" section with numbered steps reconstructed ONLY from the assistant turn (tools, paths, order). If the assistant listed tools or directories, preserve them literally.
3. If information is missing, add "## 假设与缺口" listing what is unknown instead of inventing facts.

Do not repeat YAML. Do not wrap the JSON in code fences.`

export async function distillForgeDraftWithLlm(input: ForgeDistillInput): Promise<ForgeDistillOutcome> {
  const seed = input.seed
  const plain = clip('assistant_plain', input.assistantPlain, MAX_PLAIN)
  const art = clip('assistant_artifact', input.assistantArtifact, MAX_ARTIFACT)
  if (!plain && !art) {
    return { ok: false, reason: 'empty_context', draft: seed }
  }

  // Align with KyberRuntime: merge encrypted user config into env when env is empty, then read via loadConfig().
  applyUserConfigToEnv('default')
  let apiKey = ''
  let baseUrl: string | undefined
  try {
    const kconf = await loadConfig()
    apiKey = (kconf.model.apiKey ?? '').trim()
    baseUrl = kconf.model.baseUrl?.trim() || undefined
  } catch {
    apiKey = ''
  }
  if (!apiKey) {
    return { ok: false, reason: 'no_api_key', draft: seed }
  }

  const client = new Anthropic({ apiKey, baseURL: baseUrl })

  const userBlock = [
    `Trigger kind: ${seed.trigger}`,
    '',
    '--- USER MESSAGE ---',
    input.userMessage.trim() || '(empty)',
    '',
    '--- ASSISTANT (plain reply, outside artifact) ---',
    plain || '(none)',
    '',
    '--- ASSISTANT (artifact / long-form document if any) ---',
    art || '(none)',
    '',
    '--- SEED (fallback if you must reuse wording) ---',
    `name hint: ${seed.suggestedName}`,
    `description hint: ${seed.suggestedDescription}`,
    `body hint:\n${seed.bodySeed}`,
  ].join('\n')

  try {
    const msg = await client.messages.create({
      model: FORGE_MODEL(),
      max_tokens: 8192,
      temperature: 0.2,
      system: SYSTEM,
      messages: [{ role: 'user', content: userBlock }],
    })

    let textOut = ''
    for (const b of msg.content) {
      if (b.type === 'text') textOut += b.text
    }

    const parsed = parseForgeDistillJson(textOut)
    if (!parsed) {
      return { ok: false, reason: 'parse_error', draft: seed }
    }

    const name = normalizeKebabSlug(parsed.suggestedName)
    const desc = parsed.suggestedDescription.slice(0, 4000)
    let body = parsed.bodyMarkdown.slice(0, 100_000)
    if (body.length < 80) {
      body = `${seed.bodySeed.trim()}\n\n---\n\n${body}`
    }

    const draft: ForgeDraft = {
      ...seed,
      suggestedName: name,
      suggestedDescription: desc,
      bodySeed: body.endsWith('\n') ? body : `${body}\n`,
    }
    return { ok: true, draft }
  } catch (e) {
    return { ok: false, reason: classifyForgeDistillError(e), draft: seed }
  }
}
