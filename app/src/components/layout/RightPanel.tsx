import { useState, useRef, useEffect, useCallback } from 'react'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'
import { SIDECAR_URL } from '../../config/sidecarUrl'

type ToolCall = { label: string; icon: string }
type Message = {
  role: 'user' | 'ai'
  content: string
  toolCalls?: ToolCall[]
}

// Quick-start templates
const QUICK_TEMPLATES = [
  {
    id: 'standup',
    label: '生成今日站会数据',
    icon: 'bar_chart',
    prompt: '请读取 templates/standup-data.md 中的昨日数据，生成一份简洁的今日站会数据卡片，包含关键指标和异常摘要。使用 <artifact>...</artifact> 包裹输出。',
  },
  {
    id: 'spec',
    label: '起草产品升级 Spec',
    icon: 'description',
    prompt: '请读取 templates/standup-data.md 中的业务数据和 templates/product-spec-template.md 模板，基于这些信息为贝易转产品生成一份产品升级 Spec 文档。使用 <artifact>...</artifact> 包裹输出。',
  },
  {
    id: 'rca',
    label: '发起异常 RCA 分析',
    icon: 'bug_report',
    prompt: '请帮我起草一份 RCA 报告模板，包含：问题描述、时间线、根因分析（5 Why）、影响范围、修复方案、预防措施。使用 <artifact>...</artifact> 包裹输出。',
  },
]

export function RightPanel() {
  const { activeSessionId, createSession, refreshSessions } = useSession()
  const { onArtifactStart, onArtifactDelta, onArtifactEnd } = useArtifact()

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sendHint, setSendHint] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'quick'>('chat')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  /** When true, skip hydrating chat from Sidecar (avoids wiping optimistic rows right after createSession). */
  const streamingRef = useRef(false)

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
        const data = await res.json()
        const rows = (data.messages ?? []) as Array<{ role: string; content: string }>
        const loaded: Message[] = rows.map((m) => ({
          role: m.role === 'user' ? 'user' : 'ai',
          content: m.content ?? '',
        }))
        if (!cancelled) setMessages(loaded)
      } catch {
        if (!cancelled) setMessages([])
      }
    }
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

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
            const event = JSON.parse(raw)

            setMessages(prev => {
              if (prev.length === 0) return prev
              const updated = [...prev]
              const last = { ...updated[updated.length - 1] }

              if (event.type === 'text_delta') {
                last.content += event.text
              } else if (event.type === 'artifact_start') {
                onArtifactStart(sessionId!)
                // Show placeholder in chat bubble
                if (!last.content.includes('__ARTIFACT_PLACEHOLDER__')) {
                  last.content += '\n\n__ARTIFACT_PLACEHOLDER__'
                }
              } else if (event.type === 'artifact_delta') {
                onArtifactDelta(event.text)
              } else if (event.type === 'artifact_end') {
                onArtifactEnd()
                refreshSessions()
              } else if (event.type === 'tool_use_start') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: event.toolName, icon: 'build' }]
              } else if (event.type === 'task_narration') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: event.text, icon: 'pending' }]
              } else if (event.type === 'error') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: `错误: ${event.error?.message}`, icon: 'error' }]
              } else if (event.type === 'status' && event.status === 'failed') {
                const calls = last.toolCalls ?? []
                last.toolCalls = [...calls, { label: `系统异常: ${event.message}`, icon: 'warning' }]
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
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                {(msg.content || (msg.toolCalls && msg.toolCalls.length > 0)) ? (
                  <div style={{
                    position: 'relative',
                    background: 'white',
                    border: '1px solid var(--color-outline-variant)',
                    padding: '14px',
                    borderRadius: '16px 16px 16px 4px',
                    width: '95%',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}>
                    {/* AI avatar badge */}
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

                    {/* Tool call trajectory */}
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
                      {msg.content.replace('__ARTIFACT_PLACEHOLDER__', '').trim()
                        ? msg.content.replace('__ARTIFACT_PLACEHOLDER__', '\n\n📄 已更新主画布文档').trim()
                        : msg.content.includes('__ARTIFACT_PLACEHOLDER__') ? '📄 正在生成主画布文档...' : ''}
                      {isStreaming && i === messages.length - 1 && !msg.content.includes('__ARTIFACT_PLACEHOLDER__') && (
                        <span style={{
                          display: 'inline-block', width: '2px', height: '13px',
                          background: 'var(--color-primary)', marginLeft: '2px',
                          animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom',
                        }} />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          ))}
          <div ref={messagesEndRef} />
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
