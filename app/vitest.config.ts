import { defineConfig } from 'vitest/config'

/** Run from `app/` so React / react-dom resolve to a single copy in app/node_modules. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
