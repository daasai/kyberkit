/**
 * Feishu Doc Write Actuator (S-6) — mock sink + real diff preview.
 *
 * Per the MVP-RC plan §4 Sprint C: real Feishu MCP integration is gated by
 * external delivery. We ship a mock sink that writes to disk and returns the
 * same metadata shape the real sink will. The Diff preview rendered in the
 * Sign-off card is real (markdown line diff) regardless of sink mode, so the
 * UX/audit/sign-off chain is exercised end-to-end without network access.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export interface FeishuDocWriteInput {
  title: string
  bodyMarkdown: string
  spaceId: string
  sessionId: string
  /** Optional Feishu folder/group token; ignored by the mock. */
  parentToken?: string
}

export interface FeishuDocWriteResult {
  mocked: boolean
  docId: string
  url: string
  absPath: string
  network: 'mocked' | 'live'
}

export interface PreviewDiffInput {
  prior: string
  next: string
}

export interface PreviewDiffResult {
  added: string[]
  removed: string[]
  /** Unified-style preview, mostly for inline rendering. */
  preview: string
}

/**
 * Compute a simple line-level diff between prior and next markdown body.
 * Anchored, position-agnostic: we treat each line as a member and report
 * what's added vs removed. This is intentionally minimal — the Sign-off
 * card is the consumer; rich syntax highlighting comes later.
 */
export function previewFeishuDocDiff(input: PreviewDiffInput): PreviewDiffResult {
  const priorLines = input.prior ? input.prior.split(/\r?\n/) : []
  const nextLines = input.next ? input.next.split(/\r?\n/) : []
  const priorSet = new Map<string, number>()
  for (const line of priorLines) {
    priorSet.set(line, (priorSet.get(line) ?? 0) + 1)
  }
  const added: string[] = []
  for (const line of nextLines) {
    const count = priorSet.get(line) ?? 0
    if (count > 0) {
      priorSet.set(line, count - 1)
    } else if (line.length > 0) {
      added.push(line)
    }
  }
  const removed: string[] = []
  for (const [line, count] of priorSet.entries()) {
    if (line.length === 0) continue
    for (let i = 0; i < count; i++) removed.push(line)
  }
  const preview = [
    ...removed.map((l) => `- ${l}`),
    ...added.map((l) => `+ ${l}`),
  ].join('\n')
  return { added, removed, preview }
}

export interface RunFeishuMockOptions {
  /** Directory the mock sink writes to (defaults to ${KEVIN_NODE_ROOT}/audit/feishu-mock/). */
  mockDir: string
}

/**
 * Mock execution: writes the doc to disk so reviewers can inspect what the
 * real Feishu MCP would have published. Returns Feishu-shaped metadata.
 */
export function runFeishuDocWriteMock(
  input: FeishuDocWriteInput,
  opts: RunFeishuMockOptions,
): FeishuDocWriteResult {
  mkdirSync(opts.mockDir, { recursive: true })
  const docId = `mock-doc-${randomUUID().slice(0, 8)}`
  const fileName = `${docId}.md`
  const absPath = join(opts.mockDir, fileName)
  const headedBody = `<!--\n${JSON.stringify(
    {
      docId,
      title: input.title,
      spaceId: input.spaceId,
      sessionId: input.sessionId,
      mocked: true,
      writtenAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n-->\n# ${input.title}\n\n${input.bodyMarkdown.trim()}\n`
  writeFileSync(absPath, headedBody, 'utf-8')
  return {
    mocked: true,
    docId,
    url: `https://feishu.example.invalid/docx/${docId}`,
    absPath,
    network: 'mocked',
  }
}
