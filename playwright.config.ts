import { defineConfig } from '@playwright/test'

const WEB = 3000, ADMIN = 3100
const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://localhost/miro_dev',
  CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret',
  MIRO_ENABLE_DEV_API: '1',
  /** E2E 는 실제 구글·카카오 계정으로 로그인할 수 없다 — 소셜 로그인만 시뮬레이션으로 돌린다. */
  MIRO_MOCK_OAUTH: '1',
}

/**
 * 두 앱을 띄우고 E2E 를 돈다. 이미 떠 있으면 재사용한다 (로컬 개발).
 * 서버는 `pnpm build` 결과를 사용한다 — CI 는 build 후 실행한다.
 */
export default defineConfig({
  testDir: './e2e',
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
  use: { headless: true, baseURL: `http://localhost:${WEB}`, reducedMotion: 'reduce', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  webServer: [
    { command: `pnpm --filter @miro/web exec next start -p ${WEB}`, port: WEB, reuseExistingServer: true, env, timeout: 60_000 },
    { command: `pnpm --filter @miro/admin exec next start -p ${ADMIN}`, port: ADMIN, reuseExistingServer: true, env, timeout: 60_000 },
  ],
})
