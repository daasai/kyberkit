import { useState, useRef, useEffect, useCallback, useMemo, type KeyboardEvent } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL, qsSpace } from '../../config/sidecarUrl'
import { summarizeArtifactMarkdown } from '../../lib/artifactSummary'
import { requestFocusKevinCenter } from '../../lib/focusCenter'
import {
  KEVIN_LIBRARY_SELECTION_EVENT,
  collectLibraryFileRefsInMessage,
  emitLibrarySelection,
  formatDirectoryBadge,
  getSelectedLibraryDir,
  toLibraryRelativePath,
  toParentLibraryDir,
  type LibrarySelectionEventDetail,
} from '../../lib/librarySelection'
import { usePendingSignoffs } from '../../hooks/usePendingSignoffs'
import { SignoffCard } from '../signoff/SignoffCard'
import { SlashCommandMenu, type SlashSkillHint } from './SlashCommandMenu'
import { ForgeSuggestionCard, type ForgeDraft } from '../skill-store/ForgeSuggestionCard'
import { AtFilePicker } from './AtFilePicker'
import { ChatMarkdown } from '../chat/ChatMarkdown'
import { visibleAssistantFromMessage } from '../../lib/assistantMessageVisibleText'

type ToolCall = { label: string; icon: string }

/** UAT-003: collapse noisy tool / narration rows in chat when many or very long. */
const TOOL_CALL_COLLAPSE_MIN_ITEMS = 4
const TOOL_CALL_COLLAPSE_MIN_CHARS = 360
const ASSISTANT_COLLAPSE_MIN_CHARS = 2000

function shouldCollapseToolCalls(calls: ToolCall[]): boolean {
  if (calls.length >= TOOL_CALL_COLLAPSE_MIN_ITEMS) return true
  const chars = calls.reduce((n, c) => n + c.label.length, 0)
  return chars >= TOOL_CALL_COLLAPSE_MIN_CHARS
}

function toolCallsExpandedForMessage(
  messageId: string,
  calls: ToolCall[],
  overrides: Record<string, boolean>,
): boolean {
  if (Object.hasOwn(overrides, messageId)) return overrides[messageId]
  return !shouldCollapseToolCalls(calls)
}

function assistantMarkdownExpandedForMessage(
  messageId: string,
  visibleMarkdown: string,
  overrides: Record<string, boolean>,
): boolean {
  if (visibleMarkdown.length <= ASSISTANT_COLLAPSE_MIN_CHARS) return true
  if (Object.hasOwn(overrides, messageId)) return overrides[messageId]
  return false
}

async function expandLibraryMentionsInMessage(
  text: string,
  spaceId: string | null,
  libraryId: string | null,
): Promise<string> {
  if (!spaceId) return text
  const paths = collectLibraryFileRefsInMessage(text, libraryId)
  if (paths.length === 0) return text
  const blocks: string[] = []
  for (const p of paths) {
    const u = new URL(`${SIDECAR_URL}/library/file`)
    u.searchParams.set('space_id', spaceId)
    u.searchParams.set('path', p)
    const res = await fetch(u.toString())
    const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string }
    if (!res.ok || typeof data.content !== 'string') {
      blocks.push(
        `\n\n---\nFile: ${p}\n(无法读取: ${typeof data.error === 'string' ? data.error : `HTTP ${res.status}`})\n`,
      )
    } else {
      const cap = 120_000
      const c =
        data.content.length > cap ? `${data.content.slice(0, cap)}\n\n...[truncated]` : data.content
      blocks.push(`\n\n---\nFile: ${p}\n\n${c}\n`)
    }
  }
  return text + blocks.join('')
}

type ArtifactStrip = {
  id: string
  summary?: string
  status: 'streaming' | 'ready'
  content?: string
}

type Message = {
  id: string
  role: 'user' | 'ai'
  content: string
  toolCalls?: ToolCall[]
  artifactStrip?: ArtifactStrip
}

type SessionArtifactEntry = {
  id: string
  createdAt: string
  summary: string
  /** In-memory body when known; otherwise load via `libraryRef`. */
  content: string
  /** Sidecar `@/libraries/<id>/…` ref after save; used to lazy-load body. */
  libraryRef?: string | null
}

type IslandEvent =
  | { type: 'task.started'; taskName?: string; eta?: string }
  | { type: 'task.progress'; taskName?: string; eta?: string }
  | { type: 'task.awaiting_signoff'; pendingCount?: number }
  | { type: 'task.completed'; summary?: string }

const ISLAND_EVENT_NAME = 'kevin:island-event'

/** 与 Sidecar `/library/upload` 及预览上限一致（5MiB）。 */
const MAX_LIBRARY_FILE_BYTES = 5 * 1024 * 1024

