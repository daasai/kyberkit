import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll } from 'vitest'

beforeAll(() => {
  if (typeof Element !== 'undefined') {
    Element.prototype.scrollIntoView = () => {}
  }
})

afterEach(() => {
  cleanup()
})
