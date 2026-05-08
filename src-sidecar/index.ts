/**
 * Kevin Sidecar — Bun HTTP/SSE Server (Sprint 3 Multi-Session Edition)
 *
 * Routes:
 *   GET  /health                       → health check
 *   GET  /spaces                      → list Space vault ids (under ~/.kyberkit/spaces)
 *   GET  /sessions                     → list all sessions
 *   POST /sessions                     → create new session
 *   GET  /sessions/:id                 → get session details (with artifact)
 *   DELETE /sessions/:id               → delete session
 *   POST /sessions/:id/messages        → send message (SSE stream)
 *   POST /chat (deprecated)            → legacy, routes to default session
 */

import { randomUUID } from 'crypto'
import { KyberRuntime } from '../src/runtime/KyberRuntime.js'
import { SessionManager } from './SessionManager.js'
import { ArtifactParser } from './ArtifactParser.js'
import { summarizeArtifactMarkdown } from './artifactSummary.js'
import { dbListChatMessages, dbPersistChatTurn } from './db.js'
import {
  attachSkillSuggestedRuntimeBridge,
  createSpaceEventBroadcaster,
} from './spaceEventBroadcast.js'
import { listDiscoveredSpaces, listSpaceDocsTree } from '../src/runtime/paths/PathResolver.js'
import {
  loadUserConfig,
  saveUserConfig,
  forceApplyUserConfigToEnv,
} from '../src/runtime/config/UserConfigStore.js'
import { broadcastConfigChanged, subscribeConfigSse } from './configBroadcast.js'
import { readProfile, writeProfile } from '../src/runtime/paths/PathResolver.js'

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

const PORT = 3001
const startedAt = Date.now()

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  const canDiscoverSpaces = (() => {
    try {
      listDiscoveredSpaces()
      return true
    } catch {
      return false
    }
  })()

  return [
    {
      name: 'Filesystem MCP',
      status: canDiscoverSpaces ? 'healthy' : 'error',
      lastSuccess: canDiscoverSpaces ? '刚刚' : '不可用',
      source: 'live',
    },
    {
      name: '系统监控 MCP',
      status: 'healthy',
      lastSuccess: '刚刚',
      source: 'live',
    },
    {
      name: '贝易转 DW',
      status: hasDwConfig ? 'healthy' : 'error',
      lastSuccess: hasDwConfig ? '刚刚' : '未配置',
      source: 'live',
    },
  ]
}

console.log('[Kevin Sidecar] Bootstrapping KyberKit Runtime...')
const runtime = new KyberRuntime()
await runtime.bootstrap()
const spaceEventBroadcaster = createSpaceEventBroadcaster()
attachSkillSuggestedRuntimeBridge(runtime.getBus(), spaceEventBroadcaster)

const manager = new SessionManager(runtime)
console.log('[Kevin Sidecar] SessionManager ready.')

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
    modelList,
    modelDefault,
    user: {
      apiKeyConfigured: Boolean(user.anthropicApiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim()),
      modelName,
      baseUrl,
    },
  }
}

