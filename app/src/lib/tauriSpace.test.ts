import { describe, expect, it, vi, afterEach } from 'vitest'
import { openAndFocusSpace } from './tauriSpace'

describe('openAndFocusSpace', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(globalThis, 'window')
  })

  it('returns false when popup is blocked in browser fallback', async () => {
    ;(globalThis as { window?: unknown }).window = {
      location: { href: 'http://localhost:5173/?space=space-a' },
      open: vi.fn(() => null),
    }
    const ok = await openAndFocusSpace('space-b')
    expect(ok).toBe(false)
  })

  it('returns true and focuses popup when browser fallback opens', async () => {
    const focus = vi.fn()
    ;(globalThis as { window?: unknown }).window = {
      location: { href: 'http://localhost:5173/?space=space-a' },
      open: vi.fn(() => ({ focus })),
    }
    const ok = await openAndFocusSpace('space-b')
    expect(ok).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
  })
})

