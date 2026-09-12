import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./apps/web', import.meta.url)) },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/web/**/*.test.ts'],
    fileParallelism: false,
    environment: 'node',
  },
})
