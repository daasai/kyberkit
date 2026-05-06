import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionProvider } from '../../contexts/SessionContext'
import { ArtifactProvider } from '../../contexts/ArtifactContext'
import { RightPanel } from './RightPanel'

function Wrapper() {
  return (
    <SessionProvider>
      <ArtifactProvider>
        <RightPanel />
      </ArtifactProvider>
    </SessionProvider>
  )
}

describe('RightPanel', () => {
  it('does not host primary artifact canvas; shows process tracker', () => {
    render(<Wrapper />)
    expect(screen.queryByTestId('artifact-primary-view')).not.toBeInTheDocument()
    expect(screen.getByTestId('process-tracker')).toBeInTheDocument()
  })

  it('shows context attribution strip', () => {
    render(<Wrapper />)
    expect(screen.getByTestId('context-attribution')).toBeInTheDocument()
  })
})
