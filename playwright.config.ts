import { defineConfig } from '@playwright/test'

const WEB = 3000, ADMIN = 3100
const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost/miro_dev',
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret',
  MIRO_ENABLE_DEV_API: '1',
}

/**
 * 두 앱을 띄우고 E2E 를 돈다. 이미 떠 있으면 재사용한다 (로컬 개발).
 * 서버는 `pnpm build` 결과를 사용한다 — CI 는 build 후 실행한다.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: { headless: true, baseURL: `http://localhost:${WEB}` },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: [
    { command: `pnpm --filter @miro/web exec next start -p ${WEB}`, port: WEB, reuseExistingServer: true, env, timeout: 60_000 },
    { command: `pnpm --filter @miro/admin exec next start -p ${ADMIN}`, port: ADMIN, reuseExistingServer: true, env, timeout: 60_000 },
  ],
})
