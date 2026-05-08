import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionProvider, useSession } from './SessionContext'

const SID = 'a0000000-0000-4000-8000-000000000001'

function Probe() {
  const { spaceId } = useSession()
  return <div data-testid="space">{spaceId}</div>
}

describe('SessionContext', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    localStorage.clear()
  })

  it('starts with empty spaceId when URL and storage lack a UUID', () => {
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByTestId('space').textContent).toBe('')
  })

  it('reads a valid UUID from ?space_id=', () => {
    window.history.replaceState({}, '', `/?space_id=${SID}`)
    render(<SessionProvider><Probe /></SessionProvider>)
    expect(screen.getByTestId('space').textContent).toBe(SID)
    expect(localStorage.getItem('kevin:active-space-id')).toBe(SID)
  })
})
