import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RightPanel } from './RightPanel'
import { useSession } from '../../contexts/SessionContext'
import { useArtifact } from '../../contexts/ArtifactContext'

vi.mock('../../contexts/SessionContext', () => ({
  useSession: vi.fn(),
}))

vi.mock('../../contexts/ArtifactContext', () => ({
  useArtifact: vi.fn(),
}))

const SPACE_A = 'a0000000-0000-4000-8000-000000000001'

function baseSessionMock(overrides: Partial<ReturnType<typeof useSession>> = {}) {
  return {
    spaceId: SPACE_A,
    setSpaceId: vi.fn(),
    spaces: [{ id: SPACE_A, label: '默认 Space' }],
    refreshSpaces: vi.fn(async () => [{ id: SPACE_A, label: '默认 Space' }]),
    sessions: [],
    activeSessionId: 's1',
    setActiveSessionId: vi.fn(),
    createSession: vi.fn(async () => 's1'),
    deleteSession: vi.fn(async () => {}),
    refreshSessions: vi.fn(async () => {}),
    pinSession: vi.fn(async () => {}),
    createSpaceLibrary: vi.fn(async () => ({ id: SPACE_A, label: '默认 Space' })),
    updateSpaceDisplayName: vi.fn(async () => {}),
    deleteSpace: vi.fn(async () => {}),
    openSpaceInNewWindow: vi.fn(async () => 'focused' as const),
    ...overrides,
  } as ReturnType<typeof useSession>
}

function baseArtifactMock(overrides: Partial<ReturnType<typeof useArtifact>> = {}) {
  return {
    artifact: { sessionId: null, content: '', streaming: false, savedPath: null, libraryFileRef: null, loadSeq: 0 },
    onArtifactStart: vi.fn(),
    onArtifactDelta: vi.fn(),
    onArtifactEnd: vi.fn(),
    loadArtifact: vi.fn(),
    openLibraryDocument: vi.fn(),
    clearArtifact: vi.fn(),
    setSavedPath: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useArtifact>
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200 })
}

describe('RightPanel', () => {
  beforeEach(() => {
    vi.mocked(useSession).mockReturnValue(baseSessionMock())
    vi.mocked(useArtifact).mockReturnValue(baseArtifactMock())
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/sessions/s1/messages')) {
        return sseResponse([{ type: 'text_delta', text: 'ok' }])
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [], artifactContent: '' }),
      } as Response
    }) as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not host primary artifact canvas; shows session artifact strip (UAT-003)', () => {
    render(<RightPanel />)
    expect(screen.queryByTestId('artifact-primary-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('process-tracker')).toBeInTheDocument()
    expect(screen.getByText('本会话制品')).toBeInTheDocument()
  })

  it('shows context attribution strip', () => {
    render(<RightPanel />)
    expect(screen.getByTestId('context-attribution')).toBeInTheDocument()
  })

  it('keeps sending stable without crashing render', async () => {
    render(<RightPanel />)
    const input = screen.getByPlaceholderText('咨询 Kevin 或输入 / 唤起命令...')
    fireEvent.change(input, { target: { value: 'hello' } })
    expect((input as HTMLTextAreaElement).value).toBe('hello')
    const sendBtn = screen.getByRole('button', { name: 'arrow_upward' })
    await waitFor(() => expect(sendBtn).not.toBeDisabled())
    fireEvent.click(sendBtn)
    await waitFor(() => {
      expect(screen.getByText('hello')).toBeInTheDocument()
      expect(screen.getByText('ok')).toBeInTheDocument()
    })
  })

  it('updates current-dir chip and emits selection when artifact_end carries library_path', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/sessions/s1/messages')) {
        return sseResponse([
          { type: 'artifact_start', artifact_id: 'a1' },
          { type: 'artifact_delta', text: '# Doc' },
          {
            type: 'artifact_end',
            artifact_id: 'a1',
            summary: 'Doc',
            library_path: '@/libraries/lib-1/docs/sub/new.md',
          },
        ])
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [], artifactContent: '' }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const onSelection = vi.fn()
    window.addEventListener('kevin:library-selection', onSelection as EventListener)
    render(<RightPanel />)
    const input = screen.getByPlaceholderText('咨询 Kevin 或输入 / 唤起命令...')
    fireEvent.change(input, { target: { value: 'gen' } })
    const sendBtn = screen.getByRole('button', { name: 'arrow_upward' })
    await waitFor(() => expect(sendBtn).not.toBeDisabled())
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(screen.getByText('docs/sub')).toBeInTheDocument()
      expect(onSelection).toHaveBeenCalled()
    })
    window.removeEventListener('kevin:library-selection', onSelection as EventListener)
  })
})
