/**
 * Kevin Sidecar — Bun HTTP/SSE Server (Sprint 3 Multi-Session Edition)
 *
 * Routes:
 *   GET  /health                       → health check
 *   GET  /spaces                      → list Spaces from Space–Library registry
 *   PATCH /registry/spaces/:id        → rename Space (displayName)
 *   DELETE /registry/spaces/:id        → remove Space binding + library session DB
 *   POST /registry/pick-mount        → native folder dialog → absolute path (local Sidecar)
 *   GET  /sessions                     → list all sessions
 *   POST /sessions                     → create new session
 *   GET  /sessions/:id                 → get session details (with artifact)
 *   DELETE /sessions/:id               → delete session
 *   POST /sessions/:id/messages        → send message (SSE stream)
 *   POST /chat (deprecated)            → legacy, routes to default session
 */

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'
import { dirname, join as pathJoin, resolve as resolvePath } from 'path'
import { KyberRuntime } from '../src/runtime/KyberRuntime.js'
import { SessionManager } from './SessionManager.js'
import { ArtifactParser } from './ArtifactParser.js'
import { summarizeArtifactMarkdown } from './artifactSummary.js'
import {
  dbCountAllSessions,
  dbInsertSessionSavedArtifact,
  dbListAllSessionsInSpace,
  dbListChatMessages,
  dbListSessionSavedArtifacts,
  dbPersistChatTurn,
  evictLibraryDatabase,
} from './db.js'
import type { SavedArtifactFile, SessionScope } from './SessionManager.js'
import {
  attachSkillSuggestedRuntimeBridge,
  createSpaceEventBroadcaster,
  subscribeSpaceEvents,
} from './spaceEventBroadcast.js'
import { TaskManager } from './TaskManager.js'
import { CronScheduler } from './CronScheduler.js'
import { makeCronOnTrigger, syncCronForSpace } from './cronBridge.js'
import { appendAudit, kevinAuditDir } from '../src/runtime/audit/AuditLogger.js'
import { previewFeishuDocDiff, runFeishuDocWriteMock } from './actuators/feishuDocWrite.js'
import {
  extractTextFromBinaryFile,
  isBinaryExtractablePath,
} from '../src/util/binaryFileExtract.js'
import {
  ensureKevinLayout,
  isUuidString,
  libraryTechRoot,
  listRegistrySpaces,
  listSpaceDocsTree,
  readSpaceLibraryRegistry,
  removeSpaceLibraryBinding,
  resolveSpaceToLibrary,
  updateSpaceLibraryDisplayName,
  upsertSpaceLibraryBinding,
} from '../src/runtime/paths/PathResolver.js'
import { pickLocalDirectoryWithDialog } from './pickLocalFolder.js'
import { searchLibraryFiles } from './librarySearch.js'
import {
  loadUserConfig,
  saveUserConfig,
  applyUserConfigToEnv,
  forceApplyUserConfigToEnv,
} from '../src/runtime/config/UserConfigStore.js'
import { broadcastConfigChanged, subscribeConfigSse } from './configBroadcast.js'
import { readProfile, writeProfile } from '../src/runtime/paths/PathResolver.js'
import { loadSkillFull, scanSkillsForSpace } from './SkillScanner.js'
import { acceptForgeDraft, suggestForgeDraft } from './SkillForge.js'
import { distillForgeDraftWithLlm } from './forgeDistillLlm.js'
import {
  appendStyleNote,
  composeSkillBody,
  loadStyleNotes,
  recordSkillEditDiff,
} from './SkillLearningLoop.js'
import { promoteSpaceSkillToUser, copyUserSkillToSpace } from './skillTierOps.js'

