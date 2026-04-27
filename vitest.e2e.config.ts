import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '.env.test') })

export default defineConfig({
  test: {
    globals:      true,
    environment:  'node',
    setupFiles:   ['./tests/setup.ts'],
    include:      ['tests/e2e/**/*.e2e.ts'],
    testTimeout:  30_000,
    hookTimeout:  60_000,
    coverage: {
      reporter: ['text', 'lcov'],
      include:  ['src/**/*.ts'],
      exclude:  ['src/**/*.test.ts'],
    },
  },
})
