import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { testDatabaseUrl } from './tooling/test-database'

const database = testDatabaseUrl(process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined))

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) },
  },
  test: {
    // Legacy fixtures explicitly test the previous policy. Rollout tests opt into the new product default.
    env: { DATABASE_URL: database ?? '', MIRO_CHARACTER_AGENCY_MODE: 'off', MIRO_AGENCY_DEFAULT_POLICY: 'legacy:v1',
      MIRO_FEATURE_STRICT_CONVERSATION_REVIEW: '1' },
    include: ['packages/**/*.test.ts', 'apps/web/**/*.test.ts', 'apps/admin/**/*.test.ts', 'tooling/**/*.test.ts'],
    fileParallelism: false,
    environment: 'node',
  },
})