/** Optional dotenv-style file (Tauri sets `KYBERKIT_ENV_FILE` in release). Does not override existing env. */
async function applyKevinEnvFile(): Promise<void> {
  const p = process.env.KYBERKIT_ENV_FILE?.trim()
  if (!p) return
  const f = Bun.file(p)
  if (!(await f.exists())) return
  const text = await f.text()
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const ix = t.indexOf('=')
    if (ix <= 0) continue
    const key = t.slice(0, ix).trim()
    if (!key || process.env[key]) continue
    let val = t.slice(ix + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

await applyKevinEnvFile()
ensureKevinLayout()

const PORT = 3001
const startedAt = Date.now()
/** Library 文件预览与上传的单文件大小上限（与 PRD 对齐：5MiB）。 */
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  // PATCH: session pin/archive and other partial updates from the web UI (cross-origin preflight).
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

type ConnectorStatus = {
  name: string
  status: 'healthy' | 'error'
  lastSuccess: string
  source: 'live'
}

function listConnectorStatuses(): ConnectorStatus[] {
  const hasDwConfig = Boolean(
    process.env.BEEYI_DW_BASE_URL?.trim() &&
    process.env.BEEYI_DW_TOKEN?.trim()
  )

  return [
    {
      name: '贝易转 DW',
      status: hasDwConfig ? 'healthy' : 'error',
      lastSuccess: hasDwConfig ? '刚刚' : '未配置',
      source: 'live',
    },
  ]
}

// Merge GUI-persisted API key into env when .env has none (same source KyberRuntime / Forge use).
applyUserConfigToEnv('default')
console.log('[Kevin Sidecar] Bootstrapping KyberKit Runtime...')
const runtime = new KyberRuntime()
await runtime.bootstrap()
const spaceEventBroadcaster = createSpaceEventBroadcaster()
attachSkillSuggestedRuntimeBridge(runtime.getBus(), spaceEventBroadcaster)

const manager = new SessionManager(runtime)
const taskManager = new TaskManager()
const signoffStartedAt = new Map<string, number>()
const cronScheduler = new CronScheduler({ onTrigger: makeCronOnTrigger(taskManager) })
const cronSyncedSpaces = new Set<string>()
function ensureCronSynced(spaceId: string): void {
  if (cronSyncedSpaces.has(spaceId)) return
  try {
    syncCronForSpace(cronScheduler, spaceId)
    cronSyncedSpaces.add(spaceId)
  } catch (err) {
    console.error(`[Kevin Sidecar] cron sync failed for space ${spaceId.slice(0, 8)}:`, err)
  }
}
for (const s of listRegistrySpaces()) {
  ensureCronSynced(s.id)
}
console.log('[Kevin Sidecar] SessionManager + TaskManager + CronScheduler ready.')

const DEFAULT_MODEL = process.env.KYBER_MODEL_NAME?.trim() || 'claude-sonnet-4-20250514'

function modelChoices(defaultModel: string): string[] {
  const fromEnv = process.env.KYBER_MODEL_LIST
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? []
  return Array.from(new Set([defaultModel, ...fromEnv]))
}

function readConfigPayload() {
  const user = loadUserConfig('default')
  const profile = readProfile('default')
  const modelDefault = DEFAULT_MODEL
  const modelList = modelChoices(modelDefault)
  const modelName = user.modelName?.trim() || modelDefault
  const baseUrl = user.baseUrl?.trim() || null
  return {
    onboardingComplete: Boolean(profile.onboardingComplete),
    libraryConfigured: readSpaceLibraryRegistry().length > 0,
    modelList,
    modelDefault,
    user: {
      apiKeyConfigured: Boolean(user.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
      modelName,
      baseUrl,
    },
  }
}

function createSpaceLibraryBinding(input: {
  mountPath?: string
  displayName?: string
}): { ok: true; payload: Record<string, unknown> } | { ok: false; status: number; error: string } {
  const raw = input.mountPath?.trim()
  if (!raw) return { ok: false, status: 400, error: 'mountPath is required' }
  let absMount: string
  try {
    absMount = resolvePath(raw)
  } catch {
    return { ok: false, status: 400, error: 'invalid mountPath' }
  }
  try {
    const st = statSync(absMount)
    if (!st.isDirectory()) return { ok: false, status: 400, error: 'mountPath must be a directory' }
  } catch {
    mkdirSync(absMount, { recursive: true })
  }
  const spaceId = randomUUID()
  const libraryId = randomUUID()
  const displayName = input.displayName?.trim() || 'Library'
  mkdirSync(libraryTechRoot(libraryId), { recursive: true })
  upsertSpaceLibraryBinding({
    spaceId,
    libraryId,
    mountPath: absMount,
    displayName,
  })
  return {
    ok: true,
    payload: {
      spaceId,
      libraryId,
      mountPath: absMount,
      displayName,
    },
  }
}

function resolveScopeFromUrl(url: URL): { scope: SessionScope | null; error?: string; status?: number } {
  const spaceId = url.searchParams.get('space_id')?.trim()
  if (!spaceId) return { scope: null, error: 'space_id is required', status: 400 }
  if (!isUuidString(spaceId)) {
    return { scope: null, error: 'space_id must be a UUID', status: 400 }
  }
  const binding = resolveSpaceToLibrary(spaceId)
  if (!binding) return { scope: null, error: 'Space has no bound library yet', status: 404 }
  return {
    scope: { spaceId: binding.spaceId, libraryId: binding.libraryId, mountPath: binding.mountPath },
  }
}

function parseSelectedLibraryDirRef(scope: SessionScope, raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const v = raw.trim()
  if (!v) return ''
  const prefix = `@/libraries/${scope.libraryId}`
  if (v === prefix) return ''
  if (!v.startsWith(`${prefix}/`)) return ''
  const rel = v.slice(prefix.length + 1).replaceAll('\\', '/').replace(/^\/+/, '')
  if (!rel || rel.includes('..')) return ''
  return rel
}

/** One-turn prompt hint: UI 「文档库」selection → preferred relative write parent. */
function recordSessionSavedArtifact(
  libraryId: string,
  sessionId: string,
  artifactId: string | null,
  saved: SavedArtifactFile | null,
  summary: string,
): void {
  if (!saved || !artifactId) return
  try {
    dbInsertSessionSavedArtifact(libraryId, {
      id: artifactId,
      session_id: sessionId,
      library_relative_path: saved.relativePath,
      summary: summary.slice(0, 500),
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.warn('[Sidecar] session_saved_artifacts insert failed:', e)
  }
}

function buildLibraryUiTurnHint(selectedRelFromMount: string): string {
  const rel = selectedRelFromMount.replaceAll('\\', '/').replace(/^\/+/, '')
  if (rel) {
    return [
      '## 本轮 — 文档库选中位置',
      '',
      `用户在左侧「文档库」树里**当前选中的文件夹**（相对 Library 根）: \`${rel}\``,
      `- 若用户只说「写入/保存到文档库」「放进资料库」而未给具体路径，**优先**把新文件写到: \`${rel}/<合适文件名>.md\`（可按正文标题命名）。`,
    ].join('\n')
  }
  return [
    '## 本轮 — 文档库选中位置',
    '',
    '- 用户当前未选中具体子文件夹（或停在 Library 根）。写入「文档库」时，将新文件放在相对根目录的合理路径（例如 `./文件名.md` 或既有子目录下）。',
  ].join('\n')
}

function parseLibraryFileRef(scope: SessionScope, raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v) return null
  const prefix = `@/libraries/${scope.libraryId}/`
  if (!v.startsWith(prefix)) return null
  const rel = v.slice(prefix.length).replaceAll('\\', '/').replace(/^\/+/, '')
  if (!rel || rel.includes('..')) return null
  return rel
}

function isLikelyBinary(buf: Uint8Array): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096))
  for (const b of sample) {
    if (b === 0) return true
  }
  return false
}

const MAX_LIBRARY_WRITE_BYTES = 10 * 1024 * 1024

function isMarkdownLibraryRel(rel: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(rel)
}

/** Open a file with the OS default viewer (Preview, Word, etc.). Sidecar runs locally next to the library mount. */
function tryOpenPathInSystemViewer(absPath: string): { ok: boolean; error?: string } {
  try {
    const platform = process.platform
    let result: ReturnType<typeof spawnSync>
    if (platform === 'darwin') {
      result = spawnSync('open', [absPath], { stdio: 'ignore' })
    } else if (platform === 'win32') {
      result = spawnSync('cmd', ['/c', 'start', '', absPath], { stdio: 'ignore', shell: true })
    } else {
      result = spawnSync('xdg-open', [absPath], { stdio: 'ignore' })
    }
    if (result.error) return { ok: false, error: result.error.message }
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Create a default session if none exists (for legacy /chat compatibility)
async function ensureDefaultSession(scope: SessionScope): Promise<string> {
  const sessions = manager.list(scope)
  if (sessions.length > 0) return sessions[0].id
  const s = await manager.create(scope)
  return s.id
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // ── Health ────────────────────────────────────────────────────────────────
    if (path === '/health' && req.method === 'GET') {
      return json({
        status: 'ok',
        version: '0.3.0',
        sessions: dbCountAllSessions(),
        sessionCount: dbCountAllSessions(),
        // RS-10 explicit status for MCP filesystem root handling.
        mcpRootMode: 'deferred',
        uptimeMs: Date.now() - startedAt,
      })
    }

    // ── Config (GUI onboarding/settings) ─────────────────────────────────────
    if (path === '/config' && req.method === 'GET') {
      return json(readConfigPayload())
    }

    if (path === '/config/validate' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        anthropicApiKey?: string
        modelName?: string
      }
      const key = body.anthropicApiKey?.trim() ?? ''
      const modelName = body.modelName?.trim() ?? ''
      if (!key) return json({ ok: false, error: 'API Key 不能为空' }, 400)
      if (!modelName) return json({ ok: false, error: '模型不能为空' }, 400)
      return json({ ok: true })
    }

    if (path === '/config' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        anthropicApiKey?: string
        modelName?: string
        baseUrl?: string
        onboardingComplete?: boolean
      }
      const prev = loadUserConfig('default')
      const next = {
        anthropicApiKey: body.anthropicApiKey?.trim() || prev.anthropicApiKey || '',
        modelName: body.modelName?.trim() || prev.modelName || DEFAULT_MODEL,
        baseUrl: body.baseUrl?.trim() || prev.baseUrl || '',
      }
      saveUserConfig('default', next)
      forceApplyUserConfigToEnv('default')
      if (typeof body.onboardingComplete === 'boolean') {
        writeProfile('default', { onboardingComplete: body.onboardingComplete })
      }
      broadcastConfigChanged()
      return json({ ok: true, config: readConfigPayload() })
    }

    if (path === '/events/config' && req.method === 'GET') {
      const stream = new ReadableStream({
        start(controller) {
          const send = (line: string) => {
            controller.enqueue(new TextEncoder().encode(line))
          }
          // handshake for EventSource
          send(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`)
          const unsubscribe = subscribeConfigSse(send)
          const ping = setInterval(() => {
            try {
              send(': ping\n\n')
            } catch {
              /* ignore */
            }
          }, 15000)
          req.signal.addEventListener('abort', () => {
            clearInterval(ping)
            unsubscribe()
            try { controller.close() } catch { /* ignore */ }
          })
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        },
      })
    }

    // ── Rev3: Space list from registry (UUID Space ↔ Library) ────────────────
    if (path === '/spaces' && req.method === 'GET') {
      return json(listRegistrySpaces())
    }

    // ── Bootstrap first Space + Library + mount (onboarding) ───────────────────
    if (path === '/registry/bootstrap' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        mountPath?: string
        displayName?: string
      }
      const created = createSpaceLibraryBinding(body)
      if (!created.ok) return json({ error: created.error }, created.status)
      return json(created.payload)
    }

    // ── Create additional Space + Library + mount (post-onboarding) ───────────
    if (path === '/registry/spaces' && req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as {
        mountPath?: string
        displayName?: string
      }
      const created = createSpaceLibraryBinding(body)
      if (!created.ok) return json({ error: created.error }, created.status)
      return json(created.payload, 201)
    }

    if (path === '/registry/pick-mount' && req.method === 'POST') {
      const picked = pickLocalDirectoryWithDialog()
      if (picked.path) return json({ path: picked.path })
      if (picked.cancelled) return json({ path: null, cancelled: true })
      return json({ path: null, error: picked.error ?? 'pick failed' }, 500)
    }

    const registrySpaceIdMatch = path.match(/^\/registry\/spaces\/([^/]+)$/)
    if (registrySpaceIdMatch) {
      const rawId = registrySpaceIdMatch[1].trim()
      if (!isUuidString(rawId)) return json({ error: 'Invalid space id' }, 400)

      if (req.method === 'PATCH') {
        const body = await req.json().catch(() => ({})) as { displayName?: unknown }
        if (typeof body.displayName !== 'string') {
          return json({ error: 'displayName (string) is required' }, 400)
        }
        const updated = updateSpaceLibraryDisplayName(rawId, body.displayName)
        if (!updated) return json({ error: 'Space not found' }, 404)
        return json({
          spaceId: updated.spaceId,
          libraryId: updated.libraryId,
          mountPath: updated.mountPath,
          displayName: updated.displayName ?? null,
        })
      }

      if (req.method === 'DELETE') {
        const binding = resolveSpaceToLibrary(rawId)
        if (!binding) return json({ error: 'Space not found' }, 404)
        const scope: SessionScope = {
          spaceId: binding.spaceId,
          libraryId: binding.libraryId,
          mountPath: binding.mountPath,
        }
        const sessionRows = dbListAllSessionsInSpace(binding.libraryId, binding.spaceId)
        for (const row of sessionRows) {
          await manager.delete(scope, row.id)
        }
        evictLibraryDatabase(binding.libraryId)
        removeSpaceLibraryBinding(rawId)
        cronScheduler.syncFromSkills(rawId, [])
        cronSyncedSpaces.delete(rawId)
        return json({ ok: true })
      }
    }

    // ── Connectors status (live aggregation) ──────────────────────────────────
    if (path === '/connectors' && req.method === 'GET') {
      return json(listConnectorStatuses())
    }

    // ── Skill registry — L1 directory & L2 full ───────────────────────────────
    if (path === '/skills' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      ensureCronSynced(scope.scope.spaceId)
      const list = scanSkillsForSpace(scope.scope.spaceId).map((s) => ({
        name: s.name,
        description: s.description,
        scope: s.scope,
        risk: s.risk,
        allowedTools: s.allowedTools,
        triggers: s.triggers,
        cron: s.cron ?? null,
      }))
      return json(list)
    }

    const skillFullMatch = path.match(/^\/skills\/([a-z0-9][a-z0-9-]*)\/full$/)
    if (skillFullMatch && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const full = loadSkillFull(scope.scope.spaceId, skillFullMatch[1])
      if (!full) return json({ error: 'Skill not found' }, 404)
      return json({
        name: full.name,
        description: full.description,
        body: full.body,
        scope: full.scope,
        risk: full.risk,
      })
    }

    // ── Cron — explicit re-sync (called after forge/promote/edit) ─────────────
    if (path === '/cron/sync' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const entries = syncCronForSpace(cronScheduler, scope.scope.spaceId)
      cronSyncedSpaces.add(scope.scope.spaceId)
      return json({ ok: true, jobs: entries })
    }

    if (path === '/cron/jobs' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const sid = scope.scope.spaceId
      ensureCronSynced(sid)
      return json(cronScheduler.list().filter((j) => j.spaceId === sid))
    }

    const skillDetailMatch = path.match(/^\/skills\/([a-z0-9][a-z0-9-]*)$/)
    if (skillDetailMatch && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const full = loadSkillFull(scope.scope.spaceId, skillDetailMatch[1])
      if (!full) return json({ error: 'Skill not found' }, 404)
      // L2 disclosure composes raw body + Layer 1 style notes (PRD §12.4.1).
      const styleNotes = loadStyleNotes(scope.scope.spaceId, full.name)
      const composedBody = composeSkillBody(full.body, styleNotes)
      return json({
        name: full.name,
        description: full.description,
        scope: full.scope,
        risk: full.risk,
        allowedTools: full.allowedTools,
        triggers: full.triggers,
        body: composedBody,
        rawBody: full.body,
        styleNotes,
        frontmatter: full.frontmatter,
        absPath: full.absPath,
      })
    }

    // ── Forge — P0 trigger detection (suggest a draft) ────────────────────────
    if (path === '/skills/forge/suggest' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        message?: string
        /** Full assistant text outside streamed artifact blocks (preferred for distill). */
        assistantPlain?: string
        /** Full final artifact markdown (preferred). */
        assistantArtifact?: string
        /** @deprecated Combined blob; used if plain/artifact absent. */
        assistantSummary?: string
      }
      const plain = (body.assistantPlain ?? '').trim()
      const artifact = (body.assistantArtifact ?? '').trim()
      const legacy = (body.assistantSummary ?? '').trim()
      const summaryForTrigger = [plain, artifact, legacy].filter(Boolean).join('\n\n').slice(0, 12_000)

      const draft = suggestForgeDraft({
        message: body.message ?? '',
        assistantSummary: summaryForTrigger || undefined,
      })
      if (!draft) return json({ trigger: null }, 200)

      const assistantPlain = plain || legacy
      const assistantArtifact = artifact
      if (!assistantPlain.trim() && !assistantArtifact.trim()) {
        return json({
          ...draft,
          distilled: false,
          distillError: 'no_assistant_content',
        })
      }

      const dist = await distillForgeDraftWithLlm({
        userMessage: body.message ?? '',
        assistantPlain,
        assistantArtifact,
        seed: draft,
      })
      return json({
        ...dist.draft,
        distilled: dist.ok,
        distillError: dist.ok ? undefined : dist.reason,
      })
    }

    // ── Forge — accept (write SKILL.md to Space tier) ─────────────────────────
    if (path === '/skills/forge/accept' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        name?: string
        description?: string
        body?: string
        risk?: 'low' | 'medium' | 'high'
      }
      try {
        const written = acceptForgeDraft({
          spaceId: scope.scope.spaceId,
          name: body.name ?? '',
          description: body.description ?? '',
          bodyMarkdown: body.body ?? '',
          risk: body.risk,
        })
        syncCronForSpace(cronScheduler, scope.scope.spaceId)
        return json({ ok: true, name: written.name, absPath: written.absPath }, 201)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({ error: msg }, 400)
      }
    }

    // ── LearningLoop Layer 1 — record edit diff (Sidecar callable) ────────────
    if (path === '/skills/learning/diff' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        skillName?: string
        original?: string
        edited?: string
      }
      if (!body.skillName) return json({ error: 'skillName is required' }, 400)
      try {
        recordSkillEditDiff({
          spaceId: scope.scope.spaceId,
          skillName: body.skillName,
          original: body.original ?? '',
          edited: body.edited ?? '',
        })
        return json({ ok: true })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400)
      }
    }

    // ── LearningLoop Layer 1 — append a manual style note ─────────────────────
    if (path === '/skills/learning/note' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        skillName?: string
        note?: string
      }
      if (!body.skillName || !body.note) {
        return json({ error: 'skillName and note are required' }, 400)
      }
      try {
        appendStyleNote({
          spaceId: scope.scope.spaceId,
          skillName: body.skillName,
          note: body.note,
        })
        return json({ ok: true })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400)
      }
    }

    // ── Async tasks (S-8 / Sprint D will populate triggers) ───────────────────
    if (path === '/tasks' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      return json(taskManager.list(scope.scope.spaceId))
    }

    if (path === '/tasks' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        skillName?: string
        triggerKind?: string
        payload?: unknown
      }
      const row = taskManager.createTask(scope.scope.spaceId, {
        skill_name: body.skillName,
        trigger_kind: body.triggerKind,
        payload: body.payload,
      })
      return json(row, 201)
    }

    // ── Sign-off — request (Feishu actuator entry point) ──────────────────────
    if (path === '/signoff/request' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        actuatorId?: string
        title?: string
        bodyMarkdown?: string
        priorBodyMarkdown?: string
        sessionId?: string
        skillName?: string
      }
      const actuatorId = body.actuatorId ?? 'artifact.feishu-doc.write'
      const diff = previewFeishuDocDiff({
        prior: body.priorBodyMarkdown ?? '',
        next: body.bodyMarkdown ?? '',
      })
      const task = taskManager.createSignoffTask(scope.scope.spaceId, {
        skill_name: body.skillName ?? actuatorId,
        payload: {
          actuatorId,
          title: body.title,
          diff,
          bodyMarkdown: body.bodyMarkdown,
          priorBodyMarkdown: body.priorBodyMarkdown,
          sessionId: body.sessionId,
        },
      })
      signoffStartedAt.set(task.id, Date.now())
      appendAudit({
        userId: 'default',
        spaceId: scope.scope.spaceId,
        sessionId: body.sessionId,
        taskId: task.id,
        skillName: body.skillName,
        actuatorId,
        riskLevel: 'medium',
        targetSummary: body.title,
        decision: 'pending',
      })
      return json({ task, diff }, 202)
    }

    // ── Sign-off — resolve (approved | rejected) ──────────────────────────────
    const signoffMatch = path.match(/^\/signoff\/([^/]+)$/)
    if (signoffMatch && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as { decision?: 'approved' | 'rejected' }
      const decision = body.decision === 'rejected' ? 'rejected' : 'approved'
      const task = taskManager.getInSpace(signoffMatch[1], scope.scope.spaceId)
      if (!task) return json({ error: 'task not found' }, 404)
      const startedAt = signoffStartedAt.get(task.id) ?? Date.now()
      const latency = Date.now() - startedAt

      let actuatorResult: unknown = null
      if (decision === 'approved') {
        const payload = task.payload ? JSON.parse(task.payload) : {}
        if (payload.actuatorId === 'artifact.feishu-doc.write') {
          actuatorResult = runFeishuDocWriteMock(
            {
              title: payload.title ?? 'Untitled',
              bodyMarkdown: payload.bodyMarkdown ?? '',
              spaceId: scope.scope.spaceId,
              sessionId: payload.sessionId ?? task.id,
            },
            { mockDir: pathJoin(kevinAuditDir(), 'feishu-mock') },
          )
        }
      }

      const next = taskManager.resolveSignoff(task.id, decision === 'approved')
      signoffStartedAt.delete(task.id)
      appendAudit({
        userId: 'default',
        spaceId: scope.scope.spaceId,
        taskId: task.id,
        skillName: task.skill_name ?? undefined,
        actuatorId: 'artifact.feishu-doc.write',
        riskLevel: 'medium',
        decision,
        signoffLatencyMs: latency,
      })
      return json({ task: next, actuatorResult, latencyMs: latency })
    }

    // ── Per-Space SSE bus (tasks, sign-off, sensors) ──────────────────────────
    if (path === '/events/space' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const spaceId = scope.scope.spaceId
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          const send = (data: unknown) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
            } catch {
              /* client disconnected */
            }
          }
          send({ type: 'connected', space_id: spaceId, ts: Date.now() })
          const unsubscribe = subscribeSpaceEvents(spaceId, send)
          const ping = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(': ping\n\n'))
            } catch {
              /* ignore */
            }
          }, 15000)
          req.signal.addEventListener('abort', () => {
            clearInterval(ping)
            unsubscribe()
            try { controller.close() } catch { /* ignore */ }
          })
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        },
      })
    }

    // ── Skill Store — promote Space → User / copy User → Space ────────────────
    if (path === '/skills/promote' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as {
        skillName?: string
        from?: 'space' | 'user'
      }
      if (!body.skillName) return json({ error: 'skillName is required' }, 400)
      const direction = body.from ?? 'space'
      try {
        if (direction === 'space') {
          await promoteSpaceSkillToUser(scope.scope.spaceId, body.skillName)
        } else {
          await copyUserSkillToSpace(body.skillName, scope.scope.spaceId)
        }
        syncCronForSpace(cronScheduler, scope.scope.spaceId)
        return json({ ok: true })
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400)
      }
    }

    // ── Space docs tree (sidebar library) ─────────────────────────────────────
    if (path === '/library/tree' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      try {
        return json(listSpaceDocsTree(scope.scope.spaceId))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({ error: msg }, 500)
      }
    }

    // ── Library full-text search (bounded scan, text-like files) ──────────────
    if (path === '/library/search' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const q = url.searchParams.get('q')?.trim() ?? ''
      if (q.length < 2) {
        return json({ error: 'q must be at least 2 characters' }, 400)
      }
      try {
        const hits = searchLibraryFiles(scope.scope, q)
        return json({ hits })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        return json({ error: msg }, 500)
      }
    }

    // ── Open library file in OS default app (PDF / Office; avoids streaming binary into UI) ──
    if (path === '/library/open-external' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as { path?: string }
      const rel = parseLibraryFileRef(scope.scope, body.path)
      if (!rel) return json({ error: 'path must be a library file ref' }, 400)
      const root = resolvePath(scope.scope.mountPath)
      const abs = resolvePath(scope.scope.mountPath, rel)
      if (!abs.startsWith(root)) return json({ error: 'path escapes library root' }, 400)
      try {
        if (!statSync(abs).isFile()) return json({ error: 'not a file' }, 400)
      } catch {
        return json({ error: 'not found' }, 404)
      }
      const opened = tryOpenPathInSystemViewer(abs)
      if (!opened.ok) return json({ error: opened.error ?? 'open failed' }, 500)
      return json({ ok: true })
    }

    // ── Write UTF-8 text to a library Markdown file (center panel Save) ───────
    if (path === '/library/write' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as { path?: string; content?: string }
      const rel = parseLibraryFileRef(scope.scope, body.path)
      if (!rel || typeof body.content !== 'string') {
        return json({ error: 'path and content (string) required' }, 400)
      }
      if (!isMarkdownLibraryRel(rel)) {
        return json({ error: 'only .md / .markdown / .mdx files can be written through this API' }, 400)
      }
      const root = resolvePath(scope.scope.mountPath)
      const abs = resolvePath(scope.scope.mountPath, rel)
      if (!abs.startsWith(root)) return json({ error: 'path escapes library root' }, 400)
      const buf = Buffer.from(body.content, 'utf-8')
      if (buf.length > MAX_LIBRARY_WRITE_BYTES) {
        return json({ error: 'content too large', maxBytes: MAX_LIBRARY_WRITE_BYTES }, 413)
      }
      try {
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, body.content, 'utf-8')
      } catch (e: unknown) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500)
      }
      return json({ ok: true, path: `@/libraries/${scope.scope.libraryId}/${rel}` })
    }

    // ── Upload file into Library (multipart: dir + file) ──────────────────────
    if (path === '/library/upload' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      let form: FormData
      try {
        form = await req.formData()
      } catch {
        return json({ error: 'invalid multipart body' }, 400)
      }
      const dirRaw = form.get('dir')
      const fileEntry = form.get('file')
      if (!(fileEntry instanceof File)) {
        return json({ error: 'multipart field "file" is required' }, 400)
      }
      if (fileEntry.size > MAX_PREVIEW_BYTES) {
        return json(
          { error: 'file too large', maxBytes: MAX_PREVIEW_BYTES, size: fileEntry.size },
          413,
        )
      }
      const rawName = (fileEntry.name || 'upload').replace(/[/\\]/g, '')
      if (!rawName || rawName === '.' || rawName === '..') {
        return json({ error: 'invalid file name' }, 400)
      }
      const relDir = parseSelectedLibraryDirRef(
        scope.scope,
        typeof dirRaw === 'string' ? dirRaw : '',
      )
      const rel = relDir ? `${relDir}/${rawName}` : rawName
      const root = resolvePath(scope.scope.mountPath)
      const abs = resolvePath(scope.scope.mountPath, rel)
      if (!abs.startsWith(root)) {
        return json({ error: 'path escapes library root' }, 400)
      }
      try {
        const buf = Buffer.from(await fileEntry.arrayBuffer())
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, buf)
      } catch (e: unknown) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500)
      }
      return json({
        ok: true,
        path: `@/libraries/${scope.scope.libraryId}/${rel}`,
      })
    }

    // ── Library file preview (text) ───────────────────────────────────────────
    if (path === '/library/file' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const rel = parseLibraryFileRef(scope.scope, url.searchParams.get('path'))
      if (!rel) return json({ error: 'path is required and must be a library ref path' }, 400)
      const abs = resolvePath(scope.scope.mountPath, rel)
      if (!abs.startsWith(resolvePath(scope.scope.mountPath))) {
        return json({ error: 'path escapes library root' }, 400)
      }
      try {
        const st = statSync(abs)
        if (!st.isFile()) return json({ error: 'not a file' }, 400)
        if (st.size > MAX_PREVIEW_BYTES) {
          return json(
            { error: 'preview_unsupported', reason: 'too_large', size: st.size, maxSize: MAX_PREVIEW_BYTES },
            413,
          )
        }
        const raw = readFileSync(abs)
        if (isBinaryExtractablePath(abs)) {
          const extracted = await extractTextFromBinaryFile(abs)
          if (extracted) {
            const cap = MAX_PREVIEW_BYTES
            const content =
              extracted.length > cap ? `${extracted.slice(0, cap)}\n\n... [truncated]` : extracted
            return json({
              path: url.searchParams.get('path'),
              content,
              extracted: true,
            })
          }
        }
        if (isLikelyBinary(raw)) {
          return json({ error: 'preview_unsupported', reason: 'binary', size: st.size }, 415)
        }
        const content = raw.toString('utf-8')
        return json({ path: url.searchParams.get('path'), content })
      } catch {
        return json({ error: 'preview_unsupported', reason: 'unreadable' }, 415)
      }
    }

    // ── Move/rename file under Library mount (artifact archive UX) ────────────
    if (path === '/library/move' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const body = (await req.json().catch(() => ({}))) as { fromPath?: string; toPath?: string }
      const fromRel = parseLibraryFileRef(scope.scope, body.fromPath)
      const toRel = parseLibraryFileRef(scope.scope, body.toPath)
      if (!fromRel || !toRel) {
        return json({ error: 'fromPath and toPath must be @/libraries/<libraryId>/… refs' }, 400)
      }
      const root = resolvePath(scope.scope.mountPath)
      const fromAbs = resolvePath(scope.scope.mountPath, fromRel)
      const toAbs = resolvePath(scope.scope.mountPath, toRel)
      if (!fromAbs.startsWith(root) || !toAbs.startsWith(root)) {
        return json({ error: 'path escapes library root' }, 400)
      }
      try {
        if (!statSync(fromAbs).isFile()) return json({ error: 'source is not a file' }, 400)
      } catch {
        return json({ error: 'source not found' }, 404)
      }
      try {
        mkdirSync(dirname(toAbs), { recursive: true })
        renameSync(fromAbs, toAbs)
        return json({ ok: true, path: `@/libraries/${scope.scope.libraryId}/${toRel}` })
      } catch (e: unknown) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500)
      }
    }

    // ── List sessions ─────────────────────────────────────────────────────────
    if (path === '/sessions' && req.method === 'GET') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const archived = url.searchParams.get('archived') === '1'
      return json(manager.list(scope.scope, { archived }))
    }

    // ── Create session ────────────────────────────────────────────────────────
    if (path === '/sessions' && req.method === 'POST') {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      const meta = await manager.create(scope.scope)
      return json(meta, 201)
    }

    // ── Get session detail ────────────────────────────────────────────────────
    const sessionDetailMatch = path.match(/^\/sessions\/([^/]+)$/)
    if (sessionDetailMatch) {
      const sessionId = sessionDetailMatch[1]

      if (req.method === 'GET') {
        const scope = resolveScopeFromUrl(url)
        if (!scope.scope) return json({ error: scope.error }, scope.status)
        const meta = manager.getSessionMeta(scope.scope, sessionId)
        if (!meta) return json({ error: 'Session not found' }, 404)
        const artifact = manager.getArtifact(scope.scope, sessionId)
        const messages = dbListChatMessages(scope.scope.libraryId, sessionId).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
        const savedArtifacts = dbListSessionSavedArtifacts(scope.scope.libraryId, sessionId)
        return json({ ...meta, artifactContent: artifact, messages, savedArtifacts })
      }

      if (req.method === 'DELETE') {
        const scope = resolveScopeFromUrl(url)
        if (!scope.scope) return json({ error: scope.error }, scope.status)
        const removed = await manager.delete(scope.scope, sessionId)
        if (!removed) return json({ error: 'Session not found' }, 404)
        return json({ ok: true })
      }

      if (req.method === 'PATCH') {
        const scope = resolveScopeFromUrl(url)
        if (!scope.scope) return json({ error: scope.error }, scope.status)
        const meta = manager.getSessionMeta(scope.scope, sessionId)
        if (!meta) return json({ error: 'Session not found' }, 404)
        const body = (await req.json().catch(() => ({}))) as {
          pinned?: boolean
          archived?: boolean
        }
        if (typeof body.pinned === 'boolean') {
          manager.pinSession(scope.scope, sessionId, body.pinned)
        }
        if (typeof body.archived === 'boolean') {
          manager.archiveSession(scope.scope, sessionId, body.archived)
        }
        const next = manager.getSessionMeta(scope.scope, sessionId)
        return json(next ?? meta)
      }
    }

    // ── Send message (SSE) ────────────────────────────────────────────────────
    const messagesMatch = path.match(/^\/sessions\/([^/]+)\/messages$/)
    const isChatLegacy = path === '/chat' && req.method === 'POST'

    if ((messagesMatch && req.method === 'POST') || isChatLegacy) {
      const scope = resolveScopeFromUrl(url)
      if (!scope.scope) return json({ error: scope.error }, scope.status)
      let sessionId: string
      if (isChatLegacy) {
        sessionId = await ensureDefaultSession(scope.scope)
      } else {
        sessionId = messagesMatch?.[1] ?? ''
      }

      const body = await req.json().catch(() => ({ message: '' }))
      const userMessage: string = body.message || ''
      const selectedLibraryDir = parseSelectedLibraryDirRef(scope.scope, body.selectedLibraryDir)
      if (!userMessage.trim()) {
        return json({ error: 'message is required and must be non-empty' }, 400)
      }

      const session = await manager.getSession(scope.scope, sessionId)
      if (!session) return json({ error: 'Session not found' }, 404)

      // Reject concurrent sends to same session (would corrupt agent state)
      if (manager.isBusy(sessionId)) {
        return json({ error: 'Session is busy, please wait for the current response to finish' }, 429)
      }

      console.log(`[Sidecar] [${sessionId.slice(0, 8)}] → "${userMessage.slice(0, 60)}"`)

      // Auto-title on first message
      const sessions = manager.list(scope.scope)
      const meta = sessions.find((s) => s.id === sessionId)
      if (meta?.title === 'New Session' && userMessage.trim()) {
        manager.autoTitle(scope.scope, sessionId, userMessage)
      }

      const parser = new ArtifactParser()
      let artifactAccum = ''
      let inArtifact = false
      let currentArtifactId: string | null = null

      manager.lockSession(sessionId)

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder()
          let assistantPlain = ''
          const emit = (event: unknown) => {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
            } catch {
              // Client disconnected
            }
          }
          const asRecord = (value: unknown): Record<string, unknown> =>
            (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
          const unsubscribeSpaceEvents = spaceEventBroadcaster.subscribe((event) => {
            emit(event)
          })

          try {
            for await (const event of session.send(userMessage, {
              libraryUiHint: buildLibraryUiTurnHint(selectedLibraryDir),
            })) {
              if (event.type === 'text_delta') {
                // Feed through artifact parser
                const derived = parser.feed(event.text)
                for (const e of derived) {
                  if (e.type === 'artifact_start') {
                    inArtifact = true
                    artifactAccum = ''
                    currentArtifactId = randomUUID()
                    emit({ type: 'artifact_start', sessionId, artifact_id: currentArtifactId })
                  } else if (e.type === 'artifact_delta') {
                    artifactAccum += e.text
                    emit({ type: 'artifact_delta', text: e.text })
                  } else if (e.type === 'artifact_end') {
                    inArtifact = false
                    const summary = summarizeArtifactMarkdown(artifactAccum)
                    const saved = manager.saveArtifact(scope.scope, sessionId, artifactAccum, selectedLibraryDir)
                    recordSessionSavedArtifact(
                      scope.scope.libraryId,
                      sessionId,
                      currentArtifactId,
                      saved,
                      summary,
                    )
                    artifactAccum = ''
                    emit({
                      type: 'artifact_end',
                      sessionId,
                      artifact_id: currentArtifactId,
                      summary,
                      library_path: saved ? `@/libraries/${scope.scope.libraryId}/${saved.relativePath}` : null,
                    })
                    emit({
                      type: 'session_updated',
                      session: manager.getSessionMeta(scope.scope, sessionId),
                    })
                    currentArtifactId = null
                  } else if (e.type === 'text_delta') {
                    assistantPlain += e.text
                    emit(e)
                  }
                }
              } else if (event.type === 'tool_use_start') {
                const payload = asRecord(event)
                emit({ type: 'tool_use_start', toolName: String(payload.toolName ?? 'tool') })
              } else if (event.type === 'tool_result') {
                const payload = asRecord(event)
                emit({
                  type: 'tool_result',
                  toolName: String(payload.toolName ?? 'tool'),
                  success: !Boolean(payload.isError),
                })
              } else if (event.type === 'task_narration') {
                const payload = asRecord(event)
                emit({ type: 'task_narration', text: String(payload.text ?? '') })
              } else if (event.type === 'turn_complete') {
                const payload = asRecord(event)
                emit({ type: 'turn_complete', turnNumber: payload.turnNumber })
              } else if (event.type === 'error') {
                const payload = asRecord(event)
                const err = asRecord(payload.error)
                emit({ type: 'error', error: { message: String(err.message ?? 'Unknown error') } })
              } else if (event.type === 'status') {
                const payload = asRecord(event)
                emit({ type: 'status', status: payload.status, message: payload.message })
              }
            }

            // Flush any buffered text in the parser
            const flushed = parser.flush()
            const hadArtifactEndInFlush = flushed.some((e) => e.type === 'artifact_end')
            for (const e of flushed) {
              if (e.type === 'artifact_start') {
                inArtifact = true
                artifactAccum = ''
                currentArtifactId = randomUUID()
                emit({ type: 'artifact_start', sessionId, artifact_id: currentArtifactId })
              } else if (e.type === 'artifact_delta') {
                artifactAccum += e.text
                emit({ type: 'artifact_delta', text: e.text })
              } else if (e.type === 'artifact_end') {
                inArtifact = false
                const summary = summarizeArtifactMarkdown(artifactAccum)
                const saved = manager.saveArtifact(scope.scope, sessionId, artifactAccum, selectedLibraryDir)
                recordSessionSavedArtifact(
                  scope.scope.libraryId,
                  sessionId,
                  currentArtifactId,
                  saved,
                  summary,
                )
                artifactAccum = ''
                emit({
                  type: 'artifact_end',
                  sessionId,
                  artifact_id: currentArtifactId,
                  summary,
                  library_path: saved ? `@/libraries/${scope.scope.libraryId}/${saved.relativePath}` : null,
                })
                emit({
                  type: 'session_updated',
                  session: manager.getSessionMeta(scope.scope, sessionId),
                })
                currentArtifactId = null
              } else if (e.type === 'text_delta') {
                assistantPlain += e.text
                emit(e)
              } else {
                emit(e)
              }
            }

            // Parser.flush() already emits artifact_end when the stream ends inside <artifact>.
            // Only recover if state is still inconsistent (no artifact_end was flushed).
            if (inArtifact && !hadArtifactEndInFlush) {
              inArtifact = false
              const summary = summarizeArtifactMarkdown(artifactAccum)
              const saved = manager.saveArtifact(scope.scope, sessionId, artifactAccum, selectedLibraryDir)
              recordSessionSavedArtifact(
                scope.scope.libraryId,
                sessionId,
                currentArtifactId,
                saved,
                summary,
              )
              artifactAccum = ''
              emit({
                type: 'artifact_end',
                sessionId,
                artifact_id: currentArtifactId,
                summary,
                library_path: saved ? `@/libraries/${scope.scope.libraryId}/${saved.relativePath}` : null,
              })
              emit({
                type: 'session_updated',
                session: manager.getSessionMeta(scope.scope, sessionId),
              })
              currentArtifactId = null
            }

          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err)
            console.error(`[Sidecar] Stream error [${sessionId.slice(0, 8)}]:`, msg)
            emit({ type: 'error', error: { message: msg } })
          } finally {
            unsubscribeSpaceEvents()
            if (userMessage.trim()) {
              try {
                dbPersistChatTurn(scope.scope.libraryId, sessionId, userMessage, assistantPlain)
              } catch (persistErr) {
                console.error('[Sidecar] Failed to persist chat turn:', persistErr)
              }
            }
            manager.unlockSession(sessionId)
            try { emit('[DONE]') } catch { /* ignore */ }
            try { controller.close() } catch { /* ignore */ }
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        },
      })
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS })
  },
})

console.log(`✅ Kevin Sidecar running at http://localhost:${PORT}`)
console.log(`   GET    /health`)
console.log(`   GET    /config`)
console.log(`   POST   /config`)
console.log(`   POST   /config/validate`)
console.log(`   GET    /events/config`)
console.log(`   GET    /spaces`)
console.log(`   POST   /registry/pick-mount`)
console.log(`   PATCH  /registry/spaces/:id`)
console.log(`   DELETE /registry/spaces/:id`)
console.log(`   GET    /skills          (L1 directory)`)
console.log(`   GET    /skills/:name/full (raw SKILL.md body)`)
console.log(`   GET    /skills/:name    (L2 full body)`)
console.log(`   POST   /skills/forge/suggest`)
console.log(`   POST   /skills/forge/accept`)
console.log(`   POST   /skills/learning/diff`)
console.log(`   POST   /skills/learning/note`)
console.log(`   POST   /skills/promote`)
console.log(`   GET    /cron/jobs`)
console.log(`   POST   /cron/sync`)
console.log(`   GET    /tasks`)
console.log(`   POST   /tasks`)
console.log(`   POST   /signoff/request`)
console.log(`   POST   /signoff/:taskId`)
console.log(`   GET    /library/search`)
console.log(`   POST   /library/open-external`)
console.log(`   POST   /library/write`)
console.log(`   POST   /library/upload`)
console.log(`   POST   /library/move`)
console.log(`   GET    /events/space          (SSE)`)
console.log(`   GET    /sessions`)
console.log(`   POST   /sessions`)
console.log(`   GET    /sessions/:id`)
console.log(`   DELETE /sessions/:id`)
console.log(`   POST   /sessions/:id/messages  (SSE)`)
