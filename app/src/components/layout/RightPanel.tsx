import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL } from '../../config/sidecarUrl'
import { summarizeArtifactMarkdown } from '../../lib/artifactSummary'
import { requestFocusKevinCenter } from '../../lib/focusCenter'
import { QUICK_TEMPLATES } from '../../data/templates'

type ToolCall = { label: string; icon: string }

type ArtifactStrip = {
  id: string
  summary?: string
  status: 'streaming' | 'ready'
  content?: string
}

type Message = {
  role: 'user' | 'ai'
  content: string
  toolCalls?: ToolCall[]
  artifactStrip?: ArtifactStrip
}

type SessionArtifactEntry = {
  id: string
  createdAt: string
  summary: string
  content: string
}

export function RightPanel() {
  const { activeSessionId, createSession, refreshSessions } = useSession()
  const { onArtifactStart, onArtifactDelta, onArtifactEnd, loadArtifact, artifact } = useArtifact()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sendHint, setSendHint] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'quick'>('chat')
  const [artifactsBySession, setArtifactsBySession] = useState<Record<string, SessionArtifactEntry[]>>({})
  const [artifactsRailCollapsed, setArtifactsRailCollapsed] = useState(false)
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  /** When true, skip hydrating chat from Sidecar (avoids wiping optimistic rows right after createSession). */
  const streamingRef = useRef(false)
  const artifactDraftRef = useRef('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        const res = await fetch(`${SIDECAR_URL}/sessions/${activeSessionId}`)
        if (!res.ok || cancelled) return
        const data = await res.json() as {
          messages?: Array<{ role: string; content: string }>
          artifactContent?: string
          updatedAt?: string
        }
        const rows = data.messages ?? []
        const loaded: Message[] = rows.map((m) => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content ?? '',
        }))
        if (!cancelled) setMessages(loaded)

        const sid = activeSessionId
        const art = (data.artifactContent ?? '').trim()
        if (!cancelled && sid) {
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
            }
            const hasP = cur.some((e) => e.id === pid)
            if (hasP) {
              return { ...prev, [sid]: cur.map((e) => (e.id === pid ? entry : e)) }
            }
            return { ...prev, [sid]: [entry, ...cur] }
          })
        }
      } catch {
        if (!cancelled) setMessages([])
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  const openArtifactInCenter = useCallback(
    (sessionId: string, content: string, artifactKey: string) => {
      loadArtifact(sessionId, content)
      setSelectedArtifactId(artifactKey)
      requestFocusKevinCenter()
    },
    [loadArtifact],
  )

  const openStripInCenter = useCallback(
    (sessionId: string, strip: ArtifactStrip) => {
      const body =
        strip.content ??
        (artifact.sessionId === sessionId && artifact.streaming ? artifact.content : '')
      if (body) loadArtifact(sessionId, body)
      setSelectedArtifactId(strip.id)
      requestFocusKevinCenter()
    },
    [artifact.sessionId, artifact.streaming, artifact.content, loadArtifact],
  )

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isStreaming) return

    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = await createSession()
    }

    streamingRef.current = true
    setActiveTab('chat')
    setSendHint(null)
    setMessages(prev => [...prev, { role: 'user', content: trimmed }, { role: 'ai', content: '' }])
    setIsStreaming(true)
    setInput('')

    try {
      const res = await fetch(`${SIDECAR_URL}/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

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
              continue
            }

            if (event.type === 'artifact_start') {
              artifactDraftRef.current = ''
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
              onArtifactEnd()
              refreshSessions()
              setArtifactsBySession(prev => {
                const list = prev[sid] ?? []
                const nextEntry: SessionArtifactEntry = {
                  id: aid,
                  createdAt: new Date().toISOString(),
                  summary,
                  content: snap,
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
              continue
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
              }

              updated[updated.length - 1] = last
              return updated
            })
          } catch {
            // Ignore parse errors from split SSE chunks
          }
        }
      }
    } catch {
      setSendHint('无法连接到 Kevin 服务（Sidecar 未启动？）')
      setMessages(prev => {
        if (prev.length === 0) return prev
        const out = [...prev]
        out[out.length - 1] = {
          role: 'ai',
          content: '⚠️ 无法连接到 Kevin 服务（Sidecar 未启动）',
        }
        return out
      })
      setInput(trimmed)
    } finally {
      streamingRef.current = false
      setIsStreaming(false)
    }
  }, [activeSessionId, isStreaming, createSession, onArtifactStart, onArtifactDelta, onArtifactEnd, refreshSessions])

  const handleSend = () => sendMessage(input)

  const sessionArtifactList = activeSessionId ? (artifactsBySession[activeSessionId] ?? []) : []

  return (
    <div style={{
      height: '100%',
      backgroundColor: 'var(--color-surface-container-lowest)',
      borderLeft: '1px solid var(--color-outline-variant)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--color-outline-variant)',
        backgroundColor: 'var(--color-surface)',
        flexShrink: 0,
      }}>
        {([
          { key: 'chat', label: '对话' },
          { key: 'quick', label: '快速启动' },
        ] as const).map(({ key, label }) => (
          <button
            type="button"
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, padding: '12px', textAlign: 'center',
              fontSize: '13px', fontWeight: 500,
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: activeTab === key ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
              borderBottom: activeTab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'color 150ms, border-color 150ms',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Quick-start tab */}
      {activeTab === 'quick' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', margin: '0 0 4px' }}>
            选择一个场景，Kevin 会自动执行完整流程并在画布区生成产物。
          </p>
          {QUICK_TEMPLATES.map(t => (
            <button
              type="button"
              key={t.id}
              disabled={isStreaming}
              onClick={() => {
                void sendMessage(t.prompt)
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px', borderRadius: '12px', cursor: isStreaming ? 'not-allowed' : 'pointer',
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface-container-lowest)',
                textAlign: 'left', transition: 'background 150ms, border-color 150ms',
                opacity: isStreaming ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!isStreaming) { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)' } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-container-lowest)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-outline-variant)' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '20px', color: 'var(--color-primary)', flexShrink: 0 }}>{t.icon}</span>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-on-surface)' }}>{t.label}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>arrow_forward</span>
            </button>
          ))}
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{
            flexShrink: 0,
            padding: '10px 12px 12px',
            borderBottom: '1px solid var(--color-outline-variant)',
            background: 'var(--color-surface)',
          }}>
            <button
              type="button"
              onClick={() => setArtifactsRailCollapsed(c => !c)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '8px',
                border: '1px solid var(--color-outline-variant)',
                background: 'var(--color-surface-container-lowest)',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-on-surface)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-primary)' }}>inventory_2</span>
              制品
              <span style={{
                marginLeft: '4px',
                fontSize: '11px',
                fontWeight: 500,
                color: 'var(--color-on-surface-variant)',
                background: 'var(--color-surface-container)',
                padding: '2px 8px',
                borderRadius: '999px',
              }}>
                {sessionArtifactList.length}
              </span>
              <span className="material-symbols-outlined" style={{ fontSize: '20px', marginLeft: 'auto', color: 'var(--color-on-surface-variant)' }}>
                {artifactsRailCollapsed ? 'expand_more' : 'expand_less'}
              </span>
            </button>
            {!artifactsRailCollapsed && (
              <div className="custom-scrollbar" style={{ marginTop: '10px', maxHeight: '168px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {!activeSessionId && (
                  <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                    创建或选择会话后，此处列出本轮及历史制品。
                  </p>
                )}
                {activeSessionId && sessionArtifactList.length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)', margin: 0 }}>
                    暂无制品；带 &lt;artifact&gt; 的回复完成后会出现在这里。
                  </p>
                )}
                {sessionArtifactList.map(entry => {
                  const selected = selectedArtifactId === entry.id
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => activeSessionId && openArtifactInCenter(activeSessionId, entry.content, entry.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '4px',
                        textAlign: 'left',
                        padding: '10px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-outline-variant)',
                        borderLeft: selected ? '3px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
                        background: selected ? 'color-mix(in srgb, var(--color-primary) 6%, var(--color-surface))' : 'var(--color-surface-container-lowest)',
                        cursor: 'pointer',
                        transition: 'background 150ms',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>
                        {new Date(entry.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-on-surface)', lineHeight: 1.35 }}>
                        {entry.summary}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 500 }}>
                        打开画布 →
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: 0 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginTop: '40px', color: 'var(--color-on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '36px', opacity: 0.4 }}>smart_toy</span>
                <p style={{ fontSize: '13px', textAlign: 'center', lineHeight: '1.6', opacity: 0.7, maxWidth: '200px' }}>
                  向 Kevin 提问，或在「快速启动」选择一个场景模板。
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              msg.role === 'user' ? (
                <div key={i} style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%' }}>
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
                    const visibleAssistant = msg.content
                      .replace(/\n*__ARTIFACT_PLACEHOLDER__\n*/g, '\n')
                      .replace(/__ARTIFACT_PLACEHOLDER__/g, '')
                      .trimEnd()
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

                          {msg.toolCalls && msg.toolCalls.length > 0 && (
                            <div style={{ marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {msg.toolCalls.map((t, idx) => (
                                <div key={idx} style={{
                                  fontSize: '11px', color: 'var(--color-on-surface-variant)',
                                  background: 'var(--color-surface-container-lowest)',
                                  padding: '3px 8px', borderRadius: '4px',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start',
                                }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>{t.icon}</span>
                                  {t.icon === 'build' ? `Using tool: ${t.label}` : t.label}
                                </div>
                              ))}
                            </div>
                          )}

                          <div style={{ fontSize: '13px', lineHeight: '1.6', color: 'var(--color-on-surface)', whiteSpace: 'pre-wrap' }}>
                            {visibleAssistant}
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
      )}

      {/* Input Area */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--color-outline-variant)', background: 'var(--color-surface)', flexShrink: 0 }}>
        {sendHint && (
          <p style={{
            fontSize: '12px',
            color: 'var(--color-error)',
            margin: '0 0 8px',
            padding: '8px 10px',
            borderRadius: '8px',
            background: 'color-mix(in srgb, var(--color-error) 12%, transparent)',
          }}>
            {sendHint}
          </p>
        )}
        <div style={{
          background: 'var(--color-surface-container-lowest)',
          border: '1px solid var(--color-outline-variant)',
          borderRadius: '12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          transition: 'border-color 150ms, box-shadow 150ms',
        }}
          onFocusCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 0 0 3px color-mix(in srgb, var(--color-primary) 15%, transparent)' }}
          onBlurCapture={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-outline-variant)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="咨询 Kevin 或输入 / 唤起命令..."
            rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            style={{
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', padding: '12px', fontSize: '13px',
              color: 'var(--color-on-surface)', fontFamily: 'var(--font-sans)',
              maxHeight: '128px', overflowY: 'auto',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 12px 10px' }}>
            <div style={{ display: 'flex', gap: '4px', color: 'var(--color-on-surface-variant)' }}>
              {['attach_file', 'alternate_email'].map(icon => (
                <button key={icon} style={{
                  padding: '6px', background: 'transparent', border: 'none',
                  borderRadius: '8px', cursor: 'pointer', color: 'var(--color-on-surface-variant)',
                  display: 'flex', alignItems: 'center', transition: 'background 150ms',
                }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-container)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{icon}</span>
                </button>
              ))}
            </div>
            <button
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
    </div>
  )
}