// Create a default session if none exists (for legacy /chat compatibility)
async function ensureDefaultSession(): Promise<string> {
  const sessions = manager.list()
  if (sessions.length > 0) return sessions[0].id
  const s = await manager.create()
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
      const list = manager.list()
      return json({
        status: 'ok',
        version: '0.3.0',
        sessions: list.length,
        sessionCount: list.length,
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

    // ── List Space vaults (filesystem under ~/.kyberkit/spaces) ───────────────
    if (path === '/spaces' && req.method === 'GET') {
      return json(listDiscoveredSpaces())
    }

    // ── Connectors status (live aggregation) ──────────────────────────────────
    if (path === '/connectors' && req.method === 'GET') {
      return json(listConnectorStatuses())
    }

    // ── Space docs tree (sidebar library) ─────────────────────────────────────
    if (path === '/library/tree' && req.method === 'GET') {
      const spaceId = url.searchParams.get('space_id')?.trim() || 'default'
      return json(listSpaceDocsTree(spaceId))
    }

    // ── List sessions ─────────────────────────────────────────────────────────
    if (path === '/sessions' && req.method === 'GET') {
      return json(manager.list())
    }

    // ── Create session ────────────────────────────────────────────────────────
    if (path === '/sessions' && req.method === 'POST') {
      const meta = await manager.create()
      return json(meta, 201)
    }

    // ── Get session detail ────────────────────────────────────────────────────
    const sessionDetailMatch = path.match(/^\/sessions\/([^/]+)$/)
    if (sessionDetailMatch) {
      const sessionId = sessionDetailMatch[1]

      if (req.method === 'GET') {
        const sessions = manager.list()
        const meta = sessions.find((s) => s.id === sessionId)
        if (!meta) return json({ error: 'Session not found' }, 404)
        const artifact = manager.getArtifact(sessionId)
        const messages = dbListChatMessages(sessionId).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
        return json({ ...meta, artifactContent: artifact, messages })
      }

      if (req.method === 'DELETE') {
        await manager.delete(sessionId)
        return json({ ok: true })
      }
    }

    // ── Send message (SSE) ────────────────────────────────────────────────────
    const messagesMatch = path.match(/^\/sessions\/([^/]+)\/messages$/)
    const isChatLegacy = path === '/chat' && req.method === 'POST'

    if ((messagesMatch && req.method === 'POST') || isChatLegacy) {
      let sessionId: string
      if (isChatLegacy) {
        sessionId = await ensureDefaultSession()
      } else {
        sessionId = messagesMatch![1]
      }

      const body = await req.json().catch(() => ({ message: '' }))
      const userMessage: string = body.message || ''
      if (!userMessage.trim()) {
        return json({ error: 'message is required and must be non-empty' }, 400)
      }

      const session = await manager.getSession(sessionId)
      if (!session) return json({ error: 'Session not found' }, 404)

      // Reject concurrent sends to same session (would corrupt agent state)
      if (manager.isBusy(sessionId)) {
        return json({ error: 'Session is busy, please wait for the current response to finish' }, 429)
      }

      console.log(`[Sidecar] [${sessionId.slice(0, 8)}] → "${userMessage.slice(0, 60)}"`)

      // Auto-title on first message
      const sessions = manager.list()
      const meta = sessions.find((s) => s.id === sessionId)
      if (meta?.title === 'New Session' && userMessage.trim()) {
        manager.autoTitle(sessionId, userMessage)
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
          const unsubscribeSpaceEvents = spaceEventBroadcaster.subscribe((event) => {
            emit(event)
          })

          try {
            for await (const event of session.send(userMessage)) {
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
                    emit({
                      type: 'artifact_end',
                      sessionId,
                      artifact_id: currentArtifactId,
                      summary,
                    })
                    // Persist artifact to DB
                    manager.saveArtifact(sessionId, artifactAccum)
                    emit({ type: 'session_updated', session: manager.list().find((s) => s.id === sessionId) })
                    currentArtifactId = null
                  } else if (e.type === 'text_delta') {
                    assistantPlain += e.text
                    emit(e)
                  }
                }
              } else if (event.type === 'tool_use_start') {
                emit({ type: 'tool_use_start', toolName: (event as any).toolName || 'tool' })
              } else if (event.type === 'tool_result') {
                emit({ type: 'tool_result', toolName: (event as any).toolName || 'tool', success: !(event as any).isError })
              } else if (event.type === 'task_narration') {
                emit({ type: 'task_narration', text: (event as any).text || '' })
              } else if (event.type === 'turn_complete') {
                emit({ type: 'turn_complete', turnNumber: (event as any).turnNumber })
              } else if (event.type === 'error') {
                emit({ type: 'error', error: { message: (event as any).error?.message || 'Unknown error' } })
              } else if (event.type === 'status') {
                emit({ type: 'status', status: (event as any).status, message: (event as any).message })
              }
            }

            // Flush any buffered text in the parser
            const flushed = parser.flush()
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
                emit({
                  type: 'artifact_end',
                  sessionId,
                  artifact_id: currentArtifactId,
                  summary: summarizeArtifactMarkdown(artifactAccum),
                })
                manager.saveArtifact(sessionId, artifactAccum)
                emit({ type: 'session_updated', session: manager.list().find((s) => s.id === sessionId) })
                currentArtifactId = null
              } else if (e.type === 'text_delta') {
                assistantPlain += e.text
                emit(e)
              } else {
                emit(e)
              }
            }

            // If stream ended while still inside <artifact> (no closing tag), close once
            if (inArtifact) {
              inArtifact = false
              manager.saveArtifact(sessionId, artifactAccum)
              emit({
                type: 'artifact_end',
                sessionId,
                artifact_id: currentArtifactId,
                summary: summarizeArtifactMarkdown(artifactAccum),
              })
              emit({ type: 'session_updated', session: manager.list().find((s) => s.id === sessionId) })
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
                dbPersistChatTurn(sessionId, userMessage, assistantPlain)
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
console.log(`   GET    /sessions`)
console.log(`   POST   /sessions`)
console.log(`   GET    /sessions/:id`)
console.log(`   DELETE /sessions/:id`)
console.log(`   POST   /sessions/:id/messages  (SSE)`)
