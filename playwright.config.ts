import { defineConfig } from '@playwright/test'
import { testDatabaseUrl } from './tooling/test-database'

const database = testDatabaseUrl(process.env.TEST_DATABASE_URL ?? (process.env.CI ? process.env.DATABASE_URL : undefined))
if (!database) throw new Error('Set TEST_DATABASE_URL to a local test database before running E2E.')
const WEB = Number(process.env.E2E_WEB_PORT ?? 3200), ADMIN = Number(process.env.E2E_ADMIN_PORT ?? 3300)
process.env.E2E_BASE = `http://localhost:${WEB}`
process.env.E2E_ADMIN = `http://localhost:${ADMIN}`
const env = {
  MIRO_TEST_MODE: '1',
  MIRO_MODE: 'production', MIRO_FEATURE_INLINE_REALITY: '1', MIRO_FEATURE_REALITY_MESSAGE: '1',
  DATABASE_URL: database,
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret',
  MIRO_ENABLE_DEV_API: '1',
  /** E2E 는 실제 구글·카카오 계정으로 로그인할 수 없다 — 소셜 로그인만 시뮬레이션으로 돌린다. */
  MIRO_MOCK_OAUTH: '1',
  AI_PROVIDER: 'mock', AI_FALLBACK_PROVIDER: '', MIRO_MODEL_REGISTRY: '',
  REPLICATE_API_TOKEN: '', LIVEKIT_API_KEY: '', STRIPE_SECRET_KEY: '',
  AI_DAILY_BUDGET: '0', AI_DAILY_REQUEST_LIMIT: '10000',
  AUTH_BASE_URL: `http://localhost:${WEB}`,
  MIRO_CANARY_MODEL: '', MIRO_SHADOW_MODEL: '', MIRO_EVAL_SAMPLE_PERCENT: '0',
  /** 계좌이체 수납 E2E. 실제 계좌가 아니며, 승인해도 실제 돈은 움직이지 않는다. */
  MIRO_BANK_ACCOUNT: JSON.stringify({ bank: 'E2E은행', number: '000-000-0000', holder: 'MIRO' }),
}

/**
 * 전용 테스트 DB와 별도 포트로 두 앱을 띄운다. 실행 중인 사용자 앱은 재사용하지 않는다.
 * 서버는 `pnpm build` 결과를 사용한다 — CI 는 build 후 실행한다.
 */
export default defineConfig({
  testDir: './e2e',
  /** 테스트 DB 스키마를 먼저 세운다 — 없으면 51개가 전부 이유 없는 타임아웃으로 죽는다. */
  globalSetup: './e2e/global-setup.ts',
  /**
   * 원격 DB(Supabase) 기준. 같은 테스트가 단독이면 8~13초, 병렬이면 그 2~4배까지 늘어난다 —
   * 왕복 지연이 워커 수만큼 겹치기 때문이다. 30초로는 여유가 없어 간헐적으로 터졌다.
   */
  timeout: 60_000,
  /** 느린 것은 실패가 아니라 경고로 먼저 보이게 한다. */
  expect: { timeout: 10_000 },
  /** 흔들림은 재시도로 덮지 않고 드러내되, 한 번은 봐준다 (네트워크는 실제로 튄다). */
  retries: 1,
  /** 워커가 늘수록 DB 왕복이 겹친다. 코어 수가 아니라 DB 가 한계다. */
  workers: process.env.CI ? 2 : 3,
  // reducedMotion: Motion/CSS 가 즉시 최종 상태로 가므로 타이밍이 테스트를 흔들지 않는다.
  // 모바일 우선 제품이므로 기본 뷰포트도 모바일. 데스크톱 레이아웃은 별도 프로젝트로 추가할 수 있다.
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure', headless: true, baseURL: `http://localhost:${WEB}`, reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: [
    { command: `pnpm --filter @miro/web exec next start -p ${WEB}`, port: WEB, reuseExistingServer: false, env, timeout: 60_000 },
    { command: `pnpm --filter @miro/admin exec next start -p ${ADMIN}`, port: ADMIN, reuseExistingServer: false, env, timeout: 60_000 },
  ],
})