export function RightPanel() {
  const { activeSessionId, createSession, refreshSessions, spaceId, spaces } = useSession()
  const { onArtifactStart, onArtifactDelta, onArtifactEnd, loadArtifact, artifact, setSavedPath } = useArtifact()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sendHint, setSendHint] = useState<string | null>(null)
  const [currentDirPath, setCurrentDirPath] = useState<string | null>(getSelectedLibraryDir(spaceId))
  const [artifactsBySession, setArtifactsBySession] = useState<Record<string, SessionArtifactEntry[]>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  /** When true, skip hydrating chat from Sidecar (avoids wiping optimistic rows right after createSession). */
  const streamingRef = useRef(false)
  const artifactDraftRef = useRef('')
  /** Assistant text outside artifact stream (text_delta only) — sent to forge distill. */
  const assistantForgePlainRef = useRef('')
  /** Final artifact markdown from last artifact_end (full). */
  const assistantForgeArtifactRef = useRef('')

  const [atPickerOpen, setAtPickerOpen] = useState(false)
  const [skillsForSlash, setSkillsForSlash] = useState<SlashSkillHint[]>([])
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0)
  const [forgeDraft, setForgeDraft] = useState<ForgeDraft | null>(null)
  const [toolCallsExpandedByMsg, setToolCallsExpandedByMsg] = useState<Record<string, boolean>>({})
  const [assistantExpandedByMsg, setAssistantExpandedByMsg] = useState<Record<string, boolean>>({})

  const activeLibraryId = useMemo(
    () => spaces.find((s) => s.id === spaceId)?.libraryId?.trim() ?? null,
    [spaces, spaceId],
  )

  const emitIslandEvent = useCallback((detail: IslandEvent) => {
    window.dispatchEvent(new CustomEvent<IslandEvent>(ISLAND_EVENT_NAME, { detail }))
  }, [])

  // PRD §10.2 — pending sign-offs for the active Space (S-5 Sprint C).
  const { pending: pendingSignoffs, resolve: resolveSignoff } = usePendingSignoffs(spaceId || null)
  // Mirror sign-off count into Dynamic Island (red pulse).
  useEffect(() => {
    if (pendingSignoffs.length > 0) {
      emitIslandEvent({ type: 'task.awaiting_signoff', pendingCount: pendingSignoffs.length })
    }
  }, [pendingSignoffs.length, emitIslandEvent])

  // Space switch must not leak old-space state across windows
  useEffect(() => {
    setMessages([])
    setSendHint(null)
    setArtifactsBySession({})
    artifactDraftRef.current = ''
    setCurrentDirPath(getSelectedLibraryDir(spaceId))
  }, [spaceId])

  useEffect(() => {
    const onSelection = (e: Event) => {
      const detail = (e as CustomEvent<LibrarySelectionEventDetail>).detail
      if (!detail || detail.spaceId !== spaceId) return
      setCurrentDirPath(detail.selectedDirPath)
    }
    window.addEventListener(KEVIN_LIBRARY_SELECTION_EVENT, onSelection as EventListener)
    return () => {
      window.removeEventListener(KEVIN_LIBRARY_SELECTION_EVENT, onSelection as EventListener)
    }
  }, [spaceId])

  const firstInputLine = (input.split('\n')[0] ?? '').trimStart()
  const slashActive = firstInputLine.startsWith('/')
  const slashQuery = slashActive ? firstInputLine.slice(1) : ''

  const filteredSlashSkills = useMemo(() => {
    const q = slashQuery.trim().toLowerCase()
    if (!q) return skillsForSlash
    return skillsForSlash.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q),
    )
  }, [skillsForSlash, slashQuery])

  const slashFilterKey = useMemo(
    () => `${slashQuery}\0${filteredSlashSkills.map((s) => s.name).join('\n')}`,
    [slashQuery, filteredSlashSkills],
  )
  useEffect(() => {
    void slashFilterKey
    setSlashSelectedIndex(0)
  }, [slashFilterKey])

  useEffect(() => {
    if (!slashActive || !spaceId) return
    let cancelled = false
    void fetch(`${SIDECAR_URL}/skills${qsSpace(spaceId)}`)
      .then((r) => r.json())
      .then((rows: unknown) => {
        if (cancelled) return
        if (!Array.isArray(rows)) {
          setSkillsForSlash([])
          return
        }
        setSkillsForSlash(
          rows.map((r) => {
            const o = r as { name?: string; description?: string }
            return { name: String(o.name ?? ''), description: String(o.description ?? '') }
          }).filter((s) => s.name.length > 0),
        )
      })
      .catch(() => {
        if (!cancelled) setSkillsForSlash([])
      })
    return () => {
      cancelled = true
    }
  }, [slashActive, spaceId])

  const insertAtCursor = useCallback((snippet: string) => {
    const el = textareaRef.current
    if (!el) {
      setInput((prev) => prev + snippet)
      return
    }
    const start = el.selectionStart ?? 0
    const end = el.selectionEnd ?? 0
    setInput((prev) => prev.slice(0, start) + snippet + prev.slice(end))
    const pos = start + snippet.length
    requestAnimationFrame(() => {
      try {
        el.focus()
        el.setSelectionRange(pos, pos)
      } catch {
        /* ignore */
      }
    })
  }, [])

  const handleLibraryFilesChosen = useCallback(
    async (list: FileList | null) => {
      if (!list?.length || !spaceId) return
      const dir = currentDirPath?.trim()
      if (!dir) {
        setSendHint('请先在左侧文档库选中要上传到的文件夹')
        return
      }
      for (let i = 0; i < list.length; i++) {
        const f = list.item(i)
        if (f && f.size > MAX_LIBRARY_FILE_BYTES) {
          setSendHint(`单个文件不能超过 5MB：${f.name}`)
          return
        }
      }
      for (let i = 0; i < list.length; i++) {
        const file = list.item(i)
        if (!file) continue
        const fd = new FormData()
        fd.append('dir', dir)
        fd.append('file', file)
        try {
          const res = await fetch(`${SIDECAR_URL}/library/upload${qsSpace(spaceId)}`, {
            method: 'POST',
            body: fd,
          })
          const data = (await res.json().catch(() => ({}))) as { error?: string; path?: string }
          if (!res.ok) {
            setSendHint(typeof data.error === 'string' ? data.error : `上传失败 (${res.status})`)
            return
          }
          const p = typeof data.path === 'string' ? data.path : ''
          if (p) insertAtCursor(`${p} `)
        } catch {
          setSendHint('上传失败：网络错误')
          return
        }
      }
      setSendHint(null)
    },
    [spaceId, currentDirPath, insertAtCursor],
  )

  // Load persisted chat when the active session changes (keeps RightPanel in sync with LeftSidebar)
  useEffect(() => {
    let cancelled = false
    async function loadHistory() {
      if (!activeSessionId) {
        setMessages([])
        return
      }
      if (streamingRef.current) return
      try {
        const res = await fetch(`${SIDECAR_URL}/sessions/${activeSessionId}${qsSpace(spaceId)}`)
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          messages?: Array<{ role: string; content: string }>
          artifactContent?: string
          updatedAt?: string
          savedArtifacts?: Array<{
            id: string
            library_relative_path: string | null
            summary: string
            created_at: string
          }>
        }
        const rows = data.messages ?? []
        const loaded: Message[] = rows.map((m, idx) => ({
          id: `hist-${idx}-${m.role}-${(m.content ?? '').slice(0, 24)}`,
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content ?? '',
        }))
        if (!cancelled) setMessages(loaded)

        const sid = activeSessionId
        const art = (data.artifactContent ?? '').trim()
        const libId = activeLibraryId
        if (!cancelled && sid) {
          const savedRows = data.savedArtifacts
          if (Array.isArray(savedRows) && savedRows.length > 0) {
            setArtifactsBySession((prev) => ({
              ...prev,
              [sid]: savedRows.map((r) => ({
                id: r.id,
                createdAt: r.created_at,
                summary: (r.summary ?? '').trim() || '产物',
                content: '',
                libraryRef:
                  r.library_relative_path && libId
                    ? `@/libraries/${libId}/${String(r.library_relative_path).replace(/^\/+/, '')}`
                    : null,
              })),
            }))
          } else {
            const pid = `persisted-${sid}`
            setArtifactsBySession((prev) => {
              const cur = prev[sid] ?? []
              if (!art) {
                return { ...prev, [sid]: cur.filter((e) => e.id !== pid) }
              }
              const entry: SessionArtifactEntry = {
                id: pid,
                createdAt: data.updatedAt ?? new Date().toISOString(),
                summary: summarizeArtifactMarkdown(art),
                content: data.artifactContent ?? '',
                libraryRef: null,
              }
              const hasP = cur.some((e) => e.id === pid)
              if (hasP) {
                return { ...prev, [sid]: cur.map((e) => (e.id === pid ? entry : e)) }
              }
              return { ...prev, [sid]: [entry, ...cur] }
            })
          }
        }
      } catch {
        if (!cancelled) setMessages([])
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeSessionId, spaceId, activeLibraryId])

  const openSessionArtifactEntry = useCallback(
    async (entry: SessionArtifactEntry) => {
      if (!activeSessionId || !spaceId) return
      if (entry.content.trim().length > 0) {
        loadArtifact(activeSessionId, entry.content)
        requestFocusKevinCenter()
        return
      }
      const ref = entry.libraryRef?.trim()
      if (!ref) return
      try {
        const u = new URL(`${SIDECAR_URL}/library/file`)
        u.searchParams.set('space_id', spaceId)
        u.searchParams.set('path', ref)
        const res = await fetch(u.toString())
        const body = (await res.json().catch(() => ({}))) as { content?: string; error?: string }
        if (!res.ok || typeof body.content !== 'string') {
          setSendHint(typeof body.error === 'string' ? body.error : `无法打开制品 (${res.status})`)
          return
        }
        loadArtifact(activeSessionId, body.content)
        requestFocusKevinCenter()
      } catch {
        setSendHint('无法打开制品：网络错误')
      }
    },
    [activeSessionId, spaceId, loadArtifact],
  )

  const openStripInCenter = useCallback(
    (sessionId: string, strip: ArtifactStrip) => {
      const body =
        strip.content ??
        (artifact.sessionId === sessionId && artifact.streaming ? artifact.content : '')
      if (body) loadArtifact(sessionId, body)
      requestFocusKevinCenter()
    },
    [artifact.sessionId, artifact.streaming, artifact.content, loadArtifact],
  )

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    setForgeDraft(null)
    assistantForgePlainRef.current = ''
    assistantForgeArtifactRef.current = ''

    const messageForModel = await expandLibraryMentionsInMessage(trimmed, spaceId, activeLibraryId)

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
    }

    streamingRef.current = true
    emitIslandEvent({ type: 'task.started', taskName: 'Processing request' })
    setSendHint(null)
    setMessages(prev => [
      ...prev,
      { id: `user-${crypto.randomUUID()}`, role: 'user', content: trimmed },
      { id: `ai-${crypto.randomUUID()}`, role: 'ai', content: '' },
    ])
    setIsStreaming(true)
    setInput('')

    try {
      const postMessage = (sid: string) => fetch(`${SIDECAR_URL}/sessions/${sid}/messages${qsSpace(spaceId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageForModel,
          selectedLibraryDir: getSelectedLibraryDir(spaceId),
        }),
      })
      let res = await postMessage(sessionId)
      // Recover from stale activeSessionId right after switching/creating a Space.
      if (res.status === 404) {
        const freshSessionId = await createSession()
        sessionId = freshSessionId
        res = await postMessage(sessionId)
      }

      if (res.status === 429) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string }
        setSendHint(errBody.error ?? '会话正在回复中，请稍候再试')
        setMessages(prev => prev.slice(0, -2))
        setInput(trimmed)
        streamingRef.current = false
        setIsStreaming(false)
        return
      }

      if (!res.ok || !res.body) {
        setSendHint(`请求失败 (${res.status})`)
        setMessages(prev => prev.slice(0, -2))
        setInput(trimmed)
        streamingRef.current = false
        setIsStreaming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const raw = line.slice(6).trim()
          if (raw === '"[DONE]"' || raw === '[DONE]') break

          try {
            const event = JSON.parse(raw) as Record<string, unknown>

            if (event.type === 'artifact_delta' && typeof event.text === 'string') {
              artifactDraftRef.current += event.text
              onArtifactDelta(event.text)
              emitIslandEvent({ type: 'task.progress', taskName: 'Streaming artifact' })
              continue
            }

            if (event.type === 'artifact_start') {
              artifactDraftRef.current = ''
              assistantForgeArtifactRef.current = ''
              const aid = typeof event.artifact_id === 'string' ? event.artifact_id : crypto.randomUUID()
              onArtifactStart(sessionId)
              setMessages(prev => {
                if (prev.length === 0) return prev
                const updated = [...prev]
                const last = { ...updated[updated.length - 1] }
                if (!last.content.includes('__ARTIFACT_PLACEHOLDER__')) {
                  last.content += '\n\n__ARTIFACT_PLACEHOLDER__'
                }
                last.artifactStrip = { id: aid, status: 'streaming' }
                updated[updated.length - 1] = last
                return updated
              })
              continue
            }

            if (event.type === 'artifact_end') {
              const snap = artifactDraftRef.current
              artifactDraftRef.current = ''
              const sid = sessionId
              const aid = typeof event.artifact_id === 'string' ? event.artifact_id : crypto.randomUUID()
              const summary =
                typeof event.summary === 'string' ? event.summary : summarizeArtifactMarkdown(snap)
              const generatedLibraryPath =
                typeof event.library_path === 'string' ? event.library_path : null
              onArtifactEnd()
              if (generatedLibraryPath) setSavedPath(generatedLibraryPath)
              emitIslandEvent({ type: 'task.completed', summary: summary || 'Artifact ready' })
              refreshSessions()
              if (generatedLibraryPath) {
                const nextDir = toParentLibraryDir(generatedLibraryPath)
                setCurrentDirPath(nextDir)
                emitLibrarySelection({
                  spaceId,
                  selectedPath: generatedLibraryPath,
                  selectedDirPath: nextDir,
                })
              }
              setArtifactsBySession(prev => {
                const list = prev[sid] ?? []
                const nextEntry: SessionArtifactEntry = {
                  id: aid,
                  createdAt: new Date().toISOString(),
                  summary,
                  content: snap,
                  libraryRef: generatedLibraryPath ?? null,
                }
                return { ...prev, [sid]: [nextEntry, ...list.filter(e => e.id !== aid)] }
              })
              setMessages(prev => {
                if (prev.length === 0) return prev
                const updated = [...prev]
                const last = { ...updated[updated.length - 1] }
                last.artifactStrip = { id: aid, status: 'ready', summary, content: snap }
                updated[updated.length - 1] = last
                return updated
              })
              assistantForgeArtifactRef.current = snap.trim()
              continue
            }

            if (event.type === 'text_delta' && typeof event.text === 'string') {
              assistantForgePlainRef.current += event.text
            }

            setMessages(prev => {
              if (prev.length === 0) return prev
              const updated = [...prev]
              const last = { ...updated[updated.length - 1] }

              if (event.type === 'text_delta' && typeof event.text === 'string') {
                last.content += event.text
              } else if (event.type === 'tool_use_start') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: String((event as { toolName?: string }).toolName ?? 'tool'), icon: 'build' }]
              } else if (event.type === 'task_narration') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: String((event as { text?: string }).text ?? ''), icon: 'pending' }]
              } else if (event.type === 'error') {
                const calls = last.toolCalls ?? []
                const msg = (event.error as { message?: string } | undefined)?.message
                last.toolCalls = [...calls, { label: `错误: ${msg}`, icon: 'error' }]
              } else if (event.type === 'status' && event.status === 'failed') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: `系统异常: ${String((event as { message?: string }).message)}`, icon: 'warning' }]
              } else if (event.type === 'status' && event.status === 'awaiting_signoff') {
                emitIslandEvent({ type: 'task.awaiting_signoff', pendingCount: 1 })
              }

              updated[updated.length - 1] = last
              return updated
            })
          } catch {
            // Ignore parse errors from split SSE chunks
          }
        }
      }

      if (spaceId && trimmed) {
        try {
          const r = await fetch(`${SIDECAR_URL}/skills/forge/suggest${qsSpace(spaceId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: trimmed,
              assistantPlain: assistantForgePlainRef.current,
              assistantArtifact: assistantForgeArtifactRef.current,
            }),
          })
          if (r.ok) {
            const data = (await r.json()) as {
              trigger?: string | null
              suggestedName?: string
              suggestedDescription?: string
              bodySeed?: string
              distilled?: boolean
              distillError?: string
            }
            if (
              data &&
              typeof data.trigger === 'string' &&
              data.trigger.length > 0 &&
              typeof data.suggestedName === 'string' &&
              typeof data.suggestedDescription === 'string' &&
              typeof data.bodySeed === 'string'
            ) {
              setForgeDraft({
                ...data,
                trigger: data.trigger as ForgeDraft['trigger'],
              } as ForgeDraft)
            }
          }
        } catch {
          /* ignore forge suggest */
        }
      }
    } catch {
      setSendHint('无法连接到 Kevin 服务（Sidecar 未启动？）')
      setMessages(prev => {
        if (prev.length === 0) return prev
        const out = [...prev]
        out[out.length - 1] = {
          id: out[out.length - 1]?.id ?? `ai-${crypto.randomUUID()}`,
          role: 'ai',
          content: '⚠️ 无法连接到 Kevin 服务（Sidecar 未启动）',
        }
        return out
      })
      setInput(trimmed)
    } finally {
      streamingRef.current = false
      setIsStreaming(false)
      emitIslandEvent({ type: 'task.completed', summary: 'Task completed' })
    }
  }, [
    activeSessionId,
    isStreaming,
    createSession,
    onArtifactStart,
    onArtifactDelta,
    onArtifactEnd,
    setSavedPath,
    refreshSessions,
    emitIslandEvent,
    spaceId,
    activeLibraryId,
  ])

  const applySlashSelection = useCallback(
    async (skill: SlashSkillHint) => {
      if (!spaceId || !skill.name) return
      const lines = input.split('\n')
      const tail = lines.slice(1).join('\n').trimStart()
      const res = await fetch(
        `${SIDECAR_URL}/skills/${encodeURIComponent(skill.name)}/full${qsSpace(spaceId)}`,
      )
      const data = (await res.json().catch(() => ({}))) as { body?: string; error?: string }
      if (!res.ok) {
        setSendHint(typeof data.error === 'string' ? data.error : `无法加载 Skill (${res.status})`)
        return
      }
      const body = typeof data.body === 'string' ? data.body : ''
      const parts: string[] = []
      if (tail) parts.push(tail)
      parts.push('---', `Skill: ${skill.name}`, body)
      const composed = parts.join('\n')
      setInput('')
      await sendMessage(composed)
    },
    [input, spaceId, sendMessage],
  )

  const handleSend = useCallback(() => {
    if (slashActive && filteredSlashSkills.length > 0) {
      const pick = filteredSlashSkills[slashSelectedIndex] ?? filteredSlashSkills[0]
      void applySlashSelection(pick)
      return
    }
    void sendMessage(input)
  }, [
    slashActive,
    filteredSlashSkills,
    slashSelectedIndex,
    applySlashSelection,
    sendMessage,
    input,
  ])

  const handleTextareaKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (slashActive && filteredSlashSkills.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setSlashSelectedIndex((i) => Math.min(i + 1, filteredSlashSkills.length - 1))
          return
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault()
          setSlashSelectedIndex((i) => Math.max(0, i - 1))
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          setInput((prev) => {
            const lines = prev.split('\n')
            if (lines[0]?.trimStart().startsWith('/')) {
              lines[0] = lines[0].replace(/^\s*\/\S*/, '').replace(/^\s+/, '')
            }
            return lines.join('\n')
          })
          return
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          const pick = filteredSlashSkills[slashSelectedIndex] ?? filteredSlashSkills[0]
          void applySlashSelection(pick)
          return
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [slashActive, filteredSlashSkills, slashSelectedIndex, applySlashSelection, handleSend],
  )

  const sessionArtifactList = activeSessionId ? (artifactsBySession[activeSessionId] ?? []) : []
  const currentDirTitle = toLibraryRelativePath(currentDirPath) || '根目录'
  const currentDirBadge = formatDirectoryBadge(currentDirPath, 40)

  return (
    <div style={{
      height: '100%',
      backgroundColor: 'var(--color-surface-container-lowest)',
      borderLeft: '1px solid var(--color-outline-variant)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            data-testid="process-tracker"
            style={{
              flexShrink: 0,
              padding: '10px 12px 12px',
              borderBottom: '1px solid var(--color-outline-variant)',
              background: 'var(--color-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-on-surface)' }}>本会话制品</div>
            <div style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)', lineHeight: 1.4 }}>
              {isStreaming ? 'Kevin 正在回复…（工具与步骤见下方气泡，可折叠）' : '就绪'}
            </div>
            {sessionArtifactList.length === 0 ? (
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
                本轮尚无已落库的 Markdown 等产物；生成后会列在此处，可一键在中栏打开编辑。
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: 'min(42vh, 320px)',
                  overflowY: 'auto',
                }}
              >
                {sessionArtifactList.map((entry) => (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      background: 'var(--color-surface-container-lowest)',
                      border: '1px solid var(--color-outline-variant)',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-on-surface)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={entry.summary}
                      >
                        {entry.summary || '产物'}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--color-on-surface-variant)' }}>
                        {entry.createdAt.slice(0, 19).replace('T', ' ')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void openSessionArtifactEntry(entry)
                      }}
                      style={{
                        flexShrink: 0,
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 600,
                        borderRadius: '6px',
                        border: 'none',
                        background: 'var(--color-primary)',
                        color: 'var(--color-on-primary)',
                        cursor: 'pointer',
                      }}
                    >
                      画布中打开
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            data-testid="context-attribution"
            style={{
              flexShrink: 0,
              padding: '8px 12px',
              borderBottom: '1px solid var(--color-outline-variant)',
              background: 'var(--color-surface-container-lowest)',
              fontSize: '11px',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--color-on-surface)' }}>上下文</span>
            {' · '}
            {activeSessionId ? `会话 ${activeSessionId.slice(0, 8)}…` : '未选择会话'}
          </div>

          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
            {pendingSignoffs
              .filter((t) => !activeSessionId || !t.sessionId || t.sessionId === activeSessionId)
              .map((task) => (
                <SignoffCard
                  key={task.id}
                  task={task}
                  onResolve={(decision) => resolveSignoff(task.id, decision)}
                />
              ))}
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '40px', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '36px', opacity: 0.4 }}>smart_toy</span>
                <p style={{ fontSize: '13px', textAlign: 'center', lineHeight: '1.6', opacity: 0.7, maxWidth: '200px' }}>
                  在下方输入框向 Kevin 提问，或使用 @、/ 引用文档与命令。
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    background: 'var(--color-surface-container)',
                    padding: '10px 14px',
                    borderRadius: '16px 16px 4px 16px',
                    maxWidth: '85%',
                    fontSize: '13px',
                    color: 'var(--color-on-surface)',
                    border: '1px solid color-mix(in srgb, var(--color-outline-variant) 50%, transparent)',
                    lineHeight: '1.5',
                  }}>
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
                  {isStreaming && i === messages.length - 1 && msg.content === '' && (msg.toolCalls?.length ?? 0) === 0 && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      color: 'var(--color-on-surface-variant)', fontSize: '12px', fontWeight: 600,
                      marginBottom: '8px', padding: '0 4px',
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }}>sync</span>
                      正在思考...
                    </div>
                  )}
                  {(() => {
                    const artifactStreaming = msg.artifactStrip?.status === 'streaming'
                    const visibleAssistant = visibleAssistantFromMessage(msg.content, artifactStreaming)
                    const hasVisibleNarration = visibleAssistant.trim().length > 0
                    const showCard = !!(msg.content || (msg.toolCalls && msg.toolCalls.length > 0) || msg.artifactStrip)
                    if (!showCard) return null
                    return (
                      <>
                        <div style={{
                          position: 'relative',
                          background: 'white',
                          border: '1px solid var(--color-outline-variant)',
                          padding: '14px',
                          borderRadius: '16px 16px 16px 4px',
                          width: '95%',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                        }}>
                          <div style={{
                            position: 'absolute', top: '-10px', left: '-10px',
                            width: '24px', height: '24px',
                            background: 'var(--color-primary-container)',
                            borderRadius: '50%', border: '2px solid white',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '12px', color: 'var(--color-on-primary)' }}>smart_toy</span>
                          </div>

                          {msg.toolCalls && msg.toolCalls.length > 0 && (() => {
                            const calls = msg.toolCalls
                            const toolExpanded = toolCallsExpandedForMessage(msg.id, calls, toolCallsExpandedByMsg)
                            const toolBusy = shouldCollapseToolCalls(calls)
                            return (
                              <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {toolBusy && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setToolCallsExpandedByMsg((p) => ({
                                        ...p,
                                        [msg.id]: !toolCallsExpandedForMessage(msg.id, calls, p),
                                      }))
                                    }
                                    style={{
                                      alignSelf: 'flex-start',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                      padding: '4px 10px',
                                      borderRadius: '999px',
                                      border: '1px solid var(--color-outline-variant)',
                                      background: 'var(--color-surface-container-lowest)',
                                      color: 'var(--color-primary)',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {toolExpanded ? '收起过程与工具' : `展开过程与工具（${calls.length} 条）`}
                                  </button>
                                )}
                                {(toolExpanded || !toolBusy) && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {calls.map((t, ti) => (
                                      <div
                                        key={`${msg.id}-${ti}-${t.label.slice(0, 40)}`}
                                        style={{
                                          fontSize: '11px',
                                          color: 'var(--color-on-surface-variant)',
                                          background: 'var(--color-surface-container-lowest)',
                                          padding: '3px 8px',
                                          borderRadius: '4px',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          alignSelf: 'flex-start',
                                        }}
                                      >
                                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>
                                          {t.icon}
                                        </span>
                                        {t.icon === 'build' ? `工具: ${t.label}` : t.label}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-on-surface)' }}>
                            {hasVisibleNarration ? (
                              (() => {
                                const assistantExp = assistantMarkdownExpandedForMessage(
                                  msg.id,
                                  visibleAssistant,
                                  assistantExpandedByMsg,
                                )
                                const longBody = visibleAssistant.length > ASSISTANT_COLLAPSE_MIN_CHARS
                                return longBody ? (
                                  <>
                                    <div
                                      style={{
                                        maxHeight: assistantExp ? undefined : 220,
                                        overflow: assistantExp ? 'visible' : 'hidden',
                                      }}
                                    >
                                      <ChatMarkdown content={visibleAssistant} />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAssistantExpandedByMsg((p) => ({
                                          ...p,
                                          [msg.id]: !assistantMarkdownExpandedForMessage(msg.id, visibleAssistant, p),
                                        }))
                                      }
                                      style={{
                                        marginTop: '8px',
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        padding: '4px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid var(--color-outline-variant)',
                                        background: 'var(--color-surface-container-lowest)',
                                        color: 'var(--color-primary)',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {assistantExp ? '收起正文' : '展开全文'}
                                    </button>
                                  </>
                                ) : (
                                  <ChatMarkdown content={visibleAssistant} />
                                )
                              })()
                            ) : msg.artifactStrip ? (
                              <p
                                style={{
                                  margin: 0,
                                  color: 'var(--color-on-surface-variant)',
                                  fontSize: '13px',
                                  lineHeight: 1.55,
                                }}
                              >
                                {msg.artifactStrip.status === 'streaming'
                                  ? '正在将正文写入中栏主画布…'
                                  : msg.artifactStrip.summary
                                    ? `详细内容已写入中栏主画布（${msg.artifactStrip.summary}）。可点击下方「查看」阅读全文。`
                                    : '详细内容已写入中栏主画布。可点击下方「查看」阅读全文。'}
                              </p>
                            ) : (
                              <ChatMarkdown content={visibleAssistant} />
                            )}
                            {isStreaming && i === messages.length - 1 && !msg.content.includes('__ARTIFACT_PLACEHOLDER__') && (
                              <span style={{
                                display: 'inline-block', width: '2px', height: '13px',
                                background: 'var(--color-primary)', marginLeft: '2px',
                                animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom',
                              }} />
                            )}
                          </div>
                        </div>
                        {msg.artifactStrip && activeSessionId && (
                          <div style={{
                            width: '95%',
                            marginTop: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                            padding: '10px 12px',
                            borderRadius: '10px',
                            border: '1px solid color-mix(in srgb, var(--color-primary) 35%, var(--color-outline-variant))',
                            background: 'color-mix(in srgb, var(--color-primary) 5%, var(--color-surface))',
                          }}>
                            <span style={{ fontSize: '12px', color: 'var(--color-on-surface)', lineHeight: 1.45 }}>
                              📄
                              {' '}
                              {msg.artifactStrip.status === 'streaming'
                                ? '主画布正在更新…'
                                : `主画布已更新${msg.artifactStrip.summary ? ` · ${msg.artifactStrip.summary}` : ''}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const s = msg.artifactStrip
                                if (s && activeSessionId) openStripInCenter(activeSessionId, s)
                              }}
                              style={{
                                flexShrink: 0,
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'var(--color-primary)',
                                color: 'var(--color-on-primary)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              查看
                            </button>
                          </div>
                        )}
                      </>
                    )
                  })()}
                </div>
              )
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

      {/* Input Area */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--color-outline-variant)', background: 'var(--color-surface)', flexShrink: 0 }}>
        {sendHint && (
          <p style={{
            fontSize: '12px',
            color: sendHint.startsWith('Skill') ? 'var(--color-on-surface)' : 'var(--color-error)',
            margin: '0 0 8px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: sendHint.startsWith('Skill')
              ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)'
              : 'color-mix(in srgb, var(--color-error) 12%, transparent)',
          }}>
            {sendHint}
          </p>
        )}
        {forgeDraft && spaceId && (
          <div style={{ padding: '0 16px', marginBottom: '8px' }}>
            <ForgeSuggestionCard
              draft={forgeDraft}
              spaceId={spaceId}
              onAccepted={() => {
                setForgeDraft(null)
                setSendHint('Skill 已保存到当前 Space')
                window.setTimeout(() => setSendHint(null), 2800)
              }}
              onDismissed={() => setForgeDraft(null)}
            />
          </div>
        )}
        <div style={{
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'border-color 150ms, box-shadow 150ms',
          position: 'relative',
          paddingTop: '10px',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent)' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-outline-variant)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <input
            ref={uploadInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              const files = e.target.files
              void handleLibraryFilesChosen(files)
              e.target.value = ''
            }}
          />
          <div
            title={currentDirTitle}
            style={{
              position: 'absolute',
              top: '-10px',
              left: '12px',
              maxWidth: '72%',
              height: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              borderRadius: '999px',
              border: '1px solid var(--color-outline-variant)',
              background: 'var(--color-surface)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              fontSize: '11px',
              color: 'var(--color-on-surface-variant)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {currentDirBadge}
          </div>
          {slashActive && (
            <SlashCommandMenu
              items={filteredSlashSkills}
              emptyMode={skillsForSlash.length === 0 ? 'none' : 'filtered'}
              selectedIndex={Math.min(slashSelectedIndex, Math.max(0, filteredSlashSkills.length - 1))}
              onSelectIndex={setSlashSelectedIndex}
              onPick={(skill) => {
                void applySlashSelection(skill)
              }}
            />
          )}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="咨询 Kevin 或输入 / 唤起命令..."
            rows={2}
            onKeyDown={handleTextareaKeyDown}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', padding: '12px', fontSize: '13px',
              color: 'var(--color-on-surface)', fontFamily: 'var(--font-sans)',
              maxHeight: '128px', overflowY: 'auto',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 10px' }}>
            <div style={{ display: 'flex', gap: '4px', color: 'var(--color-on-surface-variant)' }}>
              <button
                type="button"
                title="上传文件到当前文档库目录"
                onClick={() => uploadInputRef.current?.click()}
                style={{
                  padding: '6px', background: 'transparent', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                  display: 'flex', alignItems: 'center', transition: 'background 150ms',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>attach_file</span>
              </button>
              <button
                type="button"
                title="@ 提及文档库路径"
                onClick={() => setAtPickerOpen(true)}
                style={{
                  padding: '6px', background: 'transparent', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                  display: 'flex', alignItems: 'center', transition: 'background 150ms',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>alternate_email</span>
              </button>
              <button
                type="button"
                title="Slash 命令"
                onClick={() => {
                  insertAtCursor('/')
                }}
                style={{
                  padding: '6px', background: 'transparent', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                  display: 'flex', alignItems: 'center', transition: 'background 150ms',
                  fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-sans)',
                }}
              >
                /
              </button>
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={isStreaming || !input.trim()}
              style={{
                width: '32px', height: '32px',
                background: isStreaming || !input.trim() ? 'var(--color-surface-container)' : 'var(--color-primary)',
                border: 'none', borderRadius: '8px',
                cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
                color: isStreaming || !input.trim() ? 'var(--color-on-surface-variant)' : 'var(--color-on-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 150ms',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_upward</span>
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-on-surface-variant)', marginTop: '6px' }}>
          AI generated content may be inaccurate
        </p>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>

      {spaceId && (
        <AtFilePicker
          spaceId={spaceId}
          libraryId={activeLibraryId}
          open={atPickerOpen}
          onClose={() => setAtPickerOpen(false)}
          onPick={(path) => {
            insertAtCursor(`${path} `)
          }}
        />
      )}
    </div>
  )
}
