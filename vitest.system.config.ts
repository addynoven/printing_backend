import { defineConfig } from 'vitest/config'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '.env') })

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/system/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
})
