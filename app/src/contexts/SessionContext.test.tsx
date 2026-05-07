import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionContext'

function Probe() {
  const { spaceId } = useSession()
  return <div data-testid="space">{spaceId}</div>
}

describe('SessionContext', () => {
  it('exposes spaceId with default value', () => {
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByTestId('space').textContent).toBe('default')
  })
})
