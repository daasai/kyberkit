import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { SignoffCard } from './SignoffCard'
import type { PendingSignoffTask } from '../../hooks/usePendingSignoffs'

const TASK: PendingSignoffTask = {
  id: 'task-1',
  spaceId: 'space-1',
  state: 'awaiting-signoff',
  skillName: 'feishu-write',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  payload: {
    actuatorId: 'artifact.feishu-doc.write',
    title: 'Daily Brief — 2026-05-09',
    diff: { added: ['+ a', '+ b'], removed: ['- x'], preview: '- old\n+ new\n' },
    sessionId: 'sess-1',
  },
  sessionId: 'sess-1',
}

describe('SignoffCard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders actuator id, title, diff preview, and a 60s countdown', () => {
    render(<SignoffCard task={TASK} onResolve={vi.fn()} />)
    expect(screen.getByText(/artifact.feishu-doc.write/)).toBeInTheDocument()
    expect(screen.getByText(/Daily Brief — 2026-05-09/)).toBeInTheDocument()
    expect(screen.getByLabelText('倒计时 60s')).toBeInTheDocument()
    expect(screen.getByLabelText('Diff 预览').textContent).toContain('+ new')
  })

  it('decrements countdown each second', () => {
    render(<SignoffCard task={TASK} onResolve={vi.fn()} />)
    expect(screen.getByLabelText('倒计时 60s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByLabelText('倒计时 59s')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByLabelText('倒计时 57s')).toBeInTheDocument()
  })

  it('calls onResolve("approved") when 批准 is clicked', async () => {
    vi.useRealTimers()
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<SignoffCard task={TASK} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: '批准' }))
    expect(onResolve).toHaveBeenCalledWith('approved')
  })

  it('calls onResolve("rejected") when 拒绝 is clicked', async () => {
    vi.useRealTimers()
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(<SignoffCard task={TASK} onResolve={onResolve} />)
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }))
    expect(onResolve).toHaveBeenCalledWith('rejected')
  })
})
