import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SkillStore } from './SkillStore'

const SAMPLE_SPACE = '11111111-1111-4111-8111-111111111111'

const SAMPLE_SKILLS = [
  { name: 'standup-brief', description: 'Daily standup brief', scope: 'space', risk: 'low', allowedTools: [], triggers: ['manual'] },
  { name: 'pdf-to-md', description: 'PDF → Markdown', scope: 'global', risk: 'low', allowedTools: [], triggers: ['manual'] },
  { name: 'feishu-write', description: 'Write Feishu doc', scope: 'space', risk: 'medium', allowedTools: ['artifact.feishu-doc.write'], triggers: ['manual'] },
]

interface FetchCall {
  url: string
  init?: RequestInit
}

function makeFetchMock(): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    calls.push({ url, init })
    if (url.includes('/skills') && (init?.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify(SAMPLE_SKILLS), { status: 200 })
    }
    if (url.includes('/skills/promote') && init?.method === 'POST') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    return new Response('Not Found', { status: 404 })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

describe('SkillStore — private CTA still disabled (legacy guard)', () => {
  beforeEach(() => {
    const { fetch: f } = makeFetchMock()
    vi.stubGlobal('fetch', f)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('disables private skill creation until Forge confirms persistence', async () => {
    render(<SkillStore onBack={vi.fn()} spaceId={SAMPLE_SPACE} />)
    await waitFor(() => expect(screen.getByText('standup-brief')).toBeInTheDocument())
    const createButton = screen.getByRole('button', { name: '+ 新建私有 Skill' })
    expect(createButton).toBeDisabled()
    expect(createButton).toHaveAttribute('title', '将通过 Forge 蒸馏后确认落盘')
  })
})

describe('SkillStore — promote Space skill to User', () => {
  let fetchMock: ReturnType<typeof makeFetchMock>
  beforeEach(() => {
    fetchMock = makeFetchMock()
    vi.stubGlobal('fetch', fetchMock.fetch)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the promote button only on Space-scoped skills under "我的 Skills"', async () => {
    render(<SkillStore onBack={vi.fn()} spaceId={SAMPLE_SPACE} />)
    await waitFor(() => expect(screen.getByText('standup-brief')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: '提升 standup-brief 为用户级' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提升 feishu-write 为用户级' })).toBeInTheDocument()
    // pdf-to-md is global, so even if visible nowhere here we never expose promote.
    expect(screen.queryByRole('button', { name: '提升 pdf-to-md 为用户级' })).not.toBeInTheDocument()
  })

  it('calls POST /skills/promote with skillName + from=space when clicked', async () => {
    render(<SkillStore onBack={vi.fn()} spaceId={SAMPLE_SPACE} />)
    await waitFor(() => expect(screen.getByText('standup-brief')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: '提升 standup-brief 为用户级' }))

    await waitFor(() => {
      const post = fetchMock.calls.find(
        (c) => c.url.includes('/skills/promote') && (c.init?.method ?? '') === 'POST',
      )
      expect(post).toBeDefined()
      expect(post!.url).toContain(`space_id=${SAMPLE_SPACE}`)
      const payload = JSON.parse(String(post!.init!.body))
      expect(payload).toEqual({ skillName: 'standup-brief', from: 'space' })
    })
  })

  it('does not crash when spaceId is null and shows guidance', () => {
    render(<SkillStore onBack={vi.fn()} spaceId={null} />)
    expect(
      screen.getByText('请先在左侧选择一个 Space 以加载它的 Skills。'),
    ).toBeInTheDocument()
  })
})
