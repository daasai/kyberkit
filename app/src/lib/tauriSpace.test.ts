import { describe, expect, it, vi, afterEach } from 'vitest'
import { openAndFocusSpace } from './tauriSpace'

const originalWindow = globalThis.window

describe('openAndFocusSpace', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as { window?: Window }).window = originalWindow
  })

  it('returns false when popup is blocked in browser fallback', async () => {
    ;(globalThis as { window?: unknown }).window = {
      location: { href: 'http://localhost:5173/?space_id=space-a' },
      open: vi.fn(() => null),
    }
    const ok = await openAndFocusSpace('space-b')
    expect(ok).toBe(false)
  })

  it('returns true and focuses popup when browser fallback opens', async () => {
    const focus = vi.fn()
    ;(globalThis as { window?: unknown }).window = {
      location: { href: 'http://localhost:5173/?space_id=space-a' },
      open: vi.fn(() => ({ focus })),
    }
    const ok = await openAndFocusSpace('space-b')
    expect(ok).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
  })
})

