import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SkillStore } from './SkillStore'

describe('SkillStore private skill CTA', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [],
      })) as unknown as typeof fetch,
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('disables private skill creation until Forge confirms persistence', () => {
    render(<SkillStore onBack={vi.fn()} />)

    const createButton = screen.getByRole('button', { name: '+ 新建私有 Skill' })
    expect(createButton).toBeDisabled()
    expect(createButton).toHaveAttribute('title', '将通过 Forge 蒸馏后确认落盘')
    expect(screen.getByText('私有 Skill 将通过 Forge 蒸馏后确认落盘。')).toBeInTheDocument()
  })

  it('keeps the private creation CTA disabled after returning to mine tab', () => {
    render(<SkillStore onBack={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: '公共 Skills' }))
    expect(screen.queryByRole('button', { name: '+ 新建私有 Skill' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '我的 Skills' }))
    expect(screen.getByRole('button', { name: '+ 新建私有 Skill' })).toBeDisabled()
  })
})
