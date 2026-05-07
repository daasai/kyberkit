import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AccountMenu } from './AccountMenu'

describe('AccountMenu', () => {
  it('renders user info and reset button when open', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    render(
      <AccountMenu
        open={true}
        onClose={vi.fn()}
        anchorRef={ref}
        userName="Shawn"
        userEmail="shawn@example.com"
        onResetConfig={vi.fn()}
      />
    )
    expect(screen.getByText('Shawn')).toBeInTheDocument()
    expect(screen.getByText('shawn@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /重置配置/i })).toBeInTheDocument()
  })

  it('is hidden when not open', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    render(
      <AccountMenu open={false} onClose={vi.fn()} anchorRef={ref} userName="Shawn" onResetConfig={vi.fn()} />
    )
    expect(screen.queryByText('Shawn')).not.toBeInTheDocument()
  })

  it('calls onClose when Escape pressed', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    const onClose = vi.fn()
    render(<AccountMenu open={true} onClose={onClose} anchorRef={ref} userName="U" onResetConfig={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onResetConfig when 重置配置 clicked', () => {
    const ref = { current: null } as React.RefObject<HTMLButtonElement>
    const onReset = vi.fn()
    render(<AccountMenu open={true} onClose={vi.fn()} anchorRef={ref} userName="U" onResetConfig={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: /重置配置/i }))
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
