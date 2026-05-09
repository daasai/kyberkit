import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ForgeSuggestionCard, type ForgeDraft } from './ForgeSuggestionCard'

const SAMPLE_SPACE = '11111111-1111-4111-8111-111111111111'

const DRAFT: ForgeDraft = {
  trigger: 'slash',
  suggestedName: 'site-traffic-analysis',
  suggestedDescription: 'Analyze site traffic anomalies daily',
  bodySeed: '## Steps\n\n1. Pull DW.\n',
}

describe('ForgeSuggestionCard', () => {
  let onAccepted: ReturnType<typeof vi.fn>
  let onDismissed: ReturnType<typeof vi.fn>
  let calls: Array<{ url: string; init?: RequestInit }>

  beforeEach(() => {
    onAccepted = vi.fn()
    onDismissed = vi.fn()
    calls = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        calls.push({ url, init })
        if (url.includes('/skills/forge/accept')) {
          return new Response(JSON.stringify({ ok: true, name: 'site-traffic-analysis' }), { status: 201 })
        }
        return new Response('Not Found', { status: 404 })
      }) as unknown as typeof fetch,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows suggested name and description, lets the user dismiss', () => {
    render(
      <ForgeSuggestionCard
        draft={DRAFT}
        spaceId={SAMPLE_SPACE}
        onAccepted={onAccepted}
        onDismissed={onDismissed}
      />,
    )

    expect(screen.getByDisplayValue('site-traffic-analysis')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Analyze site traffic anomalies daily')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '稍后再说' }))
    expect(onDismissed).toHaveBeenCalled()
  })

  it('toggles body editor when "查看完整 SKILL.md" is clicked', () => {
    render(
      <ForgeSuggestionCard
        draft={DRAFT}
        spaceId={SAMPLE_SPACE}
        onAccepted={onAccepted}
        onDismissed={onDismissed}
      />,
    )

    expect(screen.queryByLabelText('SKILL 正文')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '查看完整 SKILL.md' }))
    expect(screen.getByLabelText('SKILL 正文')).toBeInTheDocument()
  })

  it('POSTs to /skills/forge/accept and notifies parent on success', async () => {
    render(
      <ForgeSuggestionCard
        draft={DRAFT}
        spaceId={SAMPLE_SPACE}
        onAccepted={onAccepted}
        onDismissed={onDismissed}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '留下这个' }))

    await waitFor(() => expect(onAccepted).toHaveBeenCalledWith('site-traffic-analysis'))
    const post = calls.find((c) => c.url.includes('/skills/forge/accept'))
    expect(post).toBeDefined()
    expect(post!.url).toContain(`space_id=${SAMPLE_SPACE}`)
    const payload = JSON.parse(String(post!.init!.body))
    expect(payload.name).toBe('site-traffic-analysis')
    expect(payload.description).toBe('Analyze site traffic anomalies daily')
    expect(payload.body).toContain('## Steps')
  })
})
