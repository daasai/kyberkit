import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DynamicIsland } from './DynamicIsland'

describe('DynamicIsland', () => {
  it('renders status semantics without input affordance', () => {
    const html = renderToStaticMarkup(
      <DynamicIsland state={{ mode: 'idle', label: 'Session: A' }} />,
    )
    expect(html).toContain('role="status"')
    expect(html).not.toContain('placeholder=')
  })
})

