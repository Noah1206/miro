import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './tooling/test-database'

const database = testDatabaseUrl(process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined))

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) },
  },
  test: {
    env: { DATABASE_URL: database ?? '' },
    include: ['packages/**/*.test.ts', 'apps/web/**/*.test.ts', 'apps/admin/**/*.test.ts'],
    fileParallelism: false,
    environment: 'node',
  },
})
